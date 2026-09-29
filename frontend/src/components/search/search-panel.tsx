"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { searchLocalPlaces, type PlaceSuggestion } from "@/lib/california-places";
import { searchRemoteCaliforniaPlaces } from "@/lib/places";
import {
  describeSearchRadius,
  describeSearchWindow,
  glmSearchDateBounds,
  isDateWithinGlmBounds,
  isSearchSetupReady,
  SEARCH_RADIUS_OPTIONS,
  SEARCH_WINDOW_OPTIONS,
  type LightningSearchSetup,
  type SearchRadiusKm,
  type SearchWindowMinutes,
  type SelectedSearchLocation,
} from "@/lib/search";
import { cn } from "cn";

const fieldClass =
  "h-9 w-full min-w-0 rounded-md border border-white/10 bg-black/30 px-2.5 text-[14px] text-foreground outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/55 focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/15";

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase"
    >
      {children}
    </label>
  );
}

function looksLikeCoordinates(value: string): boolean {
  const trimmed = value.trim();
  return /^-?\d/.test(trimmed) && /[,\u00b0]/.test(trimmed);
}

function mergeSuggestions(local: PlaceSuggestion[], remote: PlaceSuggestion[]): PlaceSuggestion[] {
  const merged: PlaceSuggestion[] = [];
  const seen = new Set<string>();
  for (const item of [...local, ...remote]) {
    const key = `${item.label.toLowerCase()}|${item.lng.toFixed(2)}|${item.lat.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= 8) break;
  }
  return merged;
}

type SearchPanelProps = {
  className?: string;
  setup: LightningSearchSetup;
  locationText: string;
  searching?: boolean;
  statusMessage?: string;
  /** True when displayed flashes come from a committed search area. */
  investigationActive?: boolean;
  onLocationTextChange: (value: string) => void;
  onSelectPlace: (place: PlaceSuggestion) => void;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  onWindowChange: (value: SearchWindowMinutes) => void;
  onRadiusChange: (value: SearchRadiusKm) => void;
  onFindLightning: () => void;
  onChangeSearchArea?: () => void;
};

export function SearchPanel({
  className,
  setup,
  locationText,
  searching = false,
  statusMessage = "Ready to search",
  investigationActive = false,
  onLocationTextChange,
  onSelectPlace,
  onDateChange,
  onTimeChange,
  onWindowChange,
  onRadiusChange,
  onFindLightning,
  onChangeSearchArea,
}: SearchPanelProps) {
  const baseId = useId();
  const listId = `${baseId}-suggestions`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [remoteSuggestions, setRemoteSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const areaLocked = investigationActive;
  const locationControlsDisabled = searching || areaLocked;
  const dateBounds = useMemo(() => glmSearchDateBounds(), []);

  const query = locationText.trim();
  const localSuggestions = useMemo(() => {
    if (query.length < 2 || looksLikeCoordinates(query)) return [];
    return searchLocalPlaces(query, 6);
  }, [query]);

  const suggestions = useMemo(
    () => mergeSuggestions(localSuggestions, remoteSuggestions),
    [localSuggestions, remoteSuggestions],
  );

  const ready = isSearchSetupReady(setup);
  const missingLocation = !setup.location;
  const missingDate = !setup.date;
  const missingTime = !setup.time;
  const dateOutOfRange = Boolean(setup.date && !isDateWithinGlmBounds(setup.date));
  const showValidation = attemptedSubmit && !ready;

  useEffect(() => {
    if (query.length < 2 || looksLikeCoordinates(query)) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoadingPlaces(true);
      try {
        const results = await searchRemoteCaliforniaPlaces(query, controller.signal);
        if (controller.signal.aborted) return;
        setRemoteSuggestions(results);
        setOpen(true);
        setActiveIndex(0);
      } catch {
        if (!controller.signal.aborted) setRemoteSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setLoadingPlaces(false);
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const chooseSuggestion = (place: PlaceSuggestion) => {
    onSelectPlace(place);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setAttemptedSubmit(true);
    if (!ready || searching) return;
    onFindLightning();
  };

  const showSuggestions = open && query.length >= 2 && !looksLikeCoordinates(query);

  return (
    <form
      className={cn("panel panel-scroll flex flex-col gap-4 p-4", className)}
      aria-label="Lightning search"
      autoComplete="off"
      onSubmit={handleSubmit}
    >
      <h2 className="text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
        Lightning search
      </h2>

      <div className="flex flex-col gap-1.5" ref={rootRef}>
        <FieldLabel htmlFor={`${baseId}-location`}>Location</FieldLabel>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            id={`${baseId}-location`}
            value={locationText}
            onChange={(event) => {
              onLocationTextChange(event.target.value);
              setRemoteSuggestions([]);
              setOpen(true);
            }}
            onFocus={() => {
              if (suggestions.length) setOpen(true);
            }}
            onKeyDown={(event) => {
              if (!showSuggestions || !suggestions.length) return;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => (index + 1) % suggestions.length);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
              } else if (event.key === "Enter" && activeIndex >= 0) {
                event.preventDefault();
                const place = suggestions[activeIndex];
                if (place) chooseSuggestion(place);
              } else if (event.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder={
              areaLocked ? "Search area locked — Change Search Area to edit" : "City, place, or map click"
            }
            className={cn(
              fieldClass,
              "pr-2.5 pl-8",
              showValidation && missingLocation && "border-amber-400/35",
            )}
            spellCheck={false}
            role="combobox"
            aria-expanded={showSuggestions}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-invalid={showValidation && missingLocation}
            disabled={locationControlsDisabled}
          />
          {showSuggestions && (suggestions.length > 0 || loadingPlaces) && (
            <ul
              id={listId}
              role="listbox"
              className="absolute top-[calc(100%+6px)] right-0 left-0 z-30 max-h-56 overflow-y-auto rounded-md border border-white/10 bg-[oklch(0.17_0.016_258/0.97)] py-1 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.9)] backdrop-blur-md"
            >
              {loadingPlaces && suggestions.length === 0 && (
                <li className="px-3 py-2 text-[13px] text-muted-foreground">Searching California…</li>
              )}
              {suggestions.map((place, index) => {
                const active = index === activeIndex;
                return (
                  <li key={place.id} role="option" aria-selected={active}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors",
                        active ? "bg-white/8" : "hover:bg-white/5",
                      )}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => chooseSuggestion(place)}
                    >
                      <span className="text-[14px] text-foreground">{place.label}</span>
                      <span className="text-[12px] text-muted-foreground">{place.detail}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <p className="text-[12px] leading-snug text-muted-foreground/80">
          {areaLocked
            ? "Change date, time, window, or radius, then Update Search to search this area again. Use Change Search Area to pick a different location."
            : "Search California places or click the map to set a location."}
        </p>
        {showValidation && missingLocation && (
          <p className="text-[12px] text-amber-200/80">Choose a California location.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <FieldLabel htmlFor={`${baseId}-date`}>Date (UTC)</FieldLabel>
          <input
            id={`${baseId}-date`}
            type="date"
            value={setup.date}
            min={dateBounds.min}
            max={dateBounds.max}
            onChange={(event) => onDateChange(event.target.value)}
            className={cn(
              fieldClass,
              "scheme-dark",
              showValidation && (missingDate || dateOutOfRange) && "border-amber-400/35",
            )}
            aria-invalid={showValidation && (missingDate || dateOutOfRange)}
            disabled={searching}
          />
          {showValidation && missingDate && (
            <p className="text-[12px] text-amber-200/80">Date required.</p>
          )}
          {showValidation && !missingDate && dateOutOfRange && (
            <p className="text-[12px] text-amber-200/80">
              Choose a date from {dateBounds.min} to {dateBounds.max} UTC.
            </p>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <FieldLabel htmlFor={`${baseId}-time`}>Time (UTC)</FieldLabel>
          <input
            id={`${baseId}-time`}
            type="time"
            value={setup.time}
            onChange={(event) => onTimeChange(event.target.value)}
            className={cn(
              fieldClass,
              "scheme-dark",
              showValidation && missingTime && "border-amber-400/35",
            )}
            aria-invalid={showValidation && missingTime}
            disabled={searching}
          />
          {showValidation && missingTime && (
            <p className="text-[12px] text-amber-200/80">Time required.</p>
          )}
        </div>
      </div>

      <fieldset className="flex flex-col gap-1.5" disabled={searching}>
        <legend className="text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
          Search window
        </legend>
        <div
          className="grid grid-cols-3 gap-1 rounded-md border border-white/10 bg-black/25 p-1"
          role="radiogroup"
          aria-label="Search window"
        >
          {SEARCH_WINDOW_OPTIONS.map((option) => {
            const selected = setup.windowMinutes === option.minutes;
            return (
              <button
                key={option.minutes}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onWindowChange(option.minutes)}
                className={cn(
                  "h-8 rounded-[5px] text-[13px] transition-colors duration-150",
                  selected
                    ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_oklch(0.72_0.17_50/0.4)]"
                    : "text-muted-foreground hover:bg-white/4 hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="text-[12px] leading-snug text-muted-foreground/80">
          Centered on the selected UTC time.
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-1.5" disabled={searching}>
        <legend className="text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
          Radius
        </legend>
        <div
          className="grid grid-cols-3 gap-1 rounded-md border border-white/10 bg-black/25 p-1"
          role="radiogroup"
          aria-label="Search radius"
        >
          {SEARCH_RADIUS_OPTIONS.map((option) => {
            const selected = setup.radiusKm === option.km;
            return (
              <button
                key={option.km}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onRadiusChange(option.km)}
                className={cn(
                  "h-8 rounded-[5px] text-[13px] transition-colors duration-150",
                  selected
                    ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_oklch(0.72_0.17_50/0.4)]"
                    : "text-muted-foreground hover:bg-white/4 hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <SearchSetupSummary
        location={setup.location}
        date={setup.date}
        time={setup.time}
        windowMinutes={setup.windowMinutes}
        radiusKm={setup.radiusKm}
      />

      <div className="flex flex-col gap-2.5 border-t border-white/8 pt-4">
        <Button
          type="submit"
          size="lg"
          className={cn("h-10 w-full", (!ready || searching) && "opacity-70")}
          disabled={searching}
          aria-busy={searching}
          aria-describedby={`${baseId}-status`}
          title={
            ready
              ? areaLocked
                ? "Update search with current date, time, window, and radius for this area"
                : "Search GOES-18 GLM flashes"
              : "Complete the search setup first"
          }
        >
          {searching ? (
            <span className="inline-flex items-center gap-2">
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
              Searching…
            </span>
          ) : areaLocked ? (
            "Update Search"
          ) : (
            "Find Lightning"
          )}
        </Button>
        {areaLocked && onChangeSearchArea ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full"
            disabled={searching}
            onClick={onChangeSearchArea}
            title="Unlock geographic selection to choose a different search location or radius"
          >
            Change Search Area
          </Button>
        ) : null}
        <p
          id={`${baseId}-status`}
          className="flex items-center justify-center gap-1.5 text-center text-[12px] text-muted-foreground"
        >
          <span
            className={cn(
              "size-1 shrink-0 rounded-full",
              searching
                ? "bg-primary/80"
                : ready
                  ? "bg-emerald-400/80"
                  : "bg-muted-foreground/60",
            )}
            aria-hidden
          />
          {statusMessage}
        </p>
      </div>
    </form>
  );
}

function SearchSetupSummary({
  location,
  date,
  time,
  windowMinutes,
  radiusKm,
}: {
  location: SelectedSearchLocation | null;
  date: string;
  time: string;
  windowMinutes: SearchWindowMinutes;
  radiusKm: SearchRadiusKm;
}) {
  return (
    <div className="rounded-md border border-white/8 bg-black/20 px-3 py-2.5">
      <p className="text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
        Search setup
      </p>
      <dl className="mt-2 space-y-1.5 text-[13px]">
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted-foreground">Location</dt>
          <dd className="max-w-[12rem] truncate text-right text-foreground/90">
            {location?.label ?? "Not set"}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted-foreground">When (UTC)</dt>
          <dd className="text-right text-foreground/90">
            {date && time ? `${date} · ${time}` : "Not set"}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted-foreground">Window</dt>
          <dd className="text-right text-foreground/90">{describeSearchWindow(windowMinutes)}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted-foreground">Radius</dt>
          <dd className="text-right text-foreground/90">{describeSearchRadius(radiusKm)}</dd>
        </div>
      </dl>
    </div>
  );
}
