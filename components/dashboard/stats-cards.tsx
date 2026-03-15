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
    },
    {
      title: "This Week",
      value: stats?.recent ?? 0,
      icon: CalendarDays,
    },
    {
      title: "Daily Avg",
      value: stats?.dailyAvg ?? 0,
      icon: TrendingUp,
    },
    {
      title: "Open Tasks",
      value: stats?.openTasks ?? 0,
      icon: CheckSquare,
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {item.title}
            </CardTitle>
            <item.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <p className="text-2xl font-bold">{item.value}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
