"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2 } from "lucide-react";
import type { ThoughtRecord } from "@/lib/brain/queries";

interface CaptureDialogProps {
  onCapture: (text: string) => Promise<ThoughtRecord>;
  trigger?: React.ReactNode;
}

export function CaptureDialog({ onCapture, trigger }: CaptureDialogProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ThoughtRecord | null>(null);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const thought = await onCapture(text.trim());
      setResult(thought);
      setText("");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setResult(null);
    setText("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
      <DialogTrigger
        render={trigger ? (trigger as React.ReactElement) : (
          <Button size="icon" className="h-12 w-12 rounded-full shadow-lg" />
        )}
      >
        {!trigger && <Plus className="h-5 w-5" />}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{result ? "Captured!" : "New Thought"}</DialogTitle>
        </DialogHeader>
        {result ? (
          <div className="space-y-3">
            <p className="text-sm">{result.raw_text}</p>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline">
                {result.thought_type.replace(/_/g, " ")}
              </Badge>
              {result.topics?.map((t) => (
                <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
              ))}
              {result.people?.map((p) => (
                <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
              ))}
            </div>
            <Button className="w-full" onClick={handleClose}>Done</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Textarea
              placeholder="What's on your mind?"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-h-[120px]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  handleSubmit();
                }
              }}
            />
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                {"\u2318"}+Enter to save
              </span>
              <Button onClick={handleSubmit} disabled={!text.trim() || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Capture
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
