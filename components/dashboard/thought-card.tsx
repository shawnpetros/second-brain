"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2, Check, X } from "lucide-react";
import type { ThoughtRecord } from "@/lib/brain/queries";

const typeColors: Record<string, string> = {
  decision: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  insight: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  meeting: "bg-green-500/15 text-green-400 border-green-500/30",
  person_note: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  idea: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  action_item: "bg-red-500/15 text-red-400 border-red-500/30",
  reflection: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  reference: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  milestone: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

interface ThoughtCardProps {
  thought: ThoughtRecord;
  onUpdate?: (id: string, updates: { raw_text?: string; status?: string }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  showSimilarity?: boolean;
}

export function ThoughtCard({ thought, onUpdate, onDelete, showSimilarity }: ThoughtCardProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(thought.raw_text);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!onUpdate || editText === thought.raw_text) {
      setEditing(false);
      return;
    }
    setSaving(true);
    await onUpdate(thought.id, { raw_text: editText });
    setSaving(false);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditText(thought.raw_text);
    setEditing(false);
  };

  const date = new Date(thought.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const typeName = thought.thought_type.replace(/_/g, " ");

  return (
    <Card className="group border-border/50 transition-colors hover:border-border">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={typeColors[thought.thought_type] ?? ""}>
              {typeName}
            </Badge>
            {thought.status !== "active" && thought.thought_type === "action_item" && (
              <Badge variant="outline" className="text-xs">
                {thought.status}
              </Badge>
            )}
            {showSimilarity && thought.similarity != null && (
              <Badge variant="secondary" className="text-xs">
                {(Number(thought.similarity) * 100).toFixed(0)}% match
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground whitespace-nowrap">{date}</span>
            {(onUpdate || onDelete) && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  }
                >
                  <MoreHorizontal className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onUpdate && (
                    <DropdownMenuItem onClick={() => setEditing(true)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <DropdownMenuItem
                      onClick={() => onDelete(thought.id)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {editing ? (
          <div className="mt-3 space-y-2">
            <Textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="min-h-[80px]"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={handleCancel} disabled={saving}>
                <X className="h-3 w-3 mr-1" /> Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Check className="h-3 w-3 mr-1" /> {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm leading-relaxed">{thought.raw_text}</p>
        )}

        {(thought.people?.length > 0 || thought.topics?.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {thought.people?.map((person) => (
              <Badge key={person} variant="secondary" className="text-xs">
                {person}
              </Badge>
            ))}
            {thought.topics?.map((topic) => (
              <Badge key={topic} variant="outline" className="text-xs">
                {topic}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
