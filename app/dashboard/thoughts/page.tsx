"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ThoughtCard } from "@/components/dashboard/thought-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CaptureDialog } from "@/components/dashboard/capture-dialog";
import type { ThoughtRecord } from "@/lib/brain/queries";

const THOUGHT_TYPES = [
  "decision", "insight", "meeting", "person_note",
  "idea", "action_item", "reflection", "reference",
];

export default function ThoughtsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [thoughts, setThoughts] = useState<ThoughtRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [topicFilter, setTopicFilter] = useState(searchParams.get("topic") ?? "");
  const [personFilter, setPersonFilter] = useState(searchParams.get("person") ?? "");
  const [activeTypes, setActiveTypes] = useState<string[]>(() => {
    const t = searchParams.get("type");
    return t ? t.split(",") : [];
  });

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    if (activeTypes.length === 1) params.set("type", activeTypes[0]);
    if (topicFilter) params.set("topic", topicFilter);
    if (personFilter) params.set("person", personFilter);
    params.set("limit", "50");
    return params.toString();
  }, [activeTypes, topicFilter, personFilter]);

  const fetchThoughts = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/brain/thoughts?${buildQuery()}`);
    const data = await res.json();
    setThoughts(data);
    setLoading(false);
  }, [buildQuery]);

  useEffect(() => { fetchThoughts(); }, [fetchThoughts]);

  // Sync filters to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (activeTypes.length) params.set("type", activeTypes.join(","));
    if (topicFilter) params.set("topic", topicFilter);
    if (personFilter) params.set("person", personFilter);
    const qs = params.toString();
    router.replace(`/dashboard/thoughts${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [activeTypes, topicFilter, personFilter, router]);

  const toggleType = (type: string) => {
    setActiveTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleUpdate = async (id: string, updates: { raw_text?: string; status?: string }) => {
    const res = await fetch(`/api/brain/thoughts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const updated = await res.json();
    setThoughts((prev) => prev.map((t) => (t.id === id ? updated : t)));
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/brain/thoughts/${id}`, { method: "DELETE" });
    setThoughts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleCapture = async (text: string) => {
    const res = await fetch("/api/brain/thoughts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const thought = await res.json();
    setThoughts((prev) => [thought, ...prev]);
    return thought;
  };

  // Filter locally for multi-type selection
  const filtered = activeTypes.length > 1
    ? thoughts.filter((t) => activeTypes.includes(t.thought_type))
    : thoughts;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Thoughts</h1>
        <CaptureDialog
          onCapture={handleCapture}
          trigger={<Button>New Thought</Button>}
        />
      </div>

      {/* Filter bar */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {THOUGHT_TYPES.map((type) => (
            <Badge
              key={type}
              variant={activeTypes.includes(type) ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => toggleType(type)}
            >
              {type.replace(/_/g, " ")}
            </Badge>
          ))}
          {activeTypes.length > 0 && (
            <Badge
              variant="secondary"
              className="cursor-pointer"
              onClick={() => setActiveTypes([])}
            >
              Clear
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Filter by topic..."
            value={topicFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
            className="max-w-xs"
          />
          <Input
            placeholder="Filter by person..."
            value={personFilter}
            onChange={(e) => setPersonFilter(e.target.value)}
            className="max-w-xs"
          />
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm">No thoughts match your filters.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((thought) => (
            <ThoughtCard
              key={thought.id}
              thought={thought}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
