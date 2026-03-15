"use client";

import { useEffect, useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskActions } from "@/components/dashboard/task-actions";
import type { ThoughtRecord } from "@/lib/brain/queries";

const STATUSES = ["untriaged", "active", "completed", "skipped"] as const;

export default function TasksPage() {
  const [activeTab, setActiveTab] = useState<string>("untriaged");
  const [tasks, setTasks] = useState<ThoughtRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const fetchTasks = useCallback(async (status: string) => {
    setLoading(true);
    const res = await fetch(`/api/brain/thoughts?type=action_item&status=${status}&limit=50`);
    const data = await res.json();
    setTasks(data);
    setLoading(false);
  }, []);

  // Fetch counts for all tabs
  const fetchCounts = useCallback(async () => {
    const results = await Promise.all(
      STATUSES.map(async (s) => {
        const res = await fetch(`/api/brain/thoughts?type=action_item&status=${s}&limit=1`);
        const data = await res.json();
        // We get at most 1 item, but the API doesn't return a count.
        // For counts, we'll fetch all and use length.
        const fullRes = await fetch(`/api/brain/thoughts?type=action_item&status=${s}&limit=100`);
        const fullData = await fullRes.json();
        return [s, fullData.length] as const;
      })
    );
    setCounts(Object.fromEntries(results));
  }, []);

  useEffect(() => {
    fetchTasks(activeTab);
  }, [activeTab, fetchTasks]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    const res = await fetch(`/api/brain/thoughts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      // Optimistic removal from current tab
      setTasks((prev) => prev.filter((t) => t.id !== id));
      // Update counts
      setCounts((prev) => ({
        ...prev,
        [activeTab]: Math.max(0, (prev[activeTab] ?? 0) - 1),
        [newStatus]: (prev[newStatus] ?? 0) + 1,
      }));
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/brain/thoughts/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      setCounts((prev) => ({
        ...prev,
        [activeTab]: Math.max(0, (prev[activeTab] ?? 0) - 1),
      }));
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tasks</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {STATUSES.map((status) => (
            <TabsTrigger key={status} value={status} className="gap-2">
              {status.charAt(0).toUpperCase() + status.slice(1)}
              {(counts[status] ?? 0) > 0 && (
                <Badge variant={status === "untriaged" ? "destructive" : "secondary"} className="h-5 min-w-5 text-xs">
                  {counts[status]}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {STATUSES.map((status) => (
          <TabsContent key={status} value={status} className="mt-4">
            {loading && activeTab === status ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : tasks.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">
                No {status} tasks.
              </p>
            ) : (
              <div className="space-y-2">
                {tasks.map((task) => (
                  <Card key={task.id}>
                    <CardContent className="p-4 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{task.raw_text}</p>
                        {(task.topics?.length > 0 || task.people?.length > 0) && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {task.topics?.map((t) => (
                              <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                            ))}
                            {task.people?.map((p) => (
                              <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
                            ))}
                          </div>
                        )}
                        <span className="text-xs text-muted-foreground mt-1 block">
                          {new Date(task.created_at).toLocaleDateString("en-US", {
                            month: "short", day: "numeric",
                          })}
                        </span>
                      </div>
                      <TaskActions
                        thoughtId={task.id}
                        status={task.status}
                        onStatusChange={handleStatusChange}
                        onDelete={handleDelete}
                        compact
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
