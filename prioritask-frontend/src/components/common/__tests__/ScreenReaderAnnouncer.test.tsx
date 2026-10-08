import { render, screen, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ScreenReaderAnnouncer, { announce } from "../ScreenReaderAnnouncer";

describe("ScreenReaderAnnouncer", () => {
  it("renderiza una región aria-live polite oculta para lectores de pantalla", () => {
    render(<ScreenReaderAnnouncer />);

    const region = screen.getByRole("status");
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveAttribute("aria-atomic", "true");
  });

  it("actualiza el mensaje cuando se invoca announce()", () => {
    render(<ScreenReaderAnnouncer />);

    act(() => {
      announce("Nueva tarea añadida");
    });

    const region = screen.getByRole("status");
    expect(region).toHaveTextContent("Nueva tarea añadida");
  });
});
