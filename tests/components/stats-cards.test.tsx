import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatsCards } from "@/components/dashboard/stats-cards";
import type { BrainStats } from "@/lib/brain/queries";

const mockStats: BrainStats = {
  total: 150,
  recent: 30,
  dailyAvg: 4.2,
  byType: [],
  topTopics: [],
  topPeople: [],
  openTasks: 12,
};

describe("StatsCards", () => {
  it("renders all four stat cards", () => {
    render(<StatsCards stats={mockStats} />);

    expect(screen.getByText("Total Thoughts")).toBeInTheDocument();
    expect(screen.getByText("This Week")).toBeInTheDocument();
    expect(screen.getByText("Daily Avg")).toBeInTheDocument();
    expect(screen.getByText("Open Tasks")).toBeInTheDocument();
  });

  it("displays stat values", () => {
    render(<StatsCards stats={mockStats} />);

    expect(screen.getByText("150")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("4.2")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("shows skeletons when loading", () => {
    const { container } = render(<StatsCards stats={null} loading />);

    // Skeleton elements should be rendered
    const skeletons = container.querySelectorAll("[data-slot='skeleton']");
    expect(skeletons.length).toBe(4);
  });

  it("shows zero values when stats are null and not loading", () => {
    render(<StatsCards stats={null} />);

    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBe(4);
  });
});
