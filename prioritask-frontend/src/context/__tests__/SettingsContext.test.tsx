import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import {
  SettingsProvider,
  useSettings,
  SETTINGS_STORAGE_KEY,
  DAILY_GOAL_STORAGE_KEY,
  RETRO_SOUND_MUTED_STORAGE_KEY,
} from "../SettingsContext";

const FIXED_DATE = new Date(2026, 9, 11, 14, 15, 0, 0); // 11 Oct 2026, 14:15:00 local

const SettingsConsumerProbe = () => {
  const {
    settings,
    updateGeneral,
    toggleModuleVisibility,
    toggleFavoriteRoom,
    updateProductivity,
    toggleDayOff,
    resetSettings,
    computeSnoozeTarget,
  } = useSettings();

  const snooze30m = computeSnoozeTarget("30m", FIXED_DATE);
  const snooze3h = computeSnoozeTarget("3h", FIXED_DATE);
  const snoozeTomorrow = computeSnoozeTarget("tomorrow9am", FIXED_DATE);

  return (
    <div>
      <span data-testid="probe-time-format">{settings.general.timeFormat}</span>
      <span data-testid="probe-sound">{String(settings.general.soundEffects)}</span>
      <span data-testid="probe-animations">
        {String(settings.general.enableAnimations)}
      </span>
      <span data-testid="probe-grouped-ai">
        {String(settings.navigation.visibleModules.groupedAi)}
      </span>
      <span data-testid="probe-favorites">
        {settings.navigation.favoriteRoomIds.join(",")}
      </span>
      <span data-testid="probe-daily-goal">
        {settings.productivity.dailyTaskGoal}
      </span>
      <span data-testid="probe-vacation">
        {String(settings.productivity.vacationMode)}
      </span>
      <span data-testid="probe-days-off">
        {settings.productivity.daysOff.join(",")}
      </span>

      <span data-testid="snooze-30m-ms">
        {snooze30m.targetDate.getTime() - FIXED_DATE.getTime()}
      </span>
      <span data-testid="snooze-3h-ms">
        {snooze3h.targetDate.getTime() - FIXED_DATE.getTime()}
      </span>
      <span data-testid="snooze-30m-label">{snooze30m.formattedLabel}</span>
      <span data-testid="snooze-3h-label">{snooze3h.formattedLabel}</span>
      <span data-testid="snooze-tomorrow-label">
        {snoozeTomorrow.formattedLabel}
      </span>
      <span data-testid="snooze-tomorrow-hours">
        {snoozeTomorrow.targetDate.getHours()}:
        {String(snoozeTomorrow.targetDate.getMinutes()).padStart(2, "0")}
      </span>

      <button
        type="button"
        data-testid="btn-set-12h"
        onClick={() => updateGeneral({ timeFormat: "12h" })}
      >
        12h
      </button>
      <button
        type="button"
        data-testid="btn-mute-sound"
        onClick={() => updateGeneral({ soundEffects: false })}
      >
        Mute
      </button>
      <button
        type="button"
        data-testid="btn-disable-animations"
        onClick={() => updateGeneral({ enableAnimations: false })}
      >
        Disable Animations
      </button>
      <button
        type="button"
        data-testid="btn-toggle-grouped-ai"
        onClick={() => toggleModuleVisibility("groupedAi")}
      >
        Toggle Grouped AI
      </button>
      <button
        type="button"
        data-testid="btn-toggle-fav-room"
        onClick={() => toggleFavoriteRoom("room-cocina")}
      >
        Toggle Fav
      </button>
      <button
        type="button"
        data-testid="btn-enable-vacation"
        onClick={() =>
          updateProductivity({ vacationMode: true, dailyTaskGoal: 8 })
        }
      >
        Vacation
      </button>
      <button
        type="button"
        data-testid="btn-toggle-wednesday"
        onClick={() => toggleDayOff(3)}
      >
        Toggle Wed
      </button>
      <button
        type="button"
        data-testid="btn-reset"
        onClick={() => resetSettings()}
      >
        Reset
      </button>
    </div>
  );
};

describe("SettingsContext (Todoist 4-Store Settings Architecture & Snooze Engine)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-reduced-motion");
  });

  it("persiste cambios en localStorage, sincroniza meta diaria/audio/animaciones y permite restablecer ajustes", () => {
    render(
      <SettingsProvider>
        <SettingsConsumerProbe />
      </SettingsProvider>
    );

    expect(screen.getByTestId("probe-daily-goal")).toHaveTextContent("5");
    expect(screen.getByTestId("probe-vacation")).toHaveTextContent("false");
    expect(screen.getByTestId("probe-grouped-ai")).toHaveTextContent("true");

    // Toggle módulo de navegación y favorito
    fireEvent.click(screen.getByTestId("btn-toggle-grouped-ai"));
    expect(screen.getByTestId("probe-grouped-ai")).toHaveTextContent("false");

    fireEvent.click(screen.getByTestId("btn-toggle-fav-room"));
    expect(screen.getByTestId("probe-favorites")).toHaveTextContent(
      "room-cocina"
    );

    // Activar Modo Vacaciones y cambiar meta diaria a 8
    fireEvent.click(screen.getByTestId("btn-enable-vacation"));
    expect(screen.getByTestId("probe-vacation")).toHaveTextContent("true");
    expect(screen.getByTestId("probe-daily-goal")).toHaveTextContent("8");
    expect(localStorage.getItem(DAILY_GOAL_STORAGE_KEY)).toBe("8");

    // Silenciar sonido y desactivar animaciones
    fireEvent.click(screen.getByTestId("btn-mute-sound"));
    fireEvent.click(screen.getByTestId("btn-disable-animations"));
    expect(localStorage.getItem(RETRO_SOUND_MUTED_STORAGE_KEY)).toBe("true");
    expect(document.documentElement.getAttribute("data-reduced-motion")).toBe(
      "true"
    );

    // Agregar miércoles (3) a días de descanso
    fireEvent.click(screen.getByTestId("btn-toggle-wednesday"));
    expect(screen.getByTestId("probe-days-off")).toHaveTextContent("0,3,6");

    // Verificar persistencia JSON en localStorage
    const rawStored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    expect(rawStored).toBeTruthy();
    const parsed = JSON.parse(rawStored!);
    expect(parsed.productivity.vacationMode).toBe(true);
    expect(parsed.navigation.visibleModules.groupedAi).toBe(false);
    expect(parsed.navigation.favoriteRoomIds).toEqual(["room-cocina"]);

    // Restablecer configuración de fábrica
    fireEvent.click(screen.getByTestId("btn-reset"));
    expect(screen.getByTestId("probe-vacation")).toHaveTextContent("false");
    expect(screen.getByTestId("probe-daily-goal")).toHaveTextContent("5");
    expect(screen.getByTestId("probe-grouped-ai")).toHaveTextContent("true");
    expect(screen.getByTestId("probe-favorites")).toHaveTextContent("");
  });

  it("calcula el algoritmo computeSnoozeTarget (+30m = 1800000ms, +3h = 10800000ms, tomorrow9am = 09:00) en formato 24h y 12h", () => {
    render(
      <SettingsProvider>
        <SettingsConsumerProbe />
      </SettingsProvider>
    );

    // Verificar deltas exactos en milisegundos (Todoist Desktop REA)
    expect(screen.getByTestId("snooze-30m-ms")).toHaveTextContent("1800000");
    expect(screen.getByTestId("snooze-3h-ms")).toHaveTextContent("10800000");
    expect(screen.getByTestId("snooze-tomorrow-hours")).toHaveTextContent(
      "9:00"
    );

    // Formato 24h por defecto (base: 14:15 -> +30m = 14:45, +3h = 17:15, mañana = 09:00)
    expect(screen.getByTestId("snooze-30m-label")).toHaveTextContent("14:45");
    expect(screen.getByTestId("snooze-3h-label")).toHaveTextContent("17:15");
    expect(screen.getByTestId("snooze-tomorrow-label")).toHaveTextContent(
      "Mañana 09:00"
    );

    // Cambiar a formato 12h (14:45 -> 2:45 PM, 17:15 -> 5:15 PM, 09:00 -> 9:00 AM)
    fireEvent.click(screen.getByTestId("btn-set-12h"));
    expect(screen.getByTestId("probe-time-format")).toHaveTextContent("12h");
    expect(screen.getByTestId("snooze-30m-label")).toHaveTextContent("2:45 PM");
    expect(screen.getByTestId("snooze-3h-label")).toHaveTextContent("5:15 PM");
    expect(screen.getByTestId("snooze-tomorrow-label")).toHaveTextContent(
      "Mañana 9:00 AM"
    );
  });
});
