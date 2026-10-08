import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isRetroAudioMuted,
  setRetroAudioMuted,
  unlockRetroAudio,
  playRetroRewardSound,
  playRetroFanfareSound,
} from "../retroAudio";

describe("retroAudio", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("gestiona el estado de muteado correctamente en localStorage", () => {
    expect(isRetroAudioMuted()).toBe(false);

    setRetroAudioMuted(true);
    expect(isRetroAudioMuted()).toBe(true);

    setRetroAudioMuted(false);
    expect(isRetroAudioMuted()).toBe(false);
  });

  it("registra listeners pasivos para desbloquear el AudioContext en la primera interacción", () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");

    unlockRetroAudio();

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "pointerdown",
      expect.any(Function),
      { once: true, passive: true }
    );
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "touchstart",
      expect.any(Function),
      { once: true, passive: true }
    );
  });

  it("no reproduce sonidos si el audio está silenciado", () => {
    setRetroAudioMuted(true);

    // Mock AudioContext
    const mockResume = vi.fn().mockResolvedValue(undefined);
    const mockCreateOscillator = vi.fn();
    class MockAudioContext {
      state = "running";
      currentTime = 0;
      resume = mockResume;
      createOscillator = mockCreateOscillator;
      createGain = vi.fn();
      destination = {};
    }
    window.AudioContext = MockAudioContext as unknown as typeof AudioContext;

    playRetroRewardSound();
    playRetroFanfareSound();

    expect(mockCreateOscillator).not.toHaveBeenCalled();
  });

  it("reproduce arpegio de recompensa y fanfarria cuando no está silenciado", () => {
    setRetroAudioMuted(false);

    const mockStart = vi.fn();
    const mockStop = vi.fn();
    const mockConnect = vi.fn();
    const mockSetValueAtTime = vi.fn();
    const mockExponentialRampToValueAtTime = vi.fn();

    const mockOscillator = {
      type: "sine",
      frequency: {
        setValueAtTime: mockSetValueAtTime,
      },
      connect: mockConnect,
      start: mockStart,
      stop: mockStop,
    };

    const mockGain = {
      gain: {
        setValueAtTime: mockSetValueAtTime,
        exponentialRampToValueAtTime: mockExponentialRampToValueAtTime,
      },
      connect: mockConnect,
    };

    class MockAudioContext {
      state = "running";
      currentTime = 0;
      resume = vi.fn().mockResolvedValue(undefined);
      createOscillator = vi.fn(() => mockOscillator);
      createGain = vi.fn(() => mockGain);
      destination = {};
    }
    window.AudioContext = MockAudioContext as unknown as typeof AudioContext;

    playRetroRewardSound();
    expect(mockStart).toHaveBeenCalled();

    playRetroFanfareSound();
    expect(mockStart).toHaveBeenCalledTimes(5); // 1 from reward + 4 from fanfare notes
  });
});
