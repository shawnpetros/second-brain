"use client";

import { Button } from "@/components/ui/button";
import { Check, SkipForward, Undo2, Trash2 } from "lucide-react";

interface TaskActionsProps {
  thoughtId: string;
  status: string;
  onStatusChange: (id: string, status: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  compact?: boolean;
}

export function TaskActions({ thoughtId, status, onStatusChange, onDelete, compact }: TaskActionsProps) {
  const size = compact ? "sm" as const : "default" as const;
  const iconClass = compact ? "h-3 w-3" : "h-4 w-4";

  return (
    <div className="flex items-center gap-1">
      {status !== "completed" && (
        <Button
          variant="ghost"
          size={size}
          onClick={() => onStatusChange(thoughtId, "completed")}
          title="Complete"
        >
          <Check className={iconClass} />
          {!compact && <span className="ml-1">Complete</span>}
        </Button>
      )}
      {status === "untriaged" && (
        <Button
          variant="ghost"
          size={size}
          onClick={() => onStatusChange(thoughtId, "active")}
          title="Skip (move to active)"
        >
          <SkipForward className={iconClass} />
          {!compact && <span className="ml-1">Skip</span>}
        </Button>
      )}
      {status !== "untriaged" && status !== "completed" && (
        <Button
          variant="ghost"
          size={size}
          onClick={() => onStatusChange(thoughtId, "untriaged")}
          title="Move back to untriaged"
        >
          <Undo2 className={iconClass} />
          {!compact && <span className="ml-1">Untriage</span>}
        </Button>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size={size}
          onClick={() => onDelete(thoughtId)}
          className="text-destructive hover:text-destructive"
          title="Delete"
        >
          <Trash2 className={iconClass} />
        </Button>
      )}
    </div>
  );
}
