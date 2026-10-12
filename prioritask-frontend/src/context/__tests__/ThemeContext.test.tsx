import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { ThemeProvider, useTheme } from "../ThemeContext";

const ThemeConsumerProbe = () => {
  const {
    theme,
    setTheme,
    accent,
    setAccent,
    density,
    setDensity,
    getRoomBranding,
    setRoomBranding,
  } = useTheme();

  const roomStyle = getRoomBranding("room-cocina", 0);

  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <span data-testid="current-accent">{accent}</span>
      <span data-testid="current-density">{density}</span>
      <span data-testid="room-icon">{roomStyle.icon}</span>
      <span data-testid="room-color">{roomStyle.color}</span>
      <button
        type="button"
        onClick={() => setAccent("crimson")}
        data-testid="btn-crimson"
      >
        Crimson
      </button>
      <button
        type="button"
        onClick={() => setAccent("oled")}
        data-testid="btn-oled"
      >
        OLED
      </button>
      <button
        type="button"
        onClick={() => setTheme("light")}
        data-testid="btn-light"
      >
        Light
      </button>
      <button
        type="button"
        onClick={() => setDensity("compact")}
        data-testid="btn-compact"
      >
        Compact
      </button>
      <button
        type="button"
        onClick={() =>
          setRoomBranding("room-cocina", { icon: "🍳", color: "#059669" })
        }
        data-testid="btn-brand-room"
      >
        Brand Room
      </button>
    </div>
  );
};

describe("ThemeContext (Theme Studio, UI Density & Room Branding)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-accent");
    document.documentElement.removeAttribute("data-density");
  });

  it("aplica paleta de acento, densidad de interfaz y branding de sala persistiendo en localStorage y atributos DOM", () => {
    render(
      <ThemeProvider>
        <ThemeConsumerProbe />
      </ThemeProvider>
    );

    expect(screen.getByTestId("current-accent")).toHaveTextContent("cobalt");
    expect(screen.getByTestId("current-density")).toHaveTextContent("standard");

    fireEvent.click(screen.getByTestId("btn-crimson"));
    expect(screen.getByTestId("current-accent")).toHaveTextContent("crimson");
    expect(document.documentElement.getAttribute("data-accent")).toBe(
      "crimson"
    );
    expect(localStorage.getItem("prioritask-accent")).toBe("crimson");

    // OLED activa automáticamente modo oscuro
    fireEvent.click(screen.getByTestId("btn-oled"));
    expect(screen.getByTestId("current-theme")).toHaveTextContent("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    // Al volver a modo claro desde OLED, restablece el acento a cobalt para evitar variables oscuras en tema claro
    fireEvent.click(screen.getByTestId("btn-light"));
    expect(screen.getByTestId("current-theme")).toHaveTextContent("light");
    expect(screen.getByTestId("current-accent")).toHaveTextContent("cobalt");

    // Densidad compacta
    fireEvent.click(screen.getByTestId("btn-compact"));
    expect(screen.getByTestId("current-density")).toHaveTextContent("compact");
    expect(document.documentElement.getAttribute("data-density")).toBe(
      "compact"
    );

    // Branding personalizado por sala
    fireEvent.click(screen.getByTestId("btn-brand-room"));
    expect(screen.getByTestId("room-icon")).toHaveTextContent("🍳");
    expect(screen.getByTestId("room-color")).toHaveTextContent("#059669");
  });
});
