import { useEffect, useRef } from "react";
import type { EffectRequest } from "../lib/api";

const REDUCE =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const wrap360 = (deg: number) => ((deg % 360) + 360) % 360;

interface Props {
  effect: EffectRequest["type"];
  color: string;
  speed: number;
}

/**
 * Renders the ACTIVE effect the way the hardware runs it — a live strip of light.
 * This is the page's signature: the app shows the light it controls. It also
 * publishes the current color to the `--glow` CSS var so the ambient page glow
 * tracks the effect. Honors reduced-motion by drawing a single still frame.
 */
export default function LivePreview({ effect, color, speed }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const [r, g, b] = hexToRgb(color);
    const start = performance.now();
    let raf = 0;

    const draw = (now: number) => {
      const t = REDUCE ? 0.4 : (now - start) / 1000;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      let glow = color;
      if (effect === "rainbow") {
        const segs = 96;
        const shift = t * speed * 140;
        for (let i = 0; i < segs; i++) {
          const hue = wrap360((i / segs) * 360 - shift);
          ctx.fillStyle = `hsl(${hue} 90% 58%)`;
          ctx.fillRect((i / segs) * w, 0, w / segs + 1, h);
        }
        glow = `hsl(${wrap360(-shift)} 90% 58%)`;
      } else if (effect === "breathing") {
        const k = REDUCE ? 0.7 : 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * speed * 3));
        const c = `rgb(${Math.round(r * k)} ${Math.round(g * k)} ${Math.round(b * k)})`;
        ctx.fillStyle = c;
        ctx.fillRect(0, 0, w, h);
        glow = c;
      } else {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, w, h);
      }

      document.documentElement.style.setProperty("--glow", glow);
      if (!REDUCE) raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [effect, color, speed]);

  return <canvas ref={canvasRef} className="block h-full w-full" />;
}
