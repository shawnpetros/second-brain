import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AlertCard } from "@/components/dashboard/alert-card";
import type { AlertItem } from "@/lib/brain/queries";

describe("AlertCard", () => {
  it("renders aging untriaged alert", () => {
    const alert: AlertItem = {
      type: "aging_untriaged",
      title: "Untriaged task aging",
      description: "Send the invoice to accounting",
      thought_id: "1",
      age_days: 5,
    };
    render(<AlertCard alert={alert} />);

    expect(screen.getByText("Untriaged")).toBeInTheDocument();
    expect(screen.getByText("Send the invoice to accounting")).toBeInTheDocument();
    expect(screen.getByText("5d")).toBeInTheDocument();
  });

  it("renders stale active alert", () => {
    const alert: AlertItem = {
      type: "stale_active",
      title: "Stale active task",
      description: "Refactor auth module",
      thought_id: "2",
      age_days: 20,
    };
    render(<AlertCard alert={alert} />);

    expect(screen.getByText("Stale")).toBeInTheDocument();
    expect(screen.getByText("20d")).toBeInTheDocument();
  });

  it("renders relationship decay alert", () => {
    const alert: AlertItem = {
      type: "relationship_decay",
      title: "Relationship fading",
      description: "Haven't mentioned Bob in 42 days",
      person: "Bob",
      age_days: 42,
    };
    render(<AlertCard alert={alert} />);

    expect(screen.getByText("Fading")).toBeInTheDocument();
    expect(screen.getByText("42d")).toBeInTheDocument();
    expect(screen.getByText("Haven't mentioned Bob in 42 days")).toBeInTheDocument();
  });

  it("calls onAction when Review button clicked", () => {
    const alert: AlertItem = {
      type: "aging_untriaged",
      title: "Test",
      description: "Test alert",
      age_days: 3,
    };
    const onAction = vi.fn();
    render(<AlertCard alert={alert} onAction={onAction} />);

    fireEvent.click(screen.getByText("Review"));

    expect(onAction).toHaveBeenCalledWith(alert);
  });

  it("does not show Review button without onAction", () => {
    const alert: AlertItem = {
      type: "aging_untriaged",
      title: "Test",
      description: "Test alert",
      age_days: 3,
    };
    render(<AlertCard alert={alert} />);

    expect(screen.queryByText("Review")).not.toBeInTheDocument();
  });
});
