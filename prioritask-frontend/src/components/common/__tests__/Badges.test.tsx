import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PriorityBadge } from "../Badges";

describe("PriorityBadge — escala canónica de prioridad", () => {
  it("etiqueta peso 5 como Prioridad Urgente (P1) y peso 4 como Prioridad Alta (P2)", () => {
    const { unmount } = render(<PriorityBadge peso={5} />);
    const urgent = screen.getByText("Prioridad Urgente");
    expect(urgent).toHaveClass("retro-badge-high");
    unmount();

    render(<PriorityBadge peso={4} />);
    const high = screen.getByText("Prioridad Alta");
    expect(high).toHaveClass("retro-badge-high");
  });

  it("etiqueta peso 3 como Prioridad Media y peso 2 como Prioridad Baja", () => {
    const { unmount } = render(<PriorityBadge peso={3} />);
    expect(screen.getByText("Prioridad Media")).toHaveClass(
      "retro-badge-medium"
    );
    unmount();

    render(<PriorityBadge peso={2} />);
    expect(screen.getByText("Prioridad Baja")).toHaveClass("retro-badge-low");
  });
});
