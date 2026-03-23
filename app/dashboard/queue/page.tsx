"use client";

import { useEffect, useState, useCallback } from "react";
import { ActionCard } from "@/components/dashboard/action-card";
import { Badge } from "@/components/ui/badge";
import type { PendingActionRecord } from "@/lib/brain/queries";

type QueueSection = "review" | "auto" | "blocked" | "failed";

export default function QueuePage() {
  const [actions, setActions] = useState<PendingActionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActions = useCallback(async () => {
    try {
      const res = await fetch("/api/brain/actions?limit=50");
      const data = await res.json();
      setActions(data.actions ?? []);
    } catch (err) {
      console.error("Failed to fetch actions:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  async function handleAction(
    id: string,
    action: "approve" | "reject" | "flag" | "dismiss"
  ) {
    await fetch(`/api/brain/actions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    await fetchActions();
  }

  async function handleRetry(id: string, note?: string) {
    await fetch(`/api/brain/actions/${id}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    await fetchActions();
  }

  async function handleExecute(id: string) {
    await fetch("/api/actions/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionId: id }),
    });
    await fetchActions();
  }

  // Categorize actions into sections
  const needsReview = actions.filter(
    (a) => a.status === "staged" && a.permission_tier !== "auto"
  );
  const autoCompleted = actions.filter(
    (a) => a.status === "staged" && a.permission_tier === "auto"
  );
  const blocked = actions.filter((a) =>
    ["blocked", "planned", "executing"].includes(a.status)
  );
  const failed = actions.filter((a) =>
    ["failed", "rejected", "abandoned"].includes(a.status)
  );

  const sections: { key: QueueSection; title: string; items: PendingActionRecord[]; badge: string }[] = [
    {
      key: "review",
      title: "Needs Review",
      items: needsReview,
      badge: "text-amber-400 border-amber-500/30",
    },
    {
      key: "auto",
      title: "Auto-Completed",
      items: autoCompleted,
      badge: "text-emerald-400 border-emerald-500/30",
    },
    {
      key: "blocked",
      title: "In Progress",
      items: blocked,
      badge: "text-blue-400 border-blue-500/30",
    },
    {
      key: "failed",
      title: "Failed / Rejected",
      items: failed,
      badge: "text-red-400 border-red-500/30",
    },
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Approval Queue</h1>
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const totalActive = needsReview.length + autoCompleted.length + blocked.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Approval Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalActive > 0
              ? [
                  needsReview.length > 0 && `${needsReview.length} for review`,
                  autoCompleted.length > 0 && `${autoCompleted.length} auto-completed`,
                  blocked.length > 0 && `${blocked.length} in progress`,
                ].filter(Boolean).join(", ")
              : "No pending actions"}
          </p>
        </div>
      </div>

      {actions.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">No actions yet</p>
          <p className="text-sm mt-1">
            Actions will appear here after the morning briefing runs.
          </p>
        </div>
      )}

      {sections.map(
        (section) =>
          section.items.length > 0 && (
            <div key={section.key}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </h2>
                <Badge variant="outline" className={section.badge}>
                  {section.items.length}
                </Badge>
              </div>
              <div className="space-y-3">
                {section.items.map((action) => (
                  <ActionCard
                    key={action.id}
                    action={action}
                    onAction={handleAction}
                    onRetry={section.key === "failed" ? handleRetry : undefined}
                    onExecute={section.key === "blocked" ? handleExecute : undefined}
                  />
                ))}
              </div>
            </div>
          )
      )}
    </div>
  );
}
