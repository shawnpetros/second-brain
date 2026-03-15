import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TaskActions } from "@/components/dashboard/task-actions";

describe("TaskActions", () => {
  it("shows Complete button for untriaged tasks", () => {
    const onStatusChange = vi.fn();
    render(
      <TaskActions
        thoughtId="1"
        status="untriaged"
        onStatusChange={onStatusChange}
      />
    );

    expect(screen.getByTitle("Complete")).toBeInTheDocument();
  });

  it("shows Skip button only for untriaged tasks", () => {
    const onStatusChange = vi.fn();
    render(
      <TaskActions
        thoughtId="1"
        status="untriaged"
        onStatusChange={onStatusChange}
      />
    );

    expect(screen.getByTitle("Skip (move to active)")).toBeInTheDocument();
  });

  it("does not show Skip button for active tasks", () => {
    const onStatusChange = vi.fn();
    render(
      <TaskActions
        thoughtId="1"
        status="active"
        onStatusChange={onStatusChange}
      />
    );

    expect(screen.queryByTitle("Skip (move to active)")).not.toBeInTheDocument();
  });

  it("shows Untriage button for active tasks", () => {
    const onStatusChange = vi.fn();
    render(
      <TaskActions
        thoughtId="1"
        status="active"
        onStatusChange={onStatusChange}
      />
    );

    expect(screen.getByTitle("Move back to untriaged")).toBeInTheDocument();
  });

  it("does not show Complete button for completed tasks", () => {
    const onStatusChange = vi.fn();
    render(
      <TaskActions
        thoughtId="1"
        status="completed"
        onStatusChange={onStatusChange}
      />
    );

    expect(screen.queryByTitle("Complete")).not.toBeInTheDocument();
  });

  it("shows Delete button when onDelete provided", () => {
    const onStatusChange = vi.fn();
    const onDelete = vi.fn();
    render(
      <TaskActions
        thoughtId="1"
        status="untriaged"
        onStatusChange={onStatusChange}
        onDelete={onDelete}
      />
    );

    expect(screen.getByTitle("Delete")).toBeInTheDocument();
  });

  it("does not show Delete button when onDelete not provided", () => {
    const onStatusChange = vi.fn();
    render(
      <TaskActions
        thoughtId="1"
        status="untriaged"
        onStatusChange={onStatusChange}
      />
    );

    expect(screen.queryByTitle("Delete")).not.toBeInTheDocument();
  });

  it("calls onStatusChange with correct params on Complete click", () => {
    const onStatusChange = vi.fn();
    render(
      <TaskActions
        thoughtId="task-1"
        status="untriaged"
        onStatusChange={onStatusChange}
      />
    );

    fireEvent.click(screen.getByTitle("Complete"));

    expect(onStatusChange).toHaveBeenCalledWith("task-1", "completed");
  });

  it("calls onStatusChange with active on Skip click", () => {
    const onStatusChange = vi.fn();
    render(
      <TaskActions
        thoughtId="task-1"
        status="untriaged"
        onStatusChange={onStatusChange}
      />
    );

    fireEvent.click(screen.getByTitle("Skip (move to active)"));

    expect(onStatusChange).toHaveBeenCalledWith("task-1", "active");
  });

  it("calls onDelete on Delete click", () => {
    const onStatusChange = vi.fn();
    const onDelete = vi.fn();
    render(
      <TaskActions
        thoughtId="task-1"
        status="untriaged"
        onStatusChange={onStatusChange}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getByTitle("Delete"));

    expect(onDelete).toHaveBeenCalledWith("task-1");
  });
});
