import { cn } from "cn";

type SearchTargetMarkerProps = {
  className?: string;
};

/** Presentational map-click target. Distinct from future GLM flash markers. */
export function SearchTargetMarker({ className }: SearchTargetMarkerProps) {
  return (
    <span
      className={cn("search-target-marker", className)}
      role="img"
      aria-label="Selected search location"
    />
  );
}

export function createSearchTargetElement(): HTMLDivElement {
  const element = document.createElement("div");
  element.className = "search-target-marker";
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", "Selected search location");
  return element;
}
