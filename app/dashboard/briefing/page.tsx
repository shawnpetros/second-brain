"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Sun } from "lucide-react";

interface Briefing {
  id: string;
  content: string;
  model: string;
  cost_usd: string | null;
  tokens_used: number | null;
  thought_count: number;
  created_at: string;
}

export default function BriefingPage() {
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/brain/briefings?limit=10")
      .then((r) => r.json())
      .then((data) => {
        setBriefings(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!briefings.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Sun className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold">No briefings yet</h2>
        <p className="text-muted-foreground mt-2">
          Your first morning briefing will generate at 11 PM PT tonight.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Morning Briefings</h1>

      {briefings.map((b, i) => {
        const date = new Date(b.created_at);
        const dateStr = date.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        });
        const timeStr = date.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        });

        return (
          <article
            key={b.id}
            className={`rounded-lg border bg-card p-5 md:p-6 ${i === 0 ? "border-amber-500/20 bg-amber-500/[0.02]" : "border-border/50"}`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sun className={`h-5 w-5 ${i === 0 ? "text-amber-500" : "text-muted-foreground"}`} />
                <h2 className="font-semibold">{dateStr}</h2>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{b.thought_count} thoughts</span>
                <span className="hidden sm:inline">|</span>
                <span className="hidden sm:inline font-mono">{b.model}</span>
                {b.cost_usd && <><span className="hidden sm:inline">|</span><span className="hidden sm:inline font-mono">${Number(b.cost_usd).toFixed(4)}</span></>}
              </div>
            </div>

            <div className="space-y-1">
              {b.content.split("\n").map((line, j) => {
                if (line.startsWith("## ")) {
                  return <h2 key={j} className="text-lg font-bold mt-5 mb-2 text-foreground border-b border-border/50 pb-1">{line.replace("## ", "")}</h2>;
                }
                if (line.startsWith("### ")) {
                  return <h3 key={j} className="text-sm font-semibold uppercase tracking-wider mt-4 mb-1.5 text-muted-foreground">{line.replace("### ", "")}</h3>;
                }
                if (line.startsWith("- ")) {
                  const content = line.replace("- ", "");
                  return (
                    <div key={j} className="flex gap-2 ml-1 text-sm leading-relaxed">
                      <span className="text-muted-foreground shrink-0 mt-1">-</span>
                      <span dangerouslySetInnerHTML={{ __html: content.replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground">$1</strong>') }} />
                    </div>
                  );
                }
                if (/^\d+\.\s/.test(line)) {
                  const num = line.match(/^(\d+)\./)?.[1];
                  const content = line.replace(/^\d+\.\s/, "");
                  return (
                    <div key={j} className="flex gap-2 ml-1 text-sm leading-relaxed">
                      <span className="text-amber-400 font-mono font-bold shrink-0 w-5 text-right">{num}.</span>
                      <span dangerouslySetInnerHTML={{ __html: content.replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground">$1</strong>') }} />
                    </div>
                  );
                }
                if (line.trim() === "") return <div key={j} className="h-2" />;
                return (
                  <p key={j} className="text-sm text-muted-foreground leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground">$1</strong>') }}
                  />
                );
              })}
            </div>
          </article>
        );
      })}
    </div>
  );
}
