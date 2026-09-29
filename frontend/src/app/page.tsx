"use client";

import { useEffect, useRef, useState } from "react";

import {
  FlashAnalysisPanel,
  type AnalysisState,
} from "@/components/analysis/flash-analysis-panel";
import { CaliforniaMap } from "@/components/map/california-map";
import { SearchPanel } from "@/components/search/search-panel";
import { TopBar } from "@/components/shell/top-bar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  ApiError,
  analyzeFlash,
  fetchFlashReconstruction,
  searchGlmFlashes,
  type AnalyzeFlashResponse,
  type GlmFlash,
  type GlmFlashReconstruction,
} from "@/lib/api";
import {
  formatCoordinates,
  isInsideCalifornia,
  parseCoordinateInput,
} from "@/lib/california";
import type { PlaceSuggestion } from "@/lib/california-places";
import { GLM_PLAYBACK_SLOWDOWN } from "@/lib/flash-playback";
import {
  buildLightningSearchRequest,
  createEmptySearchSetup,
  toUtcIsoDatetime,
  type ActiveInvestigation,
  type LightningSearchSetup,
  type SearchRadiusKm,
  type SearchWindowMinutes,
  type SelectedSearchLocation,
} from "@/lib/search";

type ReconstructionState = "idle" | "loading" | "ready" | "error";

type PendingGuard =
  | { kind: "switch-flash"; flash: GlmFlash }
  | { kind: "find-lightning" }
  | { kind: "change-search-area" }
  | null;

const ANALYSIS_CLOSE_WARNING =
  "Your current analysis will be closed. Returning to this flash later may require running the analysis again.";

export default function Home() {
  const [setup, setSetup] = useState<LightningSearchSetup>(createEmptySearchSetup);
  const [locationText, setLocationText] = useState("");
  const [focusNonce, setFocusNonce] = useState(0);
  const [flashes, setFlashes] = useState<GlmFlash[]>([]);
  const [selectedFlashId, setSelectedFlashId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Ready to search");
  const [reconstruction, setReconstruction] = useState<GlmFlashReconstruction | null>(null);
  const [reconstructionState, setReconstructionState] = useState<ReconstructionState>("idle");
  const [reconstructionError, setReconstructionError] = useState<string | null>(null);
  const [playbackGlmMs, setPlaybackGlmMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reconstructionFocus, setReconstructionFocus] = useState(false);
  const [reconstructionCameraNonce, setReconstructionCameraNonce] = useState(0);
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [analysisResult, setAnalysisResult] = useState<AnalyzeFlashResponse | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  /** Location/radius that produced the currently displayed flashes (if any). */
  const [activeInvestigation, setActiveInvestigation] = useState<ActiveInvestigation | null>(
    null,
  );
  const [pendingGuard, setPendingGuard] = useState<PendingGuard>(null);

  const searchAbortRef = useRef<AbortController | null>(null);
  const reconstructionAbortRef = useRef<AbortController | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const selectedFlashIdRef = useRef<string | null>(null);
  const flashesRef = useRef(flashes);
  const reconstructionFocusRef = useRef(false);
  const analysisReadyRef = useRef(false);

  const selectedFlash =
    flashes.find((flash) => flash.global_flash_id === selectedFlashId) ?? null;
  const investigationActive = activeInvestigation !== null;
  const mapLocation = activeInvestigation?.location ?? setup.location;
  const mapRadiusKm = activeInvestigation?.radiusKm ?? setup.radiusKm;
  const analysisReady = analysisState === "ready";

  useEffect(() => {
    selectedFlashIdRef.current = selectedFlashId;
  }, [selectedFlashId]);

  useEffect(() => {
    flashesRef.current = flashes;
  }, [flashes]);

  useEffect(() => {
    reconstructionFocusRef.current = reconstructionFocus;
  }, [reconstructionFocus]);

  useEffect(() => {
    analysisReadyRef.current = analysisReady;
  }, [analysisReady]);

  // Fetch reconstruction for the current selection. Reset/loading state is set by
  // selection handlers so this effect does not synchronously cascade setState.
  useEffect(() => {
    if (!selectedFlashId) return;

    const flash = flashesRef.current.find((item) => item.global_flash_id === selectedFlashId);
    if (!flash) return;

    const controller = new AbortController();
    reconstructionAbortRef.current = controller;
    const requestId = flash.global_flash_id;

    void fetchFlashReconstruction(flash.source_file, flash.flash_id, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        if (selectedFlashIdRef.current !== requestId) return;
        setReconstruction(data);
        setReconstructionState("ready");
        setPlaybackGlmMs(0);
        setPlaying(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (selectedFlashIdRef.current !== requestId) return;
        setReconstruction(null);
        setReconstructionState("error");
        setPlaying(false);
        setReconstructionFocus(false);
        if (error instanceof ApiError) {
          setReconstructionError(error.message);
        } else if (error instanceof Error) {
          setReconstructionError(error.message || "Flash reconstruction failed.");
        } else {
          setReconstructionError("Flash reconstruction failed.");
        }
      });

    return () => {
      controller.abort();
    };
  }, [selectedFlashId]);

  // Advance playback along the real GLM timeline, slowed for viewing.
  useEffect(() => {
    if (!playing || !reconstruction) return;

    let frame = 0;
    let last = performance.now();
    const end = reconstruction.animation_end_ms;

    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      let reachedEnd = false;
      setPlaybackGlmMs((prev) => {
        const next = Math.min(end, prev + dt / GLM_PLAYBACK_SLOWDOWN);
        reachedEnd = next >= end;
        return next;
      });
      if (reachedEnd) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, reconstruction]);

  const clearAnalysis = () => {
    analysisAbortRef.current?.abort();
    analysisAbortRef.current = null;
    setAnalysisState("idle");
    setAnalysisResult(null);
    setAnalysisError(null);
  };

  const clearSelection = () => {
    reconstructionAbortRef.current?.abort();
    clearAnalysis();
    setSelectedFlashId(null);
    setReconstruction(null);
    setReconstructionState("idle");
    setReconstructionError(null);
    setPlaying(false);
    setPlaybackGlmMs(0);
    setReconstructionFocus(false);
  };

  const applyFlashSelection = (flash: GlmFlash) => {
    reconstructionAbortRef.current?.abort();
    clearAnalysis();
    setPlaying(false);
    setPlaybackGlmMs(0);
    setReconstruction(null);
    setReconstructionState("loading");
    setReconstructionError(null);
    setReconstructionFocus(false);
    setSelectedFlashId(flash.global_flash_id);
  };

  const selectFlash = (flash: GlmFlash) => {
    if (flash.global_flash_id === selectedFlashIdRef.current) return;
    if (analysisReadyRef.current) {
      setPendingGuard({ kind: "switch-flash", flash });
      return;
    }
    applyFlashSelection(flash);
  };

  const handleAnalyze = () => {
    const flash = selectedFlash;
    if (!flash || analysisState === "loading") return;

    analysisAbortRef.current?.abort();
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    const requestId = flash.global_flash_id;

    setAnalysisState("loading");
    setAnalysisResult(null);
    setAnalysisError(null);

    void analyzeFlash(flash.source_file, flash.flash_id, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        if (selectedFlashIdRef.current !== requestId) return;
        setAnalysisResult(data);
        setAnalysisState("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (selectedFlashIdRef.current !== requestId) return;
        setAnalysisResult(null);
        setAnalysisState("error");
        if (error instanceof ApiError) {
          setAnalysisError(error.message);
        } else if (error instanceof Error) {
          setAnalysisError(error.message || "Analyze failed.");
        } else {
          setAnalysisError("Analyze failed.");
        }
      });
  };

  const beginReconstructionPlayback = (fromStart: boolean) => {
    if (!reconstruction) return;
    if (fromStart) setPlaybackGlmMs(0);
    if (!reconstructionFocusRef.current) {
      setReconstructionFocus(true);
      setReconstructionCameraNonce((value) => value + 1);
    }
    setPlaying(true);
  };

  /** Clear recon visualization only — keep selection + loaded reconstruction data. */
  const resetReconstructionView = () => {
    setPlaying(false);
    setPlaybackGlmMs(0);
    setReconstructionFocus(false);
  };

  const applyLocation = (location: SelectedSearchLocation, options?: { focus?: boolean }) => {
    if (activeInvestigation) return;
    setSetup((current) => ({ ...current, location }));
    setLocationText(location.label);
    if (options?.focus) setFocusNonce((value) => value + 1);
  };

  const handleMapSelect = (point: { lng: number; lat: number }) => {
    applyLocation({
      ...point,
      label: formatCoordinates(point),
      source: "map",
    });
  };

  const handlePlaceSelect = (place: PlaceSuggestion) => {
    if (activeInvestigation) return;
    if (!isInsideCalifornia(place.lng, place.lat)) return;
    applyLocation(
      {
        lng: place.lng,
        lat: place.lat,
        label: place.label,
        source: "place",
      },
      { focus: true },
    );
  };

  const handleLocationTextChange = (value: string) => {
    if (activeInvestigation) return;
    setLocationText(value);

    const parsed = parseCoordinateInput(value);
    if (parsed && isInsideCalifornia(parsed.lng, parsed.lat)) {
      setSetup((current) => ({
        ...current,
        location: {
          ...parsed,
          label: formatCoordinates(parsed),
          source: "coordinates",
        },
      }));
      return;
    }

    setSetup((current) => {
      if (!current.location) return current;
      if (value.trim() === "") {
        return { ...current, location: null };
      }
      return current;
    });
  };

  const runLightningSearch = async () => {
    const request = buildLightningSearchRequest(setup);
    if (!request || searching) return;

    searchAbortRef.current?.abort();
    reconstructionAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setFlashes([]);
    clearSelection();
    setSearching(true);
    setStatusMessage("Searching GOES-18 GLM archive…");

    try {
      const result = await searchGlmFlashes(
        {
          latitude: request.latitude,
          longitude: request.longitude,
          datetimeUtc: toUtcIsoDatetime(request.date, request.time),
          windowMinutes: request.windowMinutes,
          radiusKm: request.radiusKm,
        },
        controller.signal,
      );

      if (controller.signal.aborted) return;

      // Commit the geometry that produced these results (even if count is 0).
      if (setup.location) {
        setActiveInvestigation({
          location: setup.location,
          radiusKm: request.radiusKm,
        });
      }

      setFlashes(result.flashes);
      if (result.count === 0) {
        setStatusMessage("No lightning flashes found in this area and time window.");
      } else {
        setStatusMessage(
          result.count === 1
            ? "Found 1 lightning flash."
            : `Found ${result.count} lightning flashes.`,
        );
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setFlashes([]);
      clearSelection();
      // Keep any prior investigation only if this was a re-search failure?
      // Failed search should not invent results; clear investigation so map
      // configuration is available again for retry.
      setActiveInvestigation(null);
      if (error instanceof ApiError) {
        setStatusMessage(error.message);
      } else if (error instanceof Error) {
        setStatusMessage(error.message || "Lightning search failed.");
      } else {
        setStatusMessage("Lightning search failed.");
      }
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  };

  const handleFindLightning = () => {
    if (searching) return;
    if (analysisReady) {
      setPendingGuard({ kind: "find-lightning" });
      return;
    }
    void runLightningSearch();
  };

  const beginChangeSearchArea = () => {
    searchAbortRef.current?.abort();
    clearSelection();
    setFlashes([]);
    setActiveInvestigation(null);
    setStatusMessage("Choose a new search location and radius, then find lightning.");
  };

  const handleChangeSearchArea = () => {
    if (searching) return;
    if (analysisReady) {
      setPendingGuard({ kind: "change-search-area" });
      return;
    }
    beginChangeSearchArea();
  };

  const dismissGuard = () => setPendingGuard(null);

  const confirmGuard = () => {
    const pending = pendingGuard;
    setPendingGuard(null);
    if (!pending) return;

    if (pending.kind === "switch-flash") {
      applyFlashSelection(pending.flash);
      return;
    }
    if (pending.kind === "find-lightning") {
      void runLightningSearch();
      return;
    }
    if (pending.kind === "change-search-area") {
      beginChangeSearchArea();
    }
  };

  const guardTitle =
    pendingGuard?.kind === "switch-flash"
      ? "Switch selected flash?"
      : pendingGuard?.kind === "find-lightning"
        ? "Start a new lightning search?"
        : pendingGuard?.kind === "change-search-area"
          ? "Change search area?"
          : "";

  const guardConfirmLabel =
    pendingGuard?.kind === "switch-flash"
      ? "Switch Flash"
      : pendingGuard?.kind === "find-lightning"
        ? "Start New Search"
        : pendingGuard?.kind === "change-search-area"
          ? "Change Search Area"
          : "Continue";

  const guardCancelLabel =
    pendingGuard?.kind === "switch-flash" ? "Keep Current Analysis" : "Keep Current Analysis";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <TopBar />
      <main className="relative min-h-0 flex-1">
        <CaliforniaMap
          selectedLocation={mapLocation}
          searchRadiusKm={mapRadiusKm}
          flashes={flashes}
          selectedFlashId={selectedFlashId}
          reconstruction={reconstruction}
          playbackGlmMs={playbackGlmMs}
          reconstructionFocus={reconstructionFocus}
          reconstructionCameraNonce={reconstructionCameraNonce}
          focusNonce={focusNonce}
          allowMapLocationPick={!investigationActive}
          onSelectLocation={handleMapSelect}
          onSelectFlash={selectFlash}
          onDeselectFlash={clearSelection}
        />
        <div className="pointer-events-none absolute inset-0 z-10">
          <SearchPanel
            className="pointer-events-auto absolute top-4 left-4 max-h-[calc(100%-8.75rem)] w-[min(20.5rem,calc(100%-2rem))] overflow-y-auto xl:max-h-[calc(100%-2rem)]"
            setup={setup}
            locationText={locationText}
            searching={searching}
            statusMessage={statusMessage}
            investigationActive={investigationActive}
            onLocationTextChange={handleLocationTextChange}
            onSelectPlace={handlePlaceSelect}
            onDateChange={(date) => setSetup((current) => ({ ...current, date }))}
            onTimeChange={(time) => setSetup((current) => ({ ...current, time }))}
            onWindowChange={(windowMinutes: SearchWindowMinutes) =>
              setSetup((current) => ({ ...current, windowMinutes }))
            }
            onRadiusChange={(radiusKm: SearchRadiusKm) => {
              if (activeInvestigation) return;
              setSetup((current) => ({ ...current, radiusKm }));
            }}
            onFindLightning={handleFindLightning}
            onChangeSearchArea={handleChangeSearchArea}
          />
          <FlashAnalysisPanel
            className="pointer-events-auto absolute right-4 bottom-4 left-4 max-h-[calc(100%-8.75rem)] overflow-y-auto xl:top-4 xl:right-4 xl:bottom-auto xl:left-auto xl:max-h-[calc(100%-2rem)] xl:w-[min(22.5rem,calc(100%-2rem))] 2xl:w-[23.5rem]"
            flash={selectedFlash}
            reconstruction={reconstruction}
            reconstructionState={reconstructionState}
            reconstructionError={reconstructionError}
            analysisState={analysisState}
            analysisResult={analysisResult}
            analysisError={analysisError}
            playbackGlmMs={playbackGlmMs}
            playing={playing}
            reconstructionActive={reconstructionFocus}
            onClearSelection={clearSelection}
            onAnalyze={handleAnalyze}
            onPlay={() => beginReconstructionPlayback(false)}
            onPause={() => setPlaying(false)}
            onReplay={() => beginReconstructionPlayback(true)}
            onReset={resetReconstructionView}
            onSeekGlmMs={(ms) => {
              setPlaybackGlmMs(ms);
              setPlaying(false);
            }}
          />
        </div>
        <ConfirmDialog
          open={pendingGuard !== null}
          title={guardTitle}
          description={ANALYSIS_CLOSE_WARNING}
          cancelLabel={guardCancelLabel}
          confirmLabel={guardConfirmLabel}
          onCancel={dismissGuard}
          onConfirm={confirmGuard}
        />
      </main>
    </div>
  );
}
