import { cn } from "cn";

type FlashMarkerProps = {
  selected?: boolean;
  label?: string;
  className?: string;
};

/** Presentational GLM flash marker. Mount it only for a real flash, never a placeholder. */
export function FlashMarker({
  selected = false,
  label = "Lightning flash",
  className,
}: FlashMarkerProps) {
  return (
    <span
      className={cn("flash-marker", selected && "is-selected", className)}
      role="img"
      aria-label={selected ? `Selected ${label}` : label}
    />
  );
}

export function createFlashMarkerElement(selected = false, dimmed = false): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  applyFlashMarkerState(element, selected, dimmed);
  return element;
}

export function applyFlashMarkerState(
  element: HTMLElement,
  selected: boolean,
  dimmed = false,
) {
  element.classList.add("flash-marker");
  element.classList.toggle("is-selected", selected);
  element.classList.toggle("is-dimmed", dimmed && !selected);
  element.setAttribute("aria-label", selected ? "Selected lightning flash" : "Lightning flash");
}
