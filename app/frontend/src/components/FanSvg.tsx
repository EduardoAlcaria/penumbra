import { useMemo } from "react";
import type { LayoutFan } from "@/lib/api";

/**
 * A fan drawn as SVG, with its RGB actually in the drawing: the lit parts are
 * gradients built from the live LED colors, not a tint layer laid over a photo.
 *
 * Which artwork a fan gets is derived from where its LEDs sit in the component's
 * own grid, so all 209 bundled components are covered without a per-model asset:
 *
 *  - `frame` — LEDs trace the grid's outer edge (a JUMPEAK CS120, most unibody
 *    fans): a lit square band around the body.
 *  - `ring`  — LEDs form a loop inside the body: a lit circle around the hub.
 *  - `grid`  — anything else: each LED lit where its cell falls.
 */
export type FanModel = "frame" | "ring" | "grid";

const VIEW = 100;   // viewBox side; the fan is square
const OFF = "#15171c"; // an unlit LED, dark but not pure black

/** Pick the artwork that matches a component's LED layout. */
export function modelFor(fan: LayoutFan): FanModel {
  const { cols, rows, leds } = fan;
  if (leds.length === 0) return "grid";
  const onEdge = leds.every((l) => l.cx === 0 || l.cy === 0 || l.cx === cols - 1 || l.cy === rows - 1);
  if (onEdge && cols > 2 && rows > 2) return "frame";
  return leds.length >= 8 ? "ring" : "grid";
}

const color = (colors: string[], i: number) => {
  const c = colors[i];
  return !c || c === "#000000" ? OFF : c;
};

/** Evenly spaced stops across a run of LED colors. */
function Stops({ list }: { list: string[] }) {
  if (list.length === 1) return <><stop offset="0%" stopColor={list[0]} /><stop offset="100%" stopColor={list[0]} /></>;
  return (
    <>
      {list.map((c, i) => (
        <stop key={i} offset={`${(i / (list.length - 1)) * 100}%`} stopColor={c} />
      ))}
    </>
  );
}

/** The fan body: octagonal shroud, hub and blades. Static — only the RGB moves. */
function Body() {
  const blades = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * Math.PI * 2;
    const r0 = 13, r1 = 38;
    const x0 = 50 + Math.cos(a) * r0, y0 = 50 + Math.sin(a) * r0;
    const x1 = 50 + Math.cos(a + 0.75) * r1, y1 = 50 + Math.sin(a + 0.75) * r1;
    const cx = 50 + Math.cos(a + 0.15) * r1 * 0.75, cy = 50 + Math.sin(a + 0.15) * r1 * 0.75;
    return `M${x0} ${y0} Q${cx} ${cy} ${x1} ${y1} A${r1} ${r1} 0 0 0 ${
      50 + Math.cos(a + 0.32) * r1
    } ${50 + Math.sin(a + 0.32) * r1} Z`;
  });
  return (
    <>
      {/* frame body, corners clipped like a real unibody fan */}
      <path
        d="M22 6 H78 L94 22 V78 L78 94 H22 L6 78 V22 Z"
        fill="#1b1e24"
        stroke="#000"
        strokeWidth="1"
      />
      <circle cx="50" cy="50" r="39" fill="#101216" />
      {blades.map((d, i) => (
        <path key={i} d={d} fill="#23262d" stroke="#0c0e12" strokeWidth="0.6" />
      ))}
      <circle cx="50" cy="50" r="13" fill="#2a2e36" stroke="#0c0e12" strokeWidth="1" />
      <circle cx="50" cy="50" r="4" fill="#4a505c" />
    </>
  );
}

export default function FanSvg({
  fan,
  colors,
  model,
  className,
}: {
  fan: LayoutFan;
  colors: string[];
  model?: FanModel;
  className?: string;
}) {
  const kind = model ?? modelFor(fan);
  // Gradient ids must be unique per fan or every fan reuses the first one's RGB.
  const uid = `f${fan.channel}-${fan.position}`;

  const lit = useMemo(() => {
    const { cols, rows, leds } = fan;
    const at = (l: (typeof leds)[number]) => color(colors, l.flatIndex);

    if (kind === "frame") {
      // Sides of the grid, each in the order the strip runs.
      const top = leds.filter((l) => l.cy === 0).sort((a, b) => a.cx - b.cx).map(at);
      const bottom = leds.filter((l) => l.cy === rows - 1).sort((a, b) => a.cx - b.cx).map(at);
      const left = leds.filter((l) => l.cx === 0 && l.cy > 0 && l.cy < rows - 1)
        .sort((a, b) => a.cy - b.cy).map(at);
      const right = leds.filter((l) => l.cx === cols - 1 && l.cy > 0 && l.cy < rows - 1)
        .sort((a, b) => a.cy - b.cy).map(at);
      return { top, bottom, left, right };
    }
    return null;
  }, [fan, colors, kind]);

  return (
    <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className={className} shapeRendering="geometricPrecision">
      <defs>
        <filter id={`glow-${uid}`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
        {lit && (
          <>
            <linearGradient id={`t-${uid}`} x1="0" y1="0" x2="1" y2="0">
              <Stops list={lit.top} />
            </linearGradient>
            <linearGradient id={`b-${uid}`} x1="0" y1="0" x2="1" y2="0">
              <Stops list={lit.bottom} />
            </linearGradient>
            <linearGradient id={`l-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <Stops list={lit.left.length ? lit.left : [lit.top[0], lit.bottom[0]]} />
            </linearGradient>
            <linearGradient id={`r-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <Stops
                list={
                  lit.right.length
                    ? lit.right
                    : [lit.top[lit.top.length - 1], lit.bottom[lit.bottom.length - 1]]
                }
              />
            </linearGradient>
          </>
        )}
      </defs>

      <Body />

      {kind === "frame" && lit && (
        // Drawn twice: a blurred pass for the bloom, then the strip itself.
        [`glow`, `strip`].map((pass) => (
          <g key={pass} filter={pass === "glow" ? `url(#glow-${uid})` : undefined}
             opacity={pass === "glow" ? 0.85 : 1}>
            <rect x="14" y="2.5" width="72" height="5" rx="2.5" fill={`url(#t-${uid})`} />
            <rect x="14" y="92.5" width="72" height="5" rx="2.5" fill={`url(#b-${uid})`} />
            <rect x="2.5" y="14" width="5" height="72" rx="2.5" fill={`url(#l-${uid})`} />
            <rect x="92.5" y="14" width="5" height="72" rx="2.5" fill={`url(#r-${uid})`} />
          </g>
        ))
      )}

      {kind === "ring" &&
        // One arc per LED, stroked from its color to the next one's.
        [`glow`, `strip`].map((pass) => (
          <g key={pass} filter={pass === "glow" ? `url(#glow-${uid})` : undefined}
             opacity={pass === "glow" ? 0.85 : 1}>
            {fan.leds.map((led, i) => {
              const n = fan.leds.length;
              const a0 = (i / n) * Math.PI * 2 - Math.PI / 2;
              const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
              const R = 44;
              const p = (a: number) => [50 + Math.cos(a) * R, 50 + Math.sin(a) * R];
              const [x0, y0] = p(a0), [x1, y1] = p(a1);
              const gid = `a-${uid}-${i}`;
              const next = fan.leds[(i + 1) % n];
              return (
                <g key={led.flatIndex}>
                  <defs>
                    <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1={x0} y1={y0} x2={x1} y2={y1}>
                      <stop offset="0%" stopColor={color(colors, led.flatIndex)} />
                      <stop offset="100%" stopColor={color(colors, next.flatIndex)} />
                    </linearGradient>
                  </defs>
                  <path
                    d={`M${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1}`}
                    fill="none"
                    stroke={`url(#${gid})`}
                    strokeWidth="5"
                    strokeLinecap="round"
                  />
                </g>
              );
            })}
          </g>
        ))}

      {kind === "grid" &&
        [`glow`, `strip`].map((pass) => (
          <g key={pass} filter={pass === "glow" ? `url(#glow-${uid})` : undefined}
             opacity={pass === "glow" ? 0.85 : 1}>
            {fan.leds.map((led) => (
              <rect
                key={led.flatIndex}
                x={(led.cx / fan.cols) * VIEW}
                y={(led.cy / fan.rows) * VIEW}
                width={VIEW / fan.cols}
                height={VIEW / fan.rows}
                rx={1.5}
                fill={color(colors, led.flatIndex)}
              />
            ))}
          </g>
        ))}
    </svg>
  );
}
