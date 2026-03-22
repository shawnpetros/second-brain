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
            className={`rounded-lg border bg-card p-6 ${i === 0 ? "border-primary/30" : ""}`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sun className={`h-5 w-5 ${i === 0 ? "text-amber-500" : "text-muted-foreground"}`} />
                <h2 className="font-semibold">{dateStr}</h2>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{b.thought_count} thoughts</span>
                <span>{b.model}</span>
                {b.cost_usd && <span>${Number(b.cost_usd).toFixed(4)}</span>}
                <span>{timeStr}</span>
              </div>
            </div>

            <div className="prose prose-sm prose-invert max-w-none">
              {b.content.split("\n").map((line, j) => {
                if (line.startsWith("## ")) {
                  return <h2 key={j} className="text-lg font-bold mt-4 mb-2">{line.replace("## ", "")}</h2>;
                }
                if (line.startsWith("### ")) {
                  return <h3 key={j} className="text-base font-semibold mt-3 mb-1">{line.replace("### ", "")}</h3>;
                }
                if (line.startsWith("- ")) {
                  return <li key={j} className="ml-4 text-sm">{line.replace("- ", "")}</li>;
                }
                if (/^\d+\.\s/.test(line)) {
                  return <li key={j} className="ml-4 text-sm list-decimal">{line.replace(/^\d+\.\s/, "")}</li>;
                }
                if (line.startsWith("**") && line.endsWith("**")) {
                  return <p key={j} className="font-semibold text-sm mt-2">{line.replace(/\*\*/g, "")}</p>;
                }
                if (line.trim() === "") return <br key={j} />;
                return <p key={j} className="text-sm text-muted-foreground">{line}</p>;
              })}
            </div>
          </article>
        );
      })}
    </div>
  );
}
