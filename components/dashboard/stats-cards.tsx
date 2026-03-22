"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, CalendarDays, TrendingUp, CheckSquare } from "lucide-react";
import type { BrainStats } from "@/lib/brain/queries";

interface StatsCardsProps {
  stats: BrainStats | null;
  loading?: boolean;
}

export function StatsCards({ stats, loading }: StatsCardsProps) {
  const items = [
    {
      title: "Total Thoughts",
      value: stats?.total ?? 0,
      icon: Brain,
      accent: "text-violet-400",
    },
    {
      title: "This Week",
      value: stats?.recent ?? 0,
      icon: CalendarDays,
      accent: "text-blue-400",
    },
    {
      title: "Daily Avg",
      value: stats?.dailyAvg ?? 0,
      icon: TrendingUp,
      accent: "text-emerald-400",
    },
    {
      title: "Open Tasks",
      value: stats?.openTasks ?? 0,
      icon: CheckSquare,
      accent: "text-amber-400",
    },
  ];

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.title} className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {item.title}
            </CardTitle>
            <item.icon className={`h-4 w-4 ${item.accent}`} />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-3xl font-bold font-mono tabular-nums">{item.value}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
