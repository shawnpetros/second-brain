"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, AlertTriangle, Users } from "lucide-react";
import type { AlertItem } from "@/lib/brain/queries";

const alertConfig = {
  aging_untriaged: { icon: Clock, color: "text-yellow-400", label: "Untriaged" },
  stale_active: { icon: AlertTriangle, color: "text-orange-400", label: "Stale" },
  relationship_decay: { icon: Users, color: "text-purple-400", label: "Fading" },
} as const;

interface AlertCardProps {
  alert: AlertItem;
  onAction?: (alert: AlertItem) => void;
}

export function AlertCard({ alert, onAction }: AlertCardProps) {
  const config = alertConfig[alert.type];
  const Icon = config.icon;

  return (
    <Card className="min-w-[280px] shrink-0 border-border/50">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${config.color}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs">
                {config.label}
              </Badge>
              <span className="text-xs text-muted-foreground">{alert.age_days}d</span>
            </div>
            <p className="text-sm line-clamp-2">{alert.description}</p>
            {onAction && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 h-7 text-xs"
                onClick={() => onAction(alert)}
              >
                Review
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
