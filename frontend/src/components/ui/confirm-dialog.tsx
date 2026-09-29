"use client";

import { useEffect, useId, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "cn";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Small modal used to protect completed analysis from accidental replacement. */
export function ConfirmDialog({
  open,
  title,
  description,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        aria-label="Dismiss dialog"
        onClick={onCancel}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={cn(
          "relative z-10 w-full max-w-[22rem] rounded-lg border border-white/12",
          "bg-[oklch(0.17_0.016_258/0.97)] p-4 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.95)]",
        )}
      >
        <h2 id={titleId} className="text-[15px] font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        <div id={descriptionId} className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </div>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="sm:min-w-[9.5rem]"
            autoFocus
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button type="button" size="sm" className="sm:min-w-[7.5rem]" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
