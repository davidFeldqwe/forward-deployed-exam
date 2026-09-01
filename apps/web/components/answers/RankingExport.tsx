"use client";

import { CopyIcon, DownloadIcon } from "lucide-react";
import { useEffect, useState } from "react";

import {
  rankingExport,
  rankingTableCsv,
  rankingTableTsv,
} from "@/app/ranking-export";
import type { RankingRowView } from "@/app/ranking-view";
import { Button } from "@/components/ui/button";

const COPIED_MS = 1500;
const EXPORT_BUTTON = "h-7 gap-1.5 px-2 text-[11.5px] text-muted-foreground";

/**
 * Copy and CSV on the ranking table (issue #30). Both serialize the same
 * payload columns the table drew — IATA, name, composite, candidate lamp,
 * why-labels — rather than scraping styled cell text.
 */
export function RankingExport({ rows }: { rows: readonly RankingRowView[] }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return undefined;
    }
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(rankingTableTsv(rows));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function download() {
    const blob = new Blob([rankingTableCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = rankingExport.csvFileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => void copy()}
        className={EXPORT_BUTTON}
      >
        <CopyIcon aria-hidden="true" />
        {copied ? rankingExport.copiedLabel : rankingExport.copyLabel}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={download}
        className={EXPORT_BUTTON}
      >
        <DownloadIcon aria-hidden="true" />
        {rankingExport.csvLabel}
      </Button>
    </div>
  );
}
