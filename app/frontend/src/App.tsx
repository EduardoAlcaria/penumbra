import { useEffect, useState } from "react";
import { api, type Device, type EffectRequest, type UnsupportedDevice } from "./lib/api";
import LivePreview from "./components/LivePreview";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const EFFECTS: EffectRequest["type"][] = ["rainbow", "static", "breathing"];

/** Little swatch that previews what each effect looks like, in the effect picker. */
function effectSwatch(type: EffectRequest["type"], color: string): React.CSSProperties {
  if (type === "rainbow") {
    return {
      background:
        "linear-gradient(90deg, hsl(0 90% 58%), hsl(60 90% 58%), hsl(120 90% 58%), hsl(200 90% 58%), hsl(280 90% 58%), hsl(340 90% 58%))",
    };
  }
  if (type === "breathing") {
    return { background: `radial-gradient(circle at 50% 40%, ${color}, color-mix(in oklab, ${color} 25%, #000))` };
  }
  return { background: color };
}

export default function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [unsupported, setUnsupported] = useState<UnsupportedDevice[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [effect, setEffect] = useState<EffectRequest["type"]>("rainbow");
  const [color, setColor] = useState("#009bde");
  const [speed, setSpeed] = useState(0.2);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    api
      .devices()
      .then((d) => {
        setDevices(d);
        setError(null); // engine reachable — clear any stale boot-race error
      })
      .catch((e) => setError(String(e)));
    api.unsupported().then(setUnsupported).catch(() => {});
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, []);

  const warnings = unsupported.filter((u) => !dismissed.has(u.id));
  const totalLeds = devices.reduce((sum, d) => sum + d.totalLeds, 0);

  const apply = (patch: Partial<EffectRequest>) => {
    const next = { type: effect, color, speed, ...patch };
    setEffect(next.type!);
    if (patch.color !== undefined) setColor(patch.color);
    if (patch.speed !== undefined) setSpeed(patch.speed);
    api.setEffect(next).catch((e) => setError(String(e)));
  };

  const dismissWarnings = () =>
    setDismissed((prev) => new Set([...prev, ...warnings.map((u) => u.id)]));

  return (
    <div className="relative min-h-screen overflow-hidden bg-background font-sans text-foreground">
      {/* Ambient penumbra: the active color bleeds into the dark. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-[70vh]"
        style={{
          background: "radial-gradient(60% 100% at 50% 0%, var(--glow), transparent 72%)",
          opacity: 0.16,
        }}
      />

      <div className="relative mx-auto max-w-6xl px-5 pb-16 sm:px-8">
        {/* Header */}
        <header className="flex flex-wrap items-end justify-between gap-4 py-8">
          <div>
            <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.32em] text-muted-foreground">
              Local light control
            </div>
            <h1 className="text-3xl font-bold leading-none tracking-[-0.04em] sm:text-4xl">
              Penumbra
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <span
                className={
                  "inline-block h-2 w-2 rounded-full " +
                  (devices.length > 0 ? "bg-primary animate-pulse-slow" : "bg-muted-foreground/40")
                }
                style={devices.length > 0 ? { boxShadow: "0 0 10px var(--glow)" } : undefined}
              />
              {devices.length} {devices.length === 1 ? "controller" : "controllers"}
            </div>
            <Button variant="secondary" size="sm" onClick={refresh}>
              Rescan
            </Button>
          </div>
        </header>

        {/* Hero: live light strip */}
        <Card className="animate-rise mb-8 p-5">
          <div className="mb-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            <span>Live preview</span>
            <span className="flex items-center gap-3">
              <span className="capitalize text-foreground/80">{effect}</span>
              <span>{color}</span>
            </span>
          </div>
          <div className="relative h-28 overflow-hidden rounded-xl ring-1 ring-inset ring-white/10">
            <LivePreview effect={effect} color={color} speed={speed} />
            <div className="led-ticks pointer-events-none absolute inset-0" />
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.14), transparent 40%, rgba(0,0,0,0.28))" }}
            />
          </div>
        </Card>

        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          {/* Controllers */}
          <section className="animate-rise" style={{ animationDelay: "0.06s" }}>
            <div className="mb-4 flex items-baseline gap-3">
              <h2 className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
                Controllers
              </h2>
              <span className="font-mono text-xs text-muted-foreground/60">
                {totalLeds} LEDs total
              </span>
            </div>

            {devices.length === 0 ? (
              <Card className="border-dashed bg-card/40 p-10 text-center">
                <div className="font-medium">No controllers detected</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Plug one in, then hit Rescan.
                </div>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {devices.map((d) => {
                  const peak = Math.max(1, ...d.ledsPerChannel);
                  return (
                    <Card key={d.id} className="relative overflow-hidden p-5">
                      <div
                        className="pointer-events-none absolute inset-x-0 top-0 h-px"
                        style={{ background: "linear-gradient(90deg, transparent, var(--glow), transparent)", opacity: 0.5 }}
                      />
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-semibold leading-tight">{d.name}</div>
                          <div className="font-mono text-[11px] text-muted-foreground">
                            {d.brand} · {d.id}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-2xl leading-none tabular-nums">{d.totalLeds}</div>
                          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                            leds
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 space-y-1.5">
                        {d.ledsPerChannel.map((n, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="w-8 shrink-0 font-mono text-[10px] text-muted-foreground">
                              ch{i + 1}
                            </span>
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${(n / peak) * 100}%`,
                                  background: "var(--glow)",
                                  opacity: n > 0 ? 0.85 : 0,
                                }}
                              />
                            </div>
                            <span className="w-7 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                              {n}
                            </span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {/* Effect controls */}
          <Card
            className="animate-rise h-fit p-5 lg:sticky lg:top-6"
            style={{ animationDelay: "0.12s" }}
          >
            <h2 className="mb-4 font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Effect
            </h2>

            <div className="grid gap-2">
              {EFFECTS.map((e) => (
                <Button
                  key={e}
                  variant={effect === e ? "secondary" : "outline"}
                  onClick={() => apply({ type: e })}
                  className={
                    "h-auto justify-start gap-3 py-2.5 " +
                    (effect === e ? "border-primary/60" : "")
                  }
                >
                  <span
                    className="h-7 w-7 shrink-0 rounded-md ring-1 ring-inset ring-white/10"
                    style={effectSwatch(e, color)}
                  />
                  <span className="capitalize">{e}</span>
                  {effect === e && (
                    <span
                      className="ml-auto h-1.5 w-1.5 rounded-full bg-primary"
                      style={{ boxShadow: "0 0 8px var(--glow)" }}
                    />
                  )}
                </Button>
              ))}
            </div>

            <div className="mt-6">
              <label className="mb-2 flex items-center justify-between font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Color <span className="text-foreground/70">{color}</span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => apply({ color: e.target.value })}
                  aria-label="Effect color"
                  className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent"
                />
                <div
                  className="h-10 flex-1 rounded-lg ring-1 ring-inset ring-white/10"
                  style={{ background: color }}
                />
              </div>
            </div>

            <div className="mt-6">
              <label className="mb-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Speed <span className="text-foreground/70 tabular-nums">{speed.toFixed(2)}</span>
              </label>
              <Slider
                value={[speed]}
                min={0}
                max={2}
                step={0.05}
                onValueChange={([v]) => apply({ speed: v })}
                aria-label="Effect speed"
              />
            </div>
          </Card>
        </div>
      </div>

      {/* Unsupported controller warning */}
      <Dialog open={warnings.length > 0} onOpenChange={(open) => !open && dismissWarnings()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Controller detected, not usable yet</DialogTitle>
            <DialogDescription>
              Penumbra recognized {warnings.length === 1 ? "a controller" : "these controllers"} but
              can't drive {warnings.length === 1 ? "it" : "them"} safely:
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2">
            {warnings.map((u) => (
              <li key={u.id} className="rounded-lg bg-muted p-3">
                <div className="font-mono text-sm font-semibold">{u.name} · {u.id}</div>
                <div className="mt-1 text-xs text-muted-foreground">{u.reason}</div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Adding support needs the controller's exact protocol. Report it with the model and the ID
            above so it can be added.
          </p>
          <DialogFooter>
            <Button variant="outline" asChild>
              <a
                href="https://github.com/EduardoAlcaria/penumbra/issues/new"
                target="_blank"
                rel="noreferrer"
              >
                Report controller
              </a>
            </Button>
            <Button onClick={dismissWarnings}>Dismiss</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {error && (
        <div className="fixed bottom-4 right-4 rounded-lg bg-destructive px-4 py-2 text-sm text-destructive-foreground shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}
