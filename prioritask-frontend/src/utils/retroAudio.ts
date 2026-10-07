/**
 * Utilidad de síntesis de sonido procedural de 8-bit usando Web Audio API nativa.
 * Cero assets de audio externos (0 kB de transferencia de red).
 */

const AUDIO_STORAGE_KEY = "prioritask_retro_muted";

export const isRetroAudioMuted = (): boolean => {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(AUDIO_STORAGE_KEY) === "true";
};

export const setRetroAudioMuted = (muted: boolean): void => {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUDIO_STORAGE_KEY, muted ? "true" : "false");
  // Notificar cambio a otras pestañas/componentes
  window.dispatchEvent(new CustomEvent("retro_audio_mute_changed", { detail: { muted } }));
};

let sharedAudioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    sharedAudioContext = new AudioCtx();
  }
  if (sharedAudioContext.state === "suspended") {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
};

/**
 * Sonido icónico estilo Moneda Game Boy / NES 8-bit al completar tareas.
 */
export const playRetroRewardSound = (): void => {
  if (isRetroAudioMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  // Onda cuadrada típica de consolas 8-bit
  osc.type = "square";

  // Arpegio de moneda: B5 (987.77 Hz) -> E6 (1318.51 Hz)
  osc.frequency.setValueAtTime(987.77, now);
  osc.frequency.setValueAtTime(1318.51, now + 0.08);

  // Envolvente rápida de volumen
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.setValueAtTime(0.12, now + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.36);
};

/**
 * Fanfarria triunfal 8-bit para canje de recompensas o récords.
 */
export const playRetroFanfareSound = (): void => {
  if (isRetroAudioMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const notes = [
    { freq: 523.25, time: 0.00, dur: 0.10 }, // C5
    { freq: 659.25, time: 0.10, dur: 0.10 }, // E5
    { freq: 783.99, time: 0.20, dur: 0.10 }, // G5
    { freq: 1046.50, time: 0.30, dur: 0.28 }, // C6
  ];

  notes.forEach(({ freq, time, dur }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "square";
    osc.frequency.setValueAtTime(freq, now + time);

    gain.gain.setValueAtTime(0.15, now + time);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + time + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + time);
    osc.stop(now + time + dur + 0.01);
  });
};
