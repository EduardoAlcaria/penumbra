import type { LayoutFan } from "@/lib/api";

/**
 * A fan drawn as SVG, with its RGB actually in the drawing: the lit parts are
 * gradients built from the live LED colors, not a tint layer laid over a photo.
 *
 * Several artworks are available because two fans with the same LED count can
 * look nothing alike. `auto` guesses from where the LEDs sit in the component's
 * grid; the user can override it per channel and that choice is persisted.
 */

export const FAN_MODELS = ["auto", "frame", "ring", "dual", "corners", "grid", "strip"] as const;
export type FanModel = (typeof FAN_MODELS)[number];

export const MODEL_LABELS: Record<FanModel, string> = {
  auto: "Auto",
  frame: "Lit frame",
  ring: "Single ring",
  dual: "Dual ring",
  corners: "Corner arcs",
  grid: "Per-LED cells",
  strip: "Plain strip",
};

const VIEW = 100; // viewBox side; a fan is square
/** An unlit LED. Not pure black — it still has to read as a diffuser. */
const OFF = "#191c22";

/** Guess the artwork from a component's LED layout. */
export function modelFor(fan: LayoutFan): Exclude<FanModel, "auto"> {
  const { cols, rows, leds } = fan;
  if (leds.length === 0) return "grid";
  if (rows <= 1 || cols <= 1) return "strip";
  const onEdge = leds.every((l) => l.cx === 0 || l.cy === 0 || l.cx === cols - 1 || l.cy === rows - 1);
  if (onEdge && cols > 2 && rows > 2) return "frame";
  return leds.length >= 8 ? "ring" : "grid";
}

const colorAt = (colors: string[], i: number) => {
  const c = colors[i];
  return !c || c === "#000000" ? OFF : c;
};

/** Evenly spaced stops across a run of LED colors. */
function stops(list: string[]) {
  const safe = list.length ? list : [OFF];
  if (safe.length === 1) {
    return [
      <stop key="a" offset="0%" stopColor={safe[0]} />,
      <stop key="b" offset="100%" stopColor={safe[0]} />,
    ];
  }
  return safe.map((c, i) => (
    <stop key={i} offset={`${(i / (safe.length - 1)) * 100}%`} stopColor={c} />
  ));
}

/** A run of LED colors laid around a circle as one arc each. */
function Arcs({
  uid,
  tag,
  colors,
  radius,
  width,
  from = -Math.PI / 2,
  sweep = Math.PI * 2,
}: {
  uid: string;
  tag: string;
  colors: string[];
  radius: number;
  width: number;
  from?: number;
  sweep?: number;
}) {
  const n = colors.length;
  if (n === 0) return null;
  const closed = Math.abs(sweep - Math.PI * 2) < 1e-6;
  const pt = (a: number) => [50 + Math.cos(a) * radius, 50 + Math.sin(a) * radius];
  return (
    <>
      {colors.map((c, i) => {
        const a0 = from + (i / n) * sweep;
        const a1 = from + ((i + 1) / n) * sweep;
        if (!closed && i === n - 1) return null;
        const [x0, y0] = pt(a0);
        const [x1, y1] = pt(a1);
        const id = `${tag}-${uid}-${i}`;
        return (
          <g key={i}>
            <defs>
              <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={x0} y1={y0} x2={x1} y2={y1}>
                <stop offset="0%" stopColor={c} />
                <stop offset="100%" stopColor={colors[(i + 1) % n]} />
              </linearGradient>
            </defs>
            <path
              d={`M${x0} ${y0} A${radius} ${radius} 0 0 1 ${x1} ${y1}`}
              fill="none"
              stroke={`url(#${id})`}
              strokeWidth={width}
              strokeLinecap="round"
            />
          </g>
        );
      })}
    </>
  );
}

/** The static parts: shroud, blades, hub. Only the RGB moves. */
function Body() {
  const blades = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * Math.PI * 2;
    const r0 = 13, r1 = 37;
    const x0 = 50 + Math.cos(a) * r0, y0 = 50 + Math.sin(a) * r0;
    const x1 = 50 + Math.cos(a + 0.75) * r1, y1 = 50 + Math.sin(a + 0.75) * r1;
    const cx = 50 + Math.cos(a + 0.15) * r1 * 0.75, cy = 50 + Math.sin(a + 0.15) * r1 * 0.75;
    const [ex, ey] = [50 + Math.cos(a + 0.32) * r1, 50 + Math.sin(a + 0.32) * r1];
    return `M${x0} ${y0} Q${cx} ${cy} ${x1} ${y1} A${r1} ${r1} 0 0 0 ${ex} ${ey} Z`;
  });
  return (
    <>
      <path d="M22 6 H78 L94 22 V78 L78 94 H22 L6 78 V22 Z" fill="#1b1e24" stroke="#0a0c10" strokeWidth="1" />
      <circle cx="50" cy="50" r="38" fill="#0f1115" />
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
  const chosen = model && model !== "auto" ? model : modelFor(fan);
  // Gradient ids must be unique per fan or every fan reuses the first one's RGB.
  const uid = `${fan.channel}-${fan.position}`;
  const at = (i: number) => colorAt(colors, i);
  const all = fan.leds.map((l) => at(l.flatIndex));

  const lit = (() => {
    switch (chosen) {
      case "frame": {
        const { cols, rows, leds } = fan;
        const side = (f: (l: LayoutFan["leds"][number]) => boolean, key: "cx" | "cy") =>
          leds.filter(f).sort((a, b) => a[key] - b[key]).map((l) => at(l.flatIndex));
        const top = side((l) => l.cy === 0, "cx");
        const bottom = side((l) => l.cy === rows - 1, "cx");
        const left = side((l) => l.cx === 0 && l.cy > 0 && l.cy < rows - 1, "cy");
        const right = side((l) => l.cx === cols - 1 && l.cy > 0 && l.cy < rows - 1, "cy");
        return (
          <>
            <defs>
              <linearGradient id={`t-${uid}`} x1="0" y1="0" x2="1" y2="0">{stops(top)}</linearGradient>
              <linearGradient id={`b-${uid}`} x1="0" y1="0" x2="1" y2="0">{stops(bottom)}</linearGradient>
              <linearGradient id={`l-${uid}`} x1="0" y1="0" x2="0" y2="1">
                {stops(left.length ? left : [top[0] ?? OFF, bottom[0] ?? OFF])}
              </linearGradient>
              <linearGradient id={`r-${uid}`} x1="0" y1="0" x2="0" y2="1">
                {stops(right.length ? right : [top[top.length - 1] ?? OFF, bottom[bottom.length - 1] ?? OFF])}
              </linearGradient>
            </defs>
            <rect x="15" y="2" width="70" height="5" rx="2.5" fill={`url(#t-${uid})`} />
            <rect x="15" y="93" width="70" height="5" rx="2.5" fill={`url(#b-${uid})`} />
            <rect x="2" y="15" width="5" height="70" rx="2.5" fill={`url(#l-${uid})`} />
            <rect x="93" y="15" width="5" height="70" rx="2.5" fill={`url(#r-${uid})`} />
          </>
        );
      }
      case "ring":
        return <Arcs uid={uid} tag="r" colors={all} radius={44} width={5} />;
      case "dual": {
        const half = Math.ceil(all.length / 2);
        return (
          <>
            <Arcs uid={uid} tag="o" colors={all.slice(0, half)} radius={45} width={4.5} />
            <Arcs uid={uid} tag="i" colors={all.slice(half)} radius={26} width={4} />
          </>
        );
      }
      case "corners": {
        // Four short arcs, one per corner, splitting the LEDs between them.
        const per = Math.max(1, Math.ceil(all.length / 4));
        return (
          <>
            {[0, 1, 2, 3].map((q) => (
              <Arcs
                key={q}
                uid={uid}
                tag={`c${q}`}
                colors={all.slice(q * per, (q + 1) * per)}
                radius={44}
                width={6}
                from={-Math.PI / 2 + (q * Math.PI) / 2 - 0.35}
                sweep={0.7}
              />
            ))}
          </>
        );
      }
      case "strip":
        return (
          <>
            <defs>
              <linearGradient id={`s-${uid}`} x1="0" y1="0" x2="1" y2="0">{stops(all)}</linearGradient>
            </defs>
            <rect x="4" y="42" width="92" height="16" rx="8" fill={`url(#s-${uid})`} />
          </>
        );
      case "grid":
      default:
        return (
          <>
            {fan.leds.map((led) => (
              <rect
                key={led.flatIndex}
                x={(led.cx / fan.cols) * VIEW}
                y={(led.cy / fan.rows) * VIEW}
                width={VIEW / fan.cols}
                height={VIEW / fan.rows}
                rx={1.5}
                fill={at(led.flatIndex)}
              />
            ))}
          </>
        );
    }
  })();

  return (
    <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className={className} shapeRendering="geometricPrecision">
      <defs>
        <filter id={`glow-${uid}`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      {chosen !== "strip" && <Body />}
      {/* Drawn twice: a blurred pass for the bloom, then the lit parts themselves. */}
      <g filter={`url(#glow-${uid})`} opacity={0.8}>{lit}</g>
      {lit}
    </svg>
  );
}
