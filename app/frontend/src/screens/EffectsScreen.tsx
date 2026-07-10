import { useState } from "react";
import type { EffectRequest } from "@/lib/api";
import LivePreview from "@/components/LivePreview";
import SearchBar from "@/components/SearchBar";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const EFFECTS: EffectRequest["type"][] = ["rainbow", "static", "breathing"];

/** Little swatch that previews what each effect looks like. */
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

interface Props {
  effect: EffectRequest["type"];
  color: string;
  speed: number;
  apply: (patch: Partial<EffectRequest>) => void;
}

export default function EffectsScreen({ effect, color, speed, apply }: Props) {
  const { t } = useT();
  const [query, setQuery] = useState("");

  const visible = EFFECTS.filter((e) =>
    t(`effect.${e}`).toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="space-y-6">
      {/* Hero: live light strip */}
      <Card className="animate-rise p-5">
        <div className="mb-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
          <span>{t("preview.live")}</span>
          <span className="flex items-center gap-3">
            <span className="text-foreground/80">{t(`effect.${effect}`)}</span>
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

      <div className="animate-rise" style={{ animationDelay: "0.06s" }}>
        <SearchBar value={query} onChange={setQuery} placeholder={t("effects.search")} />
      </div>

      {/* Effect cards */}
      <div className="animate-rise grid gap-4 sm:grid-cols-2 lg:grid-cols-3" style={{ animationDelay: "0.1s" }}>
        {visible.map((e) => (
          <Card
            key={e}
            onClick={() => apply({ type: e })}
            className={cn(
              "cursor-pointer p-4 transition-all hover:-translate-y-0.5 hover:bg-card/80",
              effect === e && "ring-1 ring-primary/60",
            )}
          >
            <div
              className="mb-3 h-16 w-full rounded-lg ring-1 ring-inset ring-white/10"
              style={effectSwatch(e, color)}
            />
            <div className="flex items-center justify-between">
              <span className="font-semibold">{t(`effect.${e}`)}</span>
              {effect === e && (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-primary"
                  style={{ boxShadow: "0 0 8px var(--glow)" }}
                />
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t(`effect.${e}.desc`)}</p>
          </Card>
        ))}
      </div>

      {/* Controls */}
      <Card className="animate-rise max-w-md p-5" style={{ animationDelay: "0.14s" }}>
        <div className="mb-2">
          <label className="mb-2 flex items-center justify-between font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {t("control.color")} <span className="text-foreground/70">{color}</span>
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={color}
              onChange={(e) => apply({ color: e.target.value })}
              aria-label={t("control.color")}
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
            {t("control.speed")} <span className="tabular-nums text-foreground/70">{speed.toFixed(2)}</span>
          </label>
          <Slider
            value={[speed]}
            min={0}
            max={2}
            step={0.05}
            onValueChange={([v]) => apply({ speed: v })}
            aria-label={t("control.speed")}
          />
        </div>
      </Card>
    </div>
  );
}
