"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AnalyzeFlashResponse, GlmFlash } from "@/lib/api";

type SaveReportButtonProps = {
  result: AnalyzeFlashResponse;
  flash: GlmFlash;
};

export function SaveReportButton({ result, flash }: SaveReportButtonProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const { saveIndividualFlashReport } = await import("@/lib/individual-report-pdf");
      await saveIndividualFlashReport(result, flash);
    } catch {
      setError("The PDF could not be created. The analysis is unchanged.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="outline" disabled={saving} onClick={() => void save()}>
        {saving ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : null}
        {saving ? "Preparing PDF…" : "Download PDF"}
      </Button>
      {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
    </div>
  );
}
