"use client";

import { CopyIcon, DownloadIcon } from "lucide-react";
import { useState } from "react";

import {
  rankingExport,
  rankingTableCsv,
  rankingTableTsv,
} from "@/app/ranking-export";
import type { RankingRowView } from "@/app/ranking-view";
import { Button } from "@/components/ui/button";

/**
 * Copy and CSV on the ranking table (issue #30). Both serialize the same
 * payload columns the table drew — IATA, name, composite, candidate lamp,
 * why-labels — rather than scraping styled cell text.
 */
export function RankingExport({ rows }: { rows: readonly RankingRowView[] }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(rankingTableTsv(rows));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
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
        className="h-7 gap-1.5 px-2 text-[11.5px] text-muted-foreground"
      >
        <CopyIcon aria-hidden="true" />
        {copied ? rankingExport.copiedLabel : rankingExport.copyLabel}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={download}
        className="h-7 gap-1.5 px-2 text-[11.5px] text-muted-foreground"
      >
        <DownloadIcon aria-hidden="true" />
        {rankingExport.csvLabel}
      </Button>
    </div>
  );
}
