"use client";

import { useEffect, useRef, useState } from "react";

import { FlashAnalysisPanel, type AnalysisState } from "@/components/analysis/flash-analysis-panel";
import { MultiFlashPanel } from "@/components/analysis/multi-flash-panel";
import { MultiFlashReport } from "@/components/analysis/multi-flash-report";
import { CaliforniaMap } from "@/components/map/california-map";
import { SearchPanel } from "@/components/search/search-panel";
import { LandingPage } from "@/components/shell/landing-page";
import { TopBar } from "@/components/shell/top-bar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  ApiError,
  analyzeFlash,
  fetchFlashReconstruction,
  fetchSentinelPreview,
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
  analyzeFlashesSequentially,
  selectAllReturnedFlashes,
  toggleFlashSelection,
  type MultiFlashJob,
} from "@/lib/multi-flash-selection";
import {
  analysisForReportDrillDown,
  buildReportSources,
  createReportNav,
  reportReadyOnMap,
  isMultiFlashRunFinished,
  openReportFlash,
  rankMultiFlashReport,
  returnReportToMap,
  returnToReport,
  showReport,
  type ReportNav,
} from "@/lib/multi-flash-report";
import { loadSentinel, sentinelCacheKey, settleWithSentinel } from "@/lib/sentinel-session";
import {
  buildLightningSearchRequest,
  createEmptySearchSetup,
  describeSearchRadius,
  describeSearchWindow,
  toUtcIsoDatetime,
  type ActiveInvestigation,
  type LightningSearchSetup,
  type SearchRadiusKm,
  type SearchWindowMinutes,
  type SelectedSearchLocation,
} from "@/lib/search";
import { cn } from "cn";

type ReconstructionState = "idle" | "loading" | "ready" | "error";

type PendingGuard =
  | { kind: "switch-flash"; flash: GlmFlash }
  | { kind: "find-lightning" }
  | { kind: "change-search-area" }
  | { kind: "close-analysis" }
  | { kind: "enter-multi-select" }
  | { kind: "exit-multi" }
  | null;

type CommittedSearch = {
  label: string;
  date: string;
  time: string;
  windowMinutes: SearchWindowMinutes;
  radiusKm: SearchRadiusKm;
};

const ANALYSIS_CLOSE_WARNING =
  "Your current analysis will be closed. Returning to this flash later may require running the analysis again.";

const CLOSE_ANALYSIS_WARNING =
  "Closing the analysis will return to the lightning search. Returning to this flash later may require running the analysis again.";

function startSentinelRetrieval(flash: Pick<GlmFlash, "global_flash_id" | "flash_lat" | "flash_lon" | "flash_start_time">) {
  return loadSentinel(sentinelCacheKey(flash.global_flash_id), () =>
    fetchSentinelPreview({
      flashLat: flash.flash_lat,
      flashLon: flash.flash_lon,
      flashTimestampUtc: flash.flash_start_time,
    }),
  );
}

export default function Home() {
  const [setup, setSetup] = useState<LightningSearchSetup>(createEmptySearchSetup);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
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
  const [committedSearch, setCommittedSearch] = useState<CommittedSearch | null>(null);
  const [pendingGuard, setPendingGuard] = useState<PendingGuard>(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([]);
  const [multiJobs, setMultiJobs] = useState<MultiFlashJob[] | null>(null);
  const [multiResults, setMultiResults] = useState<Record<string, AnalyzeFlashResponse>>({});
  const [multiRunning, setMultiRunning] = useState(false);
  const [multiLimitMessage, setMultiLimitMessage] = useState<string | null>(null);
  const [reportNav, setReportNav] = useState<ReportNav | null>(null);

  const searchAbortRef = useRef<AbortController | null>(null);
  const reconstructionAbortRef = useRef<AbortController | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const multiAbortRef = useRef<AbortController | null>(null);
  const selectedFlashIdRef = useRef<string | null>(null);
  const flashesRef = useRef(flashes);
  const reconstructionFocusRef = useRef(false);
  const analysisReadyRef = useRef(false);
  const multiModeRef = useRef(false);
  const multiRunningRef = useRef(false);
  const multiProtectedRef = useRef(false);
  const multiSelectedRef = useRef<string[]>([]);
  const multiJobsRef = useRef<MultiFlashJob[] | null>(null);
  const multiResultsRef = useRef<Record<string, AnalyzeFlashResponse>>({});
  const reportNavRef = useRef<ReportNav | null>(null);

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

  useEffect(() => {
    multiModeRef.current = multiSelectMode;
    multiRunningRef.current = multiRunning;
    multiSelectedRef.current = multiSelectedIds;
    multiJobsRef.current = multiJobs;
    multiResultsRef.current = multiResults;
    reportNavRef.current = reportNav;
    multiProtectedRef.current =
      multiRunning ||
      (multiJobs?.some((job) => job.status === "completed" || job.status === "failed") ?? false);
  }, [multiSelectMode, multiRunning, multiJobs, multiSelectedIds, multiResults, reportNav]);

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

  /** Guard the investigation close control when a completed analysis is present. */
  const requestClearSelection = () => {
    if (analysisReadyRef.current) {
      setPendingGuard({ kind: "close-analysis" });
      return;
    }
    clearSelection();
  };

  const clearMultiSelect = () => {
    multiAbortRef.current?.abort();
    multiAbortRef.current = null;
    multiModeRef.current = false;
    multiRunningRef.current = false;
    multiSelectedRef.current = [];
    multiJobsRef.current = null;
    multiResultsRef.current = {};
    reportNavRef.current = null;
    multiProtectedRef.current = false;
    setMultiSelectMode(false);
    setMultiSelectedIds([]);
    setMultiJobs(null);
    setMultiResults({});
    setMultiRunning(false);
    setMultiLimitMessage(null);
    setReportNav(null);
  };

  const beginMultiSelect = () => {
    clearSelection();
    multiAbortRef.current?.abort();
    multiAbortRef.current = null;
    multiModeRef.current = true;
    multiRunningRef.current = false;
    multiSelectedRef.current = [];
    multiJobsRef.current = null;
    multiResultsRef.current = {};
    reportNavRef.current = null;
    multiProtectedRef.current = false;
    setMultiSelectMode(true);
    setMultiSelectedIds([]);
    setMultiJobs(null);
    setMultiResults({});
    setMultiRunning(false);
    setMultiLimitMessage(null);
    setReportNav(null);
  };

  const requestMultiSelect = () => {
    if (flashesRef.current.length === 0 || multiModeRef.current) return;
    if (analysisReadyRef.current) {
      setPendingGuard({ kind: "enter-multi-select" });
      return;
    }
    beginMultiSelect();
  };

  const toggleMultiFlash = (flash: GlmFlash) => {
    if (!multiModeRef.current || multiRunningRef.current) return;
    if (isMultiFlashRunFinished(multiJobsRef.current)) return;
    const next = toggleFlashSelection(multiSelectedRef.current, flash.global_flash_id);
    multiSelectedRef.current = next.selectedIds;
    setMultiLimitMessage(next.atLimit ? "Select up to 10 flashes." : null);
    setMultiJobs(null);
    setMultiSelectedIds(next.selectedIds);
  };

  const selectAllMultiFlashes = () => {
    if (!multiModeRef.current || multiRunningRef.current) return;
    if (isMultiFlashRunFinished(multiJobsRef.current)) return;
    const ids = selectAllReturnedFlashes(flashesRef.current.map((flash) => flash.global_flash_id));
    if (!ids) return;
    multiSelectedRef.current = ids;
    setMultiJobs(null);
    setMultiLimitMessage(null);
    setMultiSelectedIds(ids);
  };

  const runMultiAnalysis = () => {
    if (!multiModeRef.current || multiRunningRef.current || multiSelectedIds.length === 0) return;
    if (isMultiFlashRunFinished(multiJobsRef.current)) return;
    const ids = [...multiSelectedIds];
    multiAbortRef.current?.abort();
    const controller = new AbortController();
    multiAbortRef.current = controller;
    multiRunningRef.current = true;
    multiProtectedRef.current = true;
    setMultiRunning(true);
    setMultiResults({});
    multiResultsRef.current = {};
    void analyzeFlashesSequentially(
      ids,
      async (globalFlashId, signal) => {
        const flash = flashesRef.current.find((item) => item.global_flash_id === globalFlashId);
        if (!flash) throw new Error("Selected flash is no longer in the search results.");
        const data = await settleWithSentinel(
          analyzeFlash(flash.source_file, flash.flash_id, signal),
          startSentinelRetrieval(flash),
        );
        multiResultsRef.current = { ...multiResultsRef.current, [globalFlashId]: data };
        setMultiResults(multiResultsRef.current);
        return { modelScore: data.model_score };
      },
      (jobs) => {
        if (multiAbortRef.current !== controller) return;
        multiJobsRef.current = jobs;
        multiProtectedRef.current =
          multiRunningRef.current ||
          jobs.some((job) => job.status === "completed" || job.status === "failed");
        setMultiJobs(jobs);
      },
      controller.signal,
    ).then((jobs) => {
      if (multiAbortRef.current !== controller) return;
      if (isMultiFlashRunFinished(jobs)) {
        const nav = reportReadyOnMap();
        reportNavRef.current = nav;
        setReportNav(nav);
      }
    }).finally(() => {
      if (multiAbortRef.current !== controller) return;
      multiRunningRef.current = false;
      setMultiRunning(false);
    });
  };

  const openReportFlashDetail = (globalFlashId: string) => {
    const job = multiJobsRef.current?.find((item) => item.globalFlashId === globalFlashId);
    const stored = analysisForReportDrillDown(
      multiResultsRef.current[globalFlashId],
      job?.status === "completed" ? "completed" : "failed",
      multiResultsRef.current[globalFlashId]?.model_score ?? null,
    );
    const flash = flashesRef.current.find((item) => item.global_flash_id === globalFlashId);
    if (!stored || !flash || !reportNavRef.current) return;
    void startSentinelRetrieval(flash);
    const nav = openReportFlash(reportNavRef.current, globalFlashId, true);
    reportNavRef.current = nav;
    setReportNav(nav);
    applyFlashSelection(flash);
    setAnalysisResult(stored);
    setAnalysisState("ready");
  };

  const backToMultiFlashReport = () => {
    if (!reportNavRef.current) return;
    clearSelection();
    const nav = returnToReport(reportNavRef.current);
    reportNavRef.current = nav;
    setReportNav(nav);
  };

  const backToMapFromReport = () => {
    if (!reportNavRef.current) return;
    clearSelection();
    const nav = returnReportToMap(reportNavRef.current);
    reportNavRef.current = nav;
    setReportNav(nav);
  };

  const viewMultiFlashReport = () => {
    const nav = reportNavRef.current ? showReport(reportNavRef.current) : createReportNav();
    reportNavRef.current = nav;
    setReportNav(nav);
  };

  const requestExitMultiSelect = () => {
    if (multiRunningRef.current) {
      clearMultiSelect();
      return;
    }
    if (reportNavRef.current || isMultiFlashRunFinished(multiJobsRef.current)) {
      setPendingGuard({ kind: "exit-multi" });
      return;
    }
    clearMultiSelect();
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
    if (reportNavRef.current?.view === "flash") return;
    if (multiModeRef.current) {
      toggleMultiFlash(flash);
      return;
    }
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

    void settleWithSentinel(
      analyzeFlash(flash.source_file, flash.flash_id, controller.signal),
      startSentinelRetrieval(flash),
    )
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
    clearMultiSelect();
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
        setCommittedSearch({
          label: request.label,
          date: request.date,
          time: request.time,
          windowMinutes: request.windowMinutes,
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
      setCommittedSearch(null);
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
    if (analysisReady || multiProtectedRef.current) {
      setPendingGuard({ kind: "find-lightning" });
      return;
    }
    void runLightningSearch();
  };

  const beginChangeSearchArea = () => {
    searchAbortRef.current?.abort();
    clearSelection();
    clearMultiSelect();
    setFlashes([]);
    setActiveInvestigation(null);
    setCommittedSearch(null);
    setStatusMessage("Choose a new search location and radius, then find lightning.");
  };

  const handleChangeSearchArea = () => {
    if (searching) return;
    if (analysisReady || multiProtectedRef.current) {
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
      return;
    }
    if (pending.kind === "close-analysis") {
      clearSelection();
      return;
    }
    if (pending.kind === "enter-multi-select") {
      beginMultiSelect();
      return;
    }
    if (pending.kind === "exit-multi") {
      clearMultiSelect();
    }
  };

  const guardTitle =
    pendingGuard?.kind === "switch-flash"
      ? "Switch selected flash?"
      : pendingGuard?.kind === "find-lightning"
        ? "Start a new lightning search?"
        : pendingGuard?.kind === "change-search-area"
          ? "Change search area?"
          : pendingGuard?.kind === "close-analysis"
            ? "Close analysis?"
            : pendingGuard?.kind === "enter-multi-select"
              ? "Start multi-flash selection?"
              : pendingGuard?.kind === "exit-multi"
                ? "Leave the multi-flash report?"
                : "";

  const guardDescription =
    pendingGuard?.kind === "close-analysis"
      ? CLOSE_ANALYSIS_WARNING
      : pendingGuard?.kind === "exit-multi"
        ? "The multi-flash report will close. The lightning search stays on the map."
        : ANALYSIS_CLOSE_WARNING;

  const guardConfirmLabel =
    pendingGuard?.kind === "switch-flash"
      ? "Switch Flash"
      : pendingGuard?.kind === "find-lightning"
        ? "Start New Search"
        : pendingGuard?.kind === "change-search-area"
          ? "Change Search Area"
          : pendingGuard?.kind === "close-analysis"
            ? "Close Analysis"
            : pendingGuard?.kind === "enter-multi-select"
              ? "Select Multiple"
              : pendingGuard?.kind === "exit-multi"
                ? "Exit Report"
                : "Continue";

  const guardCancelLabel =
    pendingGuard?.kind === "close-analysis"
      ? "Keep Analysis"
      : pendingGuard?.kind === "exit-multi"
        ? "Keep Report"
        : "Keep Current Analysis";

  const reportFinished = isMultiFlashRunFinished(multiJobs);
  const reportRows = reportFinished
    ? rankMultiFlashReport(
        buildReportSources(
          multiJobs ?? [],
          flashes,
          Object.fromEntries(
            Object.entries(multiResults).map(([id, result]) => [
              id,
              {
                modelScore: result.model_score,
                flashTimestampUtc: result.flash_timestamp_utc,
                featureValues: result.feature_values,
              },
            ]),
          ),
        ),
      )
    : [];
  const analyzedCount = reportRows.filter((row) => row.rank !== null).length;
  const failedCount = reportRows.length - analyzedCount;
  const reportSearchLabel = committedSearch
    ? `${committedSearch.date} ${committedSearch.time} UTC · ${describeSearchWindow(committedSearch.windowMinutes)} window · ${describeSearchRadius(committedSearch.radiusKm)} radius`
    : "";

  if (!workspaceOpen) {
    return <LandingPage onEnter={() => setWorkspaceOpen(true)} />;
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <TopBar onHome={() => setWorkspaceOpen(false)} />
      <main className="relative min-h-0 flex-1">
        <CaliforniaMap
          selectedLocation={mapLocation}
          searchRadiusKm={mapRadiusKm}
          flashes={flashes}
          selectedFlashId={selectedFlashId}
          reconstruction={reconstruction}
          playbackGlmMs={playbackGlmMs}
          playing={playing}
          reconstructionFocus={reconstructionFocus}
          reconstructionCameraNonce={reconstructionCameraNonce}
          focusNonce={focusNonce}
          allowMapLocationPick={!investigationActive}
          multiSelectMode={multiSelectMode && reportNav?.view !== "flash"}
          multiSelectedIds={multiSelectedIds}
          onSelectLocation={handleMapSelect}
          onSelectFlash={selectFlash}
          onDeselectFlash={requestClearSelection}
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
              setSetup((current) => ({ ...current, radiusKm }));
            }}
            onFindLightning={handleFindLightning}
            onChangeSearchArea={handleChangeSearchArea}
            flashCount={flashes.length}
            multiSelectMode={multiSelectMode}
            onEnterMultiSelect={requestMultiSelect}
          />
          {reportNav?.view === "report" ? (
            <MultiFlashReport
              provenance={
                committedSearch
                  ? `${committedSearch.label} · ${reportSearchLabel}`
                  : ""
              }
              rows={reportRows}
              flashes={flashes}
              results={multiResults}
              onOpenFlash={openReportFlashDetail}
              onBackToMap={backToMapFromReport}
            />
          ) : reportNav?.view === "flash" ? (
            <FlashAnalysisPanel
              className="pointer-events-auto absolute right-4 bottom-4 left-4 max-h-[calc(100%-8.75rem)] overflow-y-auto xl:top-4 xl:right-4 xl:bottom-auto xl:left-auto xl:max-h-[calc(100%-2rem)] xl:w-[min(38rem,calc(100%-22rem))] 2xl:w-[min(42rem,calc(100%-23rem))]"
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
              onReturnToReport={backToMultiFlashReport}
              onPlay={() => beginReconstructionPlayback(false)}
              onPause={() => setPlaying(false)}
              onReplay={() => beginReconstructionPlayback(true)}
              onReset={resetReconstructionView}
              onSeekGlmMs={(ms) => {
                setPlaybackGlmMs(ms);
                setPlaying(false);
              }}
            />
          ) : multiSelectMode ? (
            <MultiFlashPanel
              className="pointer-events-auto absolute right-4 bottom-4 left-4 max-h-[calc(100%-8.75rem)] overflow-y-auto xl:top-4 xl:right-4 xl:bottom-auto xl:left-auto xl:max-h-[calc(100%-2rem)] xl:w-[min(28rem,calc(100%-22rem))]"
              flashes={flashes}
              selectedIds={multiSelectedIds}
              jobs={multiJobs}
              running={multiRunning}
              limitMessage={multiLimitMessage}
              reportReady={reportFinished}
              analyzedCount={analyzedCount}
              failedCount={failedCount}
              onToggle={toggleMultiFlash}
              onSelectAll={selectAllMultiFlashes}
              onAnalyze={runMultiAnalysis}
              onViewReport={viewMultiFlashReport}
              onExit={requestExitMultiSelect}
            />
          ) : (
          <FlashAnalysisPanel
            className={cn(
              "pointer-events-auto absolute right-4 bottom-4 left-4 max-h-[calc(100%-8.75rem)] overflow-y-auto xl:top-4 xl:right-4 xl:bottom-auto xl:left-auto xl:max-h-[calc(100%-2rem)]",
              analysisState === "ready"
                ? "xl:w-[min(38rem,calc(100%-22rem))] 2xl:w-[min(42rem,calc(100%-23rem))]"
                : "xl:w-[min(24.5rem,calc(100%-2rem))] 2xl:w-[25.5rem]",
            )}
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
            onClearSelection={requestClearSelection}
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
          )}
        </div>
        <ConfirmDialog
          open={pendingGuard !== null}
          title={guardTitle}
          description={guardDescription}
          cancelLabel={guardCancelLabel}
          confirmLabel={guardConfirmLabel}
          onCancel={dismissGuard}
          onConfirm={confirmGuard}
        />
      </main>
    </div>
  );
}
