import { useState } from "react";
import { Cpu, LayoutGrid, RefreshCw, Settings, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type Screen = "effects" | "devices" | "layout" | "settings";

interface Props {
  screen: Screen;
  setScreen: (screen: Screen) => void;
  deviceCount: number;
  onRescan: () => Promise<unknown>;
}

export default function Sidebar({ screen, setScreen, deviceCount, onRescan }: Props) {
  const { t } = useT();
  const [scanning, setScanning] = useState(false);

  const rescan = () => {
    setScanning(true);
    onRescan().finally(() => setScanning(false));
  };

  const items: { id: Screen; label: string; icon: typeof Sparkles }[] = [
    { id: "effects", label: t("nav.effects"), icon: Sparkles },
    { id: "devices", label: t("nav.devices"), icon: Cpu },
    { id: "layout", label: t("nav.layout"), icon: LayoutGrid },
  ];

  const navButton = (id: Screen, label: string, Icon: typeof Sparkles) => (
    <button
      key={id}
      onClick={() => setScreen(id)}
      className={cn(
        "relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
        screen === id
          ? "bg-secondary font-medium text-foreground"
          : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
      )}
    >
      {screen === id && (
        <span
          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary"
          style={{ boxShadow: "0 0 8px var(--glow)" }}
        />
      )}
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border/60 bg-card/40 p-4">
      <div className="mb-8 px-2 pt-2">
        <div className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.32em] text-muted-foreground">
          {t("app.tagline")}
        </div>
        <div className="text-xl font-bold tracking-[-0.04em]">Penumbra</div>
      </div>

      <nav className="flex flex-col gap-1">{items.map((i) => navButton(i.id, i.label, i.icon))}</nav>

      <div className="mt-auto flex flex-col gap-3">
        <div className="flex items-center gap-2 px-2 font-mono text-xs text-muted-foreground">
          <span
            className={cn(
              "inline-block h-2 w-2 rounded-full",
              deviceCount > 0 ? "bg-primary animate-pulse-slow" : "bg-muted-foreground/40",
            )}
            style={deviceCount > 0 ? { boxShadow: "0 0 10px var(--glow)" } : undefined}
          />
          {deviceCount} {deviceCount === 1 ? t("status.controller.one") : t("status.controller.many")}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={rescan}
          disabled={scanning}
          className="justify-start gap-2"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", scanning && "animate-spin")} />
          {t("action.rescan")}
        </Button>
        {navButton("settings", t("nav.settings"), Settings)}
      </div>
    </aside>
  );
}
