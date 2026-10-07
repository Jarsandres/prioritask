import { useCallback, useEffect, useRef } from "react";
import { playRetroRewardSound, playRetroFanfareSound } from "../utils/retroAudio";

interface PixelParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
  rotation: number;
  vRot: number;
}

const RETRO_PALETTE = [
  "#f59e0b", // Oro 8-bit
  "#06b6d4", // Cyan arcade
  "#ec4899", // Magenta retro
  "#10b981", // Verde esmeralda
  "#8b5cf6", // Violeta arcade
  "#f43f5e", // Carmesí retro
  "#ffffff", // Destello blanco
];

export const usePixelConfetti = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (canvasRef.current && canvasRef.current.parentNode) {
        canvasRef.current.parentNode.removeChild(canvasRef.current);
      }
    };
  }, []);

  const firePixelConfetti = useCallback(
    (origin?: { x: number; y: number }) => {
      if (typeof window === "undefined") return;

      // Respeto absoluto a accesibilidad y prefers-reduced-motion
      const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      if (prefersReducedMotion) return;

      // Crear o reutilizar canvas superpuesto
      let canvas = canvasRef.current;
      if (!canvas || !canvas.parentNode) {
        canvas = document.createElement("canvas");
        canvas.style.position = "fixed";
        canvas.style.inset = "0";
        canvas.style.width = "100vw";
        canvas.style.height = "100vh";
        canvas.style.pointerEvents = "none";
        canvas.style.zIndex = "99999";
        canvas.style.imageRendering = "pixelated";
        document.body.appendChild(canvas);
        canvasRef.current = canvas;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.scale(dpr, dpr);

      const originX = origin ? origin.x : window.innerWidth / 2;
      const originY = origin ? origin.y : window.innerHeight * 0.45;

      const particles: PixelParticle[] = [];
      const particleCount = 55;

      for (let i = 0; i < particleCount; i++) {
        const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.6;
        const speed = 4 + Math.random() * 8;
        particles.push({
          x: originX,
          y: originY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 3.5, // Impulso inicial hacia arriba
          size: Math.floor(Math.random() * 3 + 2) * 2, // Cuadrados de 4px, 6px u 8px
          color: RETRO_PALETTE[Math.floor(Math.random() * RETRO_PALETTE.length)],
          alpha: 1.0,
          decay: 0.012 + Math.random() * 0.014,
          rotation: Math.floor(Math.random() * 4) * (Math.PI / 2),
          vRot: (Math.random() - 0.5) * 0.2,
        });
      }

      const gravity = 0.25;

      const render = () => {
        if (!ctx || !canvas) return;
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

        let activeCount = 0;

        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          if (p.alpha <= 0) continue;

          activeCount++;
          p.x += p.vx;
          p.y += p.vy;
          p.vy += gravity;
          p.vx *= 0.98;
          p.rotation += p.vRot;
          p.alpha -= p.decay;

          ctx.save();
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.fillStyle = p.color;
          ctx.translate(Math.round(p.x), Math.round(p.y));
          ctx.rotate(p.rotation);
          // Rectángulo pixelado nítido
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
        }

        if (activeCount > 0) {
          animFrameRef.current = requestAnimationFrame(render);
        } else {
          ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
          if (canvas.parentNode) {
            canvas.parentNode.removeChild(canvas);
          }
          canvasRef.current = null;
        }
      };

      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      animFrameRef.current = requestAnimationFrame(render);
    },
    []
  );

  /**
   * Dispara confeti pixelado y reproduce el sonido de recompensa Game Boy procedural
   */
  const triggerCelebration = useCallback(
    (origin?: { x: number; y: number }) => {
      playRetroRewardSound();
      firePixelConfetti(origin);
    },
    [firePixelConfetti]
  );

  /**
   * Dispara confeti y reproduce fanfarria triunfal para logros y canjes
   */
  const triggerFanfare = useCallback(
    (origin?: { x: number; y: number }) => {
      playRetroFanfareSound();
      firePixelConfetti(origin);
    },
    [firePixelConfetti]
  );

  return { firePixelConfetti, triggerCelebration, triggerFanfare };
};

export default usePixelConfetti;
