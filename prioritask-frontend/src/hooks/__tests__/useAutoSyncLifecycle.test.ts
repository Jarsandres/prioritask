import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useAutoSyncLifecycle } from "../useAutoSyncLifecycle";

describe("useAutoSyncLifecycle Hook", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("evento online: a los 400 ms no se ha llamado a onSync, a los 500 ms se llama exactamente 1 vez", () => {
    const onSync = vi.fn();
    renderHook(() => useAutoSyncLifecycle({ onSync, debounceMs: 500 }));

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onSync).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it("múltiples eventos online rápidos seguidos: sólo se llama 1 vez tras 500 ms del último evento", () => {
    const onSync = vi.fn();
    renderHook(() => useAutoSyncLifecycle({ onSync, debounceMs: 500 }));

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onSync).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onSync).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onSync).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it("evento visibilitychange a 'visible': dispara sync con 500 ms de debounce", () => {
    const onSync = vi.fn();
    renderHook(() => useAutoSyncLifecycle({ onSync, debounceMs: 500 }));

    // Simular pestaña oculta
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onSync).not.toHaveBeenCalled();

    // Simular retorno a primer plano (visible)
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onSync).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it("watchdog de suspensión/sleep: detecta salto temporal y dispara sync con debounce", () => {
    const onSync = vi.fn();
    renderHook(() =>
      useAutoSyncLifecycle({
        onSync,
        debounceMs: 500,
        watchdogIntervalMs: 5000,
        sleepThresholdMs: 15000,
      })
    );

    // Ticks normales cada 5 segundos no deben disparar sync
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onSync).not.toHaveBeenCalled();

    // Simular que el sistema estuvo suspendido durante 30 segundos
    act(() => {
      vi.setSystemTime(Date.now() + 30000);
      vi.advanceTimersByTime(5000);
    });

    // Todavía dentro del debounce de 500ms
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onSync).not.toHaveBeenCalled();

    // Al completarse los 500ms de debounce se dispara
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it("desmontaje del componente: limpia listeners y cancela callbacks pendientes", () => {
    const onSync = vi.fn();
    const { unmount } = renderHook(() =>
      useAutoSyncLifecycle({ onSync, debounceMs: 500 })
    );

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Desmontar antes de que venza el debounce
    unmount();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onSync).not.toHaveBeenCalled();

    // Nuevos eventos tras unmount no deben activar nada
    act(() => {
      window.dispatchEvent(new Event("online"));
      vi.advanceTimersByTime(1000);
    });
    expect(onSync).not.toHaveBeenCalled();
  });

  it("no dispara sincronización cuando enabled es false o navigator.onLine es false", () => {
    const onSync = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useAutoSyncLifecycle({ onSync, debounceMs: 500, enabled }),
      { initialProps: { enabled: false } }
    );

    act(() => {
      window.dispatchEvent(new Event("online"));
      vi.advanceTimersByTime(1000);
    });
    expect(onSync).not.toHaveBeenCalled();

    // Habilitar pero simular desconexión
    rerender({ enabled: true });
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });

    act(() => {
      window.dispatchEvent(new Event("online"));
      vi.advanceTimersByTime(1000);
    });
    expect(onSync).not.toHaveBeenCalled();
  });
});
