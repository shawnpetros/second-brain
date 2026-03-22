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
import {
  Check,
  X,
  Flag,
  RotateCcw,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  Cpu,
  FileText,
  Search,
  BarChart3,
  Mail,
  MessageSquare,
} from "lucide-react";
import type { PendingActionRecord } from "@/lib/brain/queries";

const tierStyles: Record<string, string> = {
  auto: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  staged: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  never: "bg-red-500/15 text-red-400 border-red-500/30",
};

const statusStyles: Record<string, string> = {
  planned: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  executing: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  staged: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  rejected: "bg-red-500/15 text-red-400 border-red-500/30",
  failed: "bg-red-500/15 text-red-400 border-red-500/30",
  blocked: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  expired: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  abandoned: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  dismissed: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  research: Search,
  summary: FileText,
  analysis: BarChart3,
  draft_email: Mail,
  draft_message: MessageSquare,
  draft_content: FileText,
  draft_report: FileText,
  recommendation: BarChart3,
  categorize: FileText,
  internal_note: FileText,
};

interface ActionCardProps {
  action: PendingActionRecord;
  onAction: (
    id: string,
    action: "approve" | "reject" | "flag" | "dismiss",
    reason?: string
  ) => Promise<void>;
  onRetry?: (id: string, note?: string) => Promise<void>;
}

export function ActionCard({ action, onAction, onRetry }: ActionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [acting, setActing] = useState(false);
  const [retryNote, setRetryNote] = useState("");
  const [showRetryInput, setShowRetryInput] = useState(false);

  const Icon = typeIcons[action.action_type] || Cpu;
  const meta = action.result_metadata as Record<string, unknown> | null;

  async function handleAction(type: "approve" | "reject" | "flag" | "dismiss") {
    setActing(true);
    try {
      await onAction(action.id, type);
    } finally {
      setActing(false);
    }
  }

  async function handleRetry() {
    if (!onRetry) return;
    setActing(true);
    try {
      await onRetry(action.id, retryNote || undefined);
      setShowRetryInput(false);
      setRetryNote("");
    } finally {
      setActing(false);
    }
  }

  const isReviewable = action.status === "staged";
  const isFailed = ["failed", "rejected", "abandoned"].includes(action.status);
  const isAutoCompleted =
    action.status === "staged" && action.permission_tier === "auto";

  return (
    <Card className="border-border/50">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge
                variant="outline"
                className={tierStyles[action.permission_tier] || ""}
              >
                {action.permission_tier}
              </Badge>
              <Badge
                variant="outline"
                className={statusStyles[action.status] || ""}
              >
                {action.status}
              </Badge>
              {action.model_used && (
                <span className="text-xs text-muted-foreground font-mono">
                  {action.model_used.includes("opus") ? "Opus" : "Sonnet"}
                </span>
              )}
              {action.stakes && action.stakes !== "low" && (
                <Badge variant="outline" className="bg-orange-500/15 text-orange-400 border-orange-500/30">
                  {action.stakes} stakes
                </Badge>
              )}
              {action.flagged && (
                <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30">
                  flagged
                </Badge>
              )}
              {isAutoCompleted && (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              )}
            </div>

            {/* Summary */}
            <p className="text-sm mb-2">{action.prompt_summary}</p>

            {/* Cost/tokens */}
            {meta && (
              <div className="flex gap-3 text-xs text-muted-foreground mb-2">
                {meta.cost != null && (
                  <span>${(meta.cost as number).toFixed(4)}</span>
                )}
                {meta.tokens_in != null && (
                  <span>{meta.tokens_in as number}→{meta.tokens_out as number} tok</span>
                )}
                {meta.duration_ms != null && (
                  <span>{((meta.duration_ms as number) / 1000).toFixed(1)}s</span>
                )}
              </div>
            )}

            {/* Failure reason */}
            {action.failure_reason && (
              <p className="text-xs text-red-400 mb-2">
                Failed: {action.failure_reason}
              </p>
            )}

            {/* Expandable result */}
            {action.result && (
              <div>
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1"
                >
                  {expanded ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                  {expanded ? "Hide" : "Preview"} result
                </button>
                {expanded && (
                  <div className="mt-2 p-3 rounded-md bg-muted/50 text-sm whitespace-pre-wrap max-h-96 overflow-y-auto">
                    {action.result}
                  </div>
                )}
              </div>
            )}

            {/* Retry input */}
            {showRetryInput && (
              <div className="mt-2 space-y-2">
                <Textarea
                  placeholder="Optional guidance for retry (e.g., 'Focus on the financial argument')"
                  value={retryNote}
                  onChange={(e) => setRetryNote(e.target.value)}
                  className="text-sm h-20"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleRetry}
                    disabled={acting}
                  >
                    Retry
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowRetryInput(false);
                      setRetryNote("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 mt-3">
              {isReviewable && !isAutoCompleted && (
                <>
                  <Button
                    size="sm"
                    onClick={() => handleAction("approve")}
                    disabled={acting}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAction("reject")}
                    disabled={acting}
                  >
                    <X className="h-3.5 w-3.5 mr-1" />
                    Reject
                  </Button>
                </>
              )}

              {isAutoCompleted && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAction("flag")}
                  disabled={acting}
                >
                  <Flag className="h-3.5 w-3.5 mr-1" />
                  Flag issue
                </Button>
              )}

              {isFailed && onRetry && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowRetryInput(true)}
                    disabled={acting || showRetryInput}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Retry
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAction("dismiss")}
                    disabled={acting}
                  >
                    Dismiss
                  </Button>
                </>
              )}

              {(isReviewable || isFailed) && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button size="sm" variant="ghost" className="h-8 w-8 p-0" />}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isReviewable && (
                      <DropdownMenuItem onClick={() => handleAction("flag")}>
                        <Flag className="h-3.5 w-3.5 mr-2" /> Flag issue
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => handleAction("dismiss")}>
                      <X className="h-3.5 w-3.5 mr-2" /> Dismiss
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
