import { useEffect, useState } from "react";
import { api, type Device, type EffectRequest } from "./lib/api";

const EFFECTS: EffectRequest["type"][] = ["rainbow", "static", "breathing"];

export default function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [effect, setEffect] = useState<EffectRequest["type"]>("rainbow");
  const [color, setColor] = useState("#009bde");
  const [speed, setSpeed] = useState(0.2);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    api.devices().then(setDevices).catch((e) => setError(String(e)));

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, []);

  const apply = (type: EffectRequest["type"]) => {
    setEffect(type);
    api.setEffect({ type, color, speed }).catch((e) => setError(String(e)));
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Penumbra</h1>
        <button
          onClick={() => api.rescan().then(setDevices)}
          className="rounded-md bg-secondary text-secondary-foreground px-3 py-1.5 text-sm hover:opacity-90"
        >
          Rescan
        </button>
      </header>

      <main className="p-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Devices */}
        <section>
          <h2 className="text-sm uppercase tracking-wide text-muted-foreground mb-3">
            Devices ({devices.length})
          </h2>
          {devices.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
              No controllers detected. Plug one in and hit Rescan.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {devices.map((d) => (
                <div key={d.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="font-semibold">{d.name}</div>
                  <div className="text-xs text-muted-foreground">{d.brand} · {d.id}</div>
                  <div className="mt-3 text-sm">
                    {d.totalLeds} LEDs · {d.channels} channels
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {d.ledsPerChannel.map((n, i) => (
                      <span
                        key={i}
                        className="rounded bg-muted text-muted-foreground px-1.5 py-0.5 text-[11px]"
                      >
                        ch{i + 1}: {n}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Effect controls */}
        <aside className="rounded-lg border border-border bg-card p-4 h-fit">
          <h2 className="text-sm uppercase tracking-wide text-muted-foreground mb-3">Effect</h2>

          <div className="grid grid-cols-3 gap-2 mb-4">
            {EFFECTS.map((e) => (
              <button
                key={e}
                onClick={() => apply(e)}
                className={
                  "rounded-md px-2 py-1.5 text-sm capitalize border " +
                  (effect === e
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-transparent border-border hover:bg-secondary")
                }
              >
                {e}
              </button>
            ))}
          </div>

          <label className="block text-sm mb-1">Color</label>
          <input
            type="color"
            value={color}
            onChange={(e) => {
              setColor(e.target.value);
              api.setEffect({ type: effect, color: e.target.value, speed });
            }}
            className="w-full h-10 rounded-md bg-transparent border border-border mb-4"
          />

          <label className="block text-sm mb-1">Speed · {speed.toFixed(2)}</label>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={speed}
            onChange={(e) => {
              const s = Number(e.target.value);
              setSpeed(s);
              api.setEffect({ type: effect, color, speed: s });
            }}
            className="w-full accent-[var(--sidebar-primary)]"
          />
        </aside>
      </main>

      {error && (
        <div className="fixed bottom-4 right-4 rounded-md bg-destructive text-destructive-foreground px-4 py-2 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
