"use client";

import { useEffect, useState, useCallback } from "react";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { AlertCard } from "@/components/dashboard/alert-card";
import { ThoughtCard } from "@/components/dashboard/thought-card";
import { CaptureDialog } from "@/components/dashboard/capture-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { BrainStats, AlertItem, ThoughtRecord } from "@/lib/brain/queries";

export default function DashboardOverview() {
  const [stats, setStats] = useState<BrainStats | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [recent, setRecent] = useState<ThoughtRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [statsRes, alertsRes, recentRes] = await Promise.all([
      fetch("/api/brain/stats"),
      fetch("/api/brain/alerts"),
      fetch("/api/brain/thoughts?limit=10"),
    ]);
    const [statsData, alertsData, recentData] = await Promise.all([
      statsRes.json(),
      alertsRes.json(),
      recentRes.json(),
    ]);
    setStats(statsData);
    setAlerts(alertsData);
    setRecent(recentData);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCapture = async (text: string) => {
    const res = await fetch("/api/brain/thoughts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const thought = await res.json();
    setRecent((prev) => [thought, ...prev]);
    // Refresh stats
    fetch("/api/brain/stats").then((r) => r.json()).then(setStats);
    return thought;
  };

  const handleUpdate = async (id: string, updates: { raw_text?: string; status?: string }) => {
    const res = await fetch(`/api/brain/thoughts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const updated = await res.json();
    setRecent((prev) => prev.map((t) => (t.id === id ? updated : t)));
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/brain/thoughts/${id}`, { method: "DELETE" });
    setRecent((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <CaptureDialog onCapture={handleCapture} />
      </div>

      <StatsCards stats={stats} loading={loading} />

      {alerts.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Needs Attention</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0">
            {alerts.map((alert, i) => (
              <AlertCard key={i} alert={alert} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">Recent</h2>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <p className="text-muted-foreground text-sm">No thoughts yet. Capture your first one!</p>
        ) : (
          <div className="space-y-3">
            {recent.map((thought) => (
              <ThoughtCard
                key={thought.id}
                thought={thought}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </section>

      {/* Mobile FAB */}
      <div className="fixed bottom-20 right-4 md:hidden">
        <CaptureDialog onCapture={handleCapture} />
      </div>
    </div>
  );
}
