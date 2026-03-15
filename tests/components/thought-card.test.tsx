import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThoughtCard } from "@/components/dashboard/thought-card";
import type { ThoughtRecord } from "@/lib/brain/queries";

const mockThought: ThoughtRecord = {
  id: "abc-123",
  raw_text: "This is an important insight about testing",
  thought_type: "insight",
  status: "active",
  people: ["Alice", "Bob"],
  topics: ["testing", "quality"],
  action_items: [],
  source: "mcp",
  created_at: "2026-03-15T10:30:00Z",
  updated_at: "2026-03-15T10:30:00Z",
};

describe("ThoughtCard", () => {
  it("renders thought text", () => {
    render(<ThoughtCard thought={mockThought} />);

    expect(screen.getByText("This is an important insight about testing")).toBeInTheDocument();
  });

  it("renders thought type badge", () => {
    render(<ThoughtCard thought={mockThought} />);

    expect(screen.getByText("insight")).toBeInTheDocument();
  });

  it("renders people badges", () => {
    render(<ThoughtCard thought={mockThought} />);

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("renders topic badges", () => {
    render(<ThoughtCard thought={mockThought} />);

    expect(screen.getByText("testing")).toBeInTheDocument();
    expect(screen.getByText("quality")).toBeInTheDocument();
  });

  it("renders formatted date", () => {
    render(<ThoughtCard thought={mockThought} />);

    // The date format is "Mar 15, 10:30 AM" or similar depending on locale
    const dateEl = screen.getByText(/Mar/);
    expect(dateEl).toBeInTheDocument();
  });

  it("shows similarity badge when showSimilarity is true", () => {
    const thoughtWithSimilarity = { ...mockThought, similarity: 0.923 };
    render(<ThoughtCard thought={thoughtWithSimilarity} showSimilarity />);

    expect(screen.getByText("92% match")).toBeInTheDocument();
  });

  it("does not show similarity badge when showSimilarity is false", () => {
    const thoughtWithSimilarity = { ...mockThought, similarity: 0.923 };
    render(<ThoughtCard thought={thoughtWithSimilarity} />);

    expect(screen.queryByText("92% match")).not.toBeInTheDocument();
  });

  it("shows status badge for action items with non-active status", () => {
    const task: ThoughtRecord = {
      ...mockThought,
      thought_type: "action_item",
      status: "untriaged",
    };
    render(<ThoughtCard thought={task} />);

    expect(screen.getByText("untriaged")).toBeInTheDocument();
  });

  it("does not show people/topic section when arrays are empty", () => {
    const emptyThought: ThoughtRecord = {
      ...mockThought,
      people: [],
      topics: [],
    };
    render(<ThoughtCard thought={emptyThought} />);

    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });
});
