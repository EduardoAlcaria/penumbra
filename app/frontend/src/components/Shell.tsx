import { useEffect, useState } from "react";
import { api, type Device, type EffectRequest, type UnsupportedDevice } from "@/lib/api";
import Sidebar, { type Screen } from "@/components/Sidebar";
import EffectsScreen from "@/screens/EffectsScreen";
import DevicesScreen from "@/screens/DevicesScreen";
import LayoutScreen from "@/screens/LayoutScreen";
import SettingsScreen from "@/screens/SettingsScreen";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";
import { restoreTheme } from "@/lib/themes";
import { cn } from "@/lib/utils";

/** Splash overlay: covers the engine boot, then sweeps away into the shell. */
function Splash({ fading }: { fading: boolean }) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background transition-opacity duration-500",
        fading && "pointer-events-none opacity-0",
      )}
    >
      <div className="text-center">
        <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.32em] text-muted-foreground">
          Local light control
        </div>
        <div className="text-4xl font-bold tracking-[-0.04em]">Penumbra</div>
      </div>
      <div className="relative h-1.5 w-56 overflow-hidden rounded-full bg-muted">
        <div
          className="animate-sweep absolute inset-y-0 w-1/3 rounded-full"
          style={{ background: "var(--glow)", boxShadow: "0 0 12px var(--glow)" }}
        />
      </div>
    </div>
  );
}

export default function Shell() {
  const { t } = useT();
  const [screen, setScreen] = useState<Screen>("effects");
  const [devices, setDevices] = useState<Device[]>([]);
  const [unsupported, setUnsupported] = useState<UnsupportedDevice[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [effect, setEffect] = useState<EffectRequest["type"]>("rainbow");
  const [color, setColor] = useState("#009bde");
  const [speed, setSpeed] = useState(0.2);
  const [error, setError] = useState<string | null>(null);
  const [engineUp, setEngineUp] = useState(false);
  const [splash, setSplash] = useState<"boot" | "fading" | "done">("boot");

  const refresh = () => {
    api
      .devices()
      .then((d) => {
        setDevices(d);
        setError(null);
        setEngineUp(true);
      })
      .catch((e) => setError(String(e)));
    api.unsupported().then(setUnsupported).catch(() => {});
  };

  const rescan = () => {
    api.unsupported().then(setUnsupported).catch(() => {});
    return api
      .rescan()
      .then((d) => {
        setDevices(d);
        setError(null);
      })
      .catch((e) => setError(String(e)));
  };

  useEffect(() => {
    restoreTheme();
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, []);

  // Hide the splash once the engine answers (min 900ms so it doesn't blink),
  // or after 8s regardless so a dead engine never bricks the UI.
  useEffect(() => {
    if (splash !== "boot") return;
    const start = setTimeout(() => setSplash("fading"), engineUp ? 900 : 8000);
    return () => clearTimeout(start);
  }, [engineUp, splash]);

  useEffect(() => {
    if (splash !== "fading") return;
    const t = setTimeout(() => setSplash("done"), 550);
    return () => clearTimeout(t);
  }, [splash]);

  const apply = (patch: Partial<EffectRequest>) => {
    const next = { type: effect, color, speed, ...patch };
    setEffect(next.type!);
    if (patch.color !== undefined) setColor(patch.color);
    if (patch.speed !== undefined) setSpeed(patch.speed);
    api.setEffect(next).catch((e) => setError(String(e)));
  };

  const warnings = unsupported.filter((u) => !dismissed.has(u.id));
  const dismissWarnings = () =>
    setDismissed((prev) => new Set([...prev, ...warnings.map((u) => u.id)]));

  const titles: Record<Screen, string> = {
    effects: t("effects.title"),
    devices: t("devices.title"),
    layout: t("layout.title"),
    settings: t("settings.title"),
  };

  return (
    <div className="relative flex h-screen overflow-hidden bg-background font-sans text-foreground">
      {/* Ambient penumbra: the active color bleeds into the dark. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-[70vh]"
        style={{
          background: "radial-gradient(60% 100% at 50% 0%, var(--glow), transparent 72%)",
          opacity: 0.16,
        }}
      />

      <Sidebar screen={screen} setScreen={setScreen} deviceCount={devices.length} onRescan={rescan} />

      <main className="relative flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 pb-16 pt-8">
          <h1 className="mb-6 font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            {titles[screen]}
          </h1>
          {/* key remounts the screen so the rise animation plays on navigation */}
          <div key={screen}>
            {screen === "effects" && (
              <EffectsScreen effect={effect} color={color} speed={speed} apply={apply} />
            )}
            {screen === "devices" && <DevicesScreen devices={devices} unsupported={unsupported} />}
            {screen === "layout" && <LayoutScreen devices={devices} />}
            {screen === "settings" && <SettingsScreen />}
          </div>
        </div>
      </main>

      {/* Unsupported controller warning */}
      <Dialog open={warnings.length > 0} onOpenChange={(open) => !open && dismissWarnings()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("warn.title")}</DialogTitle>
            <DialogDescription>
              {warnings.length === 1 ? t("warn.body.one") : t("warn.body.many")}
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
          <p className="text-xs text-muted-foreground">{t("warn.report.hint")}</p>
          <DialogFooter>
            <Button variant="outline" asChild>
              <a
                href="https://github.com/EduardoAlcaria/penumbra/issues/new"
                target="_blank"
                rel="noreferrer"
              >
                {t("action.report")}
              </a>
            </Button>
            <Button onClick={dismissWarnings}>{t("action.dismiss")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {error && (
        <div className="fixed bottom-4 right-4 rounded-lg bg-destructive px-4 py-2 text-sm text-destructive-foreground shadow-lg">
          {error}
        </div>
      )}

      {splash !== "done" && <Splash fading={splash === "fading"} />}
    </div>
  );
}
