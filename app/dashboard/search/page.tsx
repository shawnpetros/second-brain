"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ThoughtCard } from "@/components/dashboard/thought-card";
import { Search } from "lucide-react";
import type { ThoughtRecord } from "@/lib/brain/queries";

const THOUGHT_TYPES = [
  "decision", "insight", "meeting", "person_note",
  "idea", "action_item", "reflection", "reference",
];

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [results, setResults] = useState<ThoughtRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    const res = await fetch(`/api/brain/search?q=${encodeURIComponent(q)}&limit=20`);
    const data = await res.json();
    setResults(data);
    setLoading(false);
  }, []);

  // Search on mount if q param present
  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      setQuery(q);
      doSearch(q);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInput = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value.trim()) {
        router.replace(`/dashboard/search?q=${encodeURIComponent(value)}`, { scroll: false });
      } else {
        router.replace("/dashboard/search", { scroll: false });
      }
      doSearch(value);
    }, 300);
  };

  const handleUpdate = async (id: string, updates: { raw_text?: string; status?: string }) => {
    const res = await fetch(`/api/brain/thoughts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const updated = await res.json();
    setResults((prev) => prev.map((t) => (t.id === id ? updated : t)));
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/brain/thoughts/${id}`, { method: "DELETE" });
    setResults((prev) => prev.filter((t) => t.id !== id));
  };

  const filtered = typeFilter.length
    ? results.filter((t) => typeFilter.includes(t.thought_type))
    : results;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Search</h1>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          placeholder="Search your brain by meaning..."
          className="pl-10 h-12 text-base"
          autoFocus
        />
      </div>

      {searched && results.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {THOUGHT_TYPES.map((type) => {
            const count = results.filter((r) => r.thought_type === type).length;
            if (!count) return null;
            return (
              <Badge
                key={type}
                variant={typeFilter.includes(type) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() =>
                  setTypeFilter((prev) =>
                    prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
                  )
                }
              >
                {type.replace(/_/g, " ")} ({count})
              </Badge>
            );
          })}
          {typeFilter.length > 0 && (
            <Badge
              variant="secondary"
              className="cursor-pointer"
              onClick={() => setTypeFilter([])}
            >
              Clear
            </Badge>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : searched && filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8 text-center">
          No results found for &ldquo;{query}&rdquo;
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((thought) => (
            <ThoughtCard
              key={thought.id}
              thought={thought}
              showSimilarity
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
