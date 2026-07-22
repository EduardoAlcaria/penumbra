import { useEffect, useMemo, useState } from "react";
import { api, type Component, type ControllerLayout, type Device, type LayoutFan } from "@/lib/api";
import SearchBar from "@/components/SearchBar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/lib/i18n";

interface Props {
  devices: Device[];
}

// Per channel: which fan model and how many are daisy-chained on it. CS120s
// chain identical units, so a channel is one model × a count.
// ponytail: single model per channel; add a mixed-chain editor if a rig needs it.
type Chan = { componentId: number; count: number };
type Chans = Record<number, Chan>;

/** Group the server's flat per-fan list back into per-channel {model, count}. */
function fansToChans(fans: LayoutFan[]): Chans {
  const m: Chans = {};
  for (const f of fans) {
    if (!m[f.channel]) m[f.channel] = { componentId: f.componentId, count: 0 };
    m[f.channel].count += 1;
  }
  return m;
}

/**
 * One fan: its top-view photo, with the RGB strip already in the photo recolored
 * by the live LEDs. No dots — each LED paints the cell it owns, and `color`
 * blending keeps the photo's own shading so it reads as the strip lighting up.
 *
 * The cells are laid over the photo's *displayed* rect, not the container:
 * object-contain letterboxes the image, and a component's LED grid (11x7 for a
 * CS120) does not match the photo's aspect, so the grid is stretched onto
 * wherever the photo actually landed.
 */
function Fan({
  fan,
  colors,
  zoom,
  onDrop,
}: {
  fan: LayoutFan;
  colors: string[];
  zoom: number;
  onDrop: (x: number, y: number) => void;
}) {
  const [photo, setPhoto] = useState<{ l: number; t: number; w: number; h: number } | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);

  // object-contain letterboxes the photo, so measure where it actually landed.
  const fit = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const bw = img.clientWidth, bh = img.clientHeight;
    const ar = img.naturalWidth / img.naturalHeight;
    const w = ar > bw / bh ? bw : bh * ar;
    const h = ar > bw / bh ? bw / ar : bh;
    setPhoto({ l: (bw - w) / 2, t: (bh - h) / 2, w, h });
  };

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const x0 = e.clientX, y0 = e.clientY;
    const ox = fan.originX, oy = fan.originY;
    setDrag({ x: ox, y: oy });
    const move = (ev: PointerEvent) =>
      setDrag({ x: ox + (ev.clientX - x0) / zoom, y: oy + (ev.clientY - y0) / zoom });
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrag(null);
      onDrop(ox + (ev.clientX - x0) / zoom, oy + (ev.clientY - y0) / zoom);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      onPointerDown={startDrag}
      className="absolute cursor-grab touch-none select-none active:cursor-grabbing"
      style={{
        left: (drag?.x ?? fan.originX) * zoom,
        top: (drag?.y ?? fan.originY) * zoom,
        width: fan.width * zoom,
        height: fan.height * zoom,
      }}
      title={`${fan.name} — ch ${fan.channel + 1} #${fan.position + 1}`}
    >
      {fan.imageUrl ? (
        <img
          src={fan.imageUrl}
          alt={fan.name}
          draggable={false}
          onLoad={fit}
          className="pointer-events-none h-full w-full object-contain"
          onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
        />
      ) : null}
      {photo &&
        fan.leds.map((led) => {
          const c = colors[led.flatIndex];
          if (!c || c === "#000000") return null;
          return (
            <span
              key={led.flatIndex}
              className="pointer-events-none absolute mix-blend-color"
              style={{
                left: photo.l + (led.cx / fan.cols) * photo.w,
                top: photo.t + (led.cy / fan.rows) * photo.h,
                width: photo.w / fan.cols,
                height: photo.h / fan.rows,
                background: c,
              }}
            />
          );
        })}
    </div>
  );
}

/**
 * The effect canvas with the fans sitting on it. Bounds come from the server and
 * are the canvas itself (0,0 - 320,200), not the fans: where a fan sits decides
 * which part of the effect it shows, so the empty space around them is real.
 */
function Board({
  layout,
  colors,
  onMove,
}: {
  layout: ControllerLayout;
  colors: string[];
  onMove: (fan: LayoutFan, x: number, y: number) => void;
}) {
  const { maxX, maxY } = layout.bounds;
  const zoom = 2.4; // screen px per canvas px
  return (
    <div
      className="relative overflow-hidden rounded-xl bg-black/40 ring-1 ring-inset ring-white/10"
      style={{ width: maxX * zoom, height: maxY * zoom }}
    >
      {layout.fans.map((fan) => (
        <Fan
          key={`fan-${fan.channel}-${fan.position}`}
          fan={fan}
          colors={colors}
          zoom={zoom}
          onDrop={(x, y) => onMove(fan, x, y)}
        />
      ))}
    </div>
  );
}

export default function LayoutScreen({ devices }: Props) {
  const { t } = useT();
  const [gear, setGear] = useState<Component[]>([]);
  const [layout, setLayout] = useState<ControllerLayout | null>(null);
  const [chans, setChans] = useState<Chans>({});
  const [query, setQuery] = useState("");
  const [colors, setColors] = useState<string[]>([]);

  const controllerKey = devices[0]?.id ?? null;

  useEffect(() => {
    api.components().then(setGear).catch(() => {});
  }, []);

  // Poll the live frame so the board mirrors what the hardware is showing.
  useEffect(() => {
    if (!controllerKey) return;
    const tick = () =>
      api
        .frame()
        .then((f) => setColors(f.controllers.find((c) => c.controllerKey === controllerKey)?.colors ?? []))
        .catch(() => {});
    tick();
    const id = setInterval(tick, 100); // 10 fps is plenty for a preview
    return () => clearInterval(id);
  }, [controllerKey]);

  useEffect(() => {
    if (!controllerKey) return;
    api.layout().then((d) => {
      const mine = d.controllers.find((c) => c.controllerKey === controllerKey) ?? null;
      setLayout(mine);
      setChans(mine ? fansToChans(mine.fans) : {});
    }).catch(() => {});
  }, [controllerKey]);

  const fans = useMemo(
    () => gear.filter((g) => g.type === "Fan" && g.name.toLowerCase().includes(query.trim().toLowerCase())),
    [gear, query],
  );

  const channelCount = devices[0]?.channels ?? 0;

  // Single source of truth: every edit persists immediately and the board + chips
  // rebuild from the server's response, so nothing shows stale or "comes back"
  // on reopen. No separate Save step.
  const persist = (next: Chans) => {
    if (!controllerKey) return;
    // Expand each channel's {model, count} into count daisy positions.
    const items = Object.entries(next).flatMap(([ch, v]) =>
      Array.from({ length: v.count }, (_, i) => ({
        channel: Number(ch),
        position: i,
        componentId: v.componentId,
      })),
    );
    setChans(next); // optimistic; the response confirms
    api
      .setAssignments(controllerKey, items)
      .then((l) => {
        setLayout(l.fans.length > 0 ? l : null);
        setChans(fansToChans(l.fans));
      })
      .catch(() => {});
  };

  // Picking a fan puts one of it on every channel (each ×1) and retracts the
  // search. Bump a channel's count for daisy-chained fans; ✕ clears a channel.
  const setAllChannels = (componentId: number) => {
    const next: Chans = {};
    for (let ch = 0; ch < channelCount; ch++) next[ch] = { componentId, count: 1 };
    persist(next);
    setQuery("");
  };
  const setCount = (channel: number, count: number) =>
    persist({ ...chans, [channel]: { ...chans[channel], count } });
  const clearChannel = (channel: number) => {
    const next = { ...chans };
    delete next[channel];
    persist(next);
  };
  const clearAll = () => persist({});

  if (!controllerKey) {
    return (
      <Card className="border-dashed bg-card/40 p-10 text-center">
        <div className="font-medium">{t("layout.empty.title")}</div>
        <div className="mt-1 text-sm text-muted-foreground">{t("layout.empty.hint")}</div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {layout && layout.fans.length > 0 && (
        <Card className="animate-rise overflow-auto p-5">
          <Board
            layout={layout}
            colors={colors}
            onMove={(fan, x, y) => {
              if (!controllerKey) return;
              api
                .setPlacement(controllerKey, fan.channel, fan.position, x, y)
                .then(setLayout)
                .catch(() => {});
            }}
          />
        </Card>
      )}

      <Card className="animate-rise p-5" style={{ animationDelay: "0.06s" }}>
        <SearchBar value={query} onChange={setQuery} placeholder={t("layout.pickfan")} />

        {/* Suggestions: fans matching the search, with a thumbnail. Click = add to every channel. */}
        {query.trim() && (
          <div className="mt-3 overflow-hidden rounded-lg ring-1 ring-inset ring-white/10">
            {fans.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">{t("layout.nofan")}</div>
            ) : (
              fans.slice(0, 8).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setAllChannels(f.id)}
                  className="flex w-full items-center gap-3 border-b border-border/50 px-3 py-2 text-left last:border-b-0 hover:bg-secondary"
                >
                  {f.imageUrl ? (
                    <img
                      src={f.imageUrl}
                      alt=""
                      loading="lazy"
                      className="h-9 w-9 shrink-0 object-contain"
                      onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
                    />
                  ) : (
                    <div className="h-9 w-9 shrink-0 rounded bg-muted/40" />
                  )}
                  <span className="flex-1 truncate text-sm">{f.name}</span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                    {f.ledCount} {t("devices.leds")}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-primary">
                    {t("layout.addall")}
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        <div className="mt-4 space-y-4">
          {Array.from({ length: channelCount }, (_, ch) => {
            const v = chans[ch];
            const name = v ? gear.find((g) => g.id === v.componentId)?.name ?? v.componentId : null;
            return (
              <div key={ch} className="rounded-lg bg-muted/20 p-3">
                <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  {t("layout.channel")} {ch + 1}
                </div>
                {v ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-secondary px-3 py-1 text-xs ring-1 ring-primary/40">
                      {name}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => (v.count > 1 ? setCount(ch, v.count - 1) : clearChannel(ch))}
                        className="h-6 w-6 rounded-md bg-secondary text-sm leading-none hover:bg-muted"
                        aria-label="minus"
                      >
                        −
                      </button>
                      <span className="w-8 text-center font-mono text-xs tabular-nums">×{v.count}</span>
                      <button
                        onClick={() => setCount(ch, v.count + 1)}
                        className="h-6 w-6 rounded-md bg-secondary text-sm leading-none hover:bg-muted"
                        aria-label="plus"
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() => clearChannel(ch)}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
            );
          })}
        </div>
        {Object.keys(chans).length > 0 && (
          <div className="mt-5">
            <Button variant="secondary" onClick={clearAll}>
              {t("layout.clear")}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
