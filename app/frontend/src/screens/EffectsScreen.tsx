import { useEffect, useMemo, useState } from "react";
import { api, type EffectInfo, type EffectProperty } from "@/lib/api";
import SearchBar from "@/components/SearchBar";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Default value for a property, coerced to the control's type. */
function defaultFor(p: EffectProperty): unknown {
  if (p.default !== null && p.default !== undefined) return p.default;
  if (p.type === "number") return p.min ?? 0;
  if (p.type === "color") return "#009bde";
  return "";
}

// Persist the picked effect + its tweaked values so they survive navigation/restart.
function loadProps(name: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(`penumbra.fx.props.${name}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveProps(name: string, props: Record<string, unknown>) {
  try {
    localStorage.setItem(`penumbra.fx.props.${name}`, JSON.stringify(props));
  } catch {
    /* ignore quota */
  }
}

export default function EffectsScreen() {
  const { t } = useT();
  const [list, setList] = useState<EffectInfo[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [props, setProps] = useState<Record<string, unknown>>({});
  const [query, setQuery] = useState("");

  useEffect(() => {
    api.effects().then(setList).catch(() => {});
  }, []);

  const current = useMemo(() => list.find((e) => e.name === active) ?? null, [list, active]);

  const select = (e: EffectInfo) => {
    const saved = loadProps(e.name);
    const initial: Record<string, unknown> = {};
    for (const p of e.properties) initial[p.key] = saved?.[p.key] ?? defaultFor(p);
    setActive(e.name);
    setProps(initial);
    localStorage.setItem("penumbra.fx.active", e.name);
    saveProps(e.name, initial);
    api.setEffect({ name: e.name, props: initial }).catch(() => {});
  };

  const setProp = (key: string, value: unknown) => {
    const next = { ...props, [key]: value };
    setProps(next);
    if (active) {
      saveProps(active, next);
      api.setEffect({ name: active, props: next }).catch(() => {});
    }
  };

  // Restore the last-used effect + its saved values once the list arrives.
  useEffect(() => {
    if (list.length === 0 || active) return;
    const savedName = localStorage.getItem("penumbra.fx.active");
    const e = list.find((x) => x.name === savedName);
    if (e) select(e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  const visible = list.filter((e) => e.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="animate-rise">
        <SearchBar value={query} onChange={setQuery} placeholder={t("effects.search")} />
      </div>

      <div className="animate-rise grid gap-4 sm:grid-cols-2 lg:grid-cols-3" style={{ animationDelay: "0.06s" }}>
        {visible.map((e) => (
          <Card
            key={e.name}
            onClick={() => select(e)}
            className={cn(
              "cursor-pointer p-4 transition-all hover:-translate-y-0.5 hover:bg-card/80",
              active === e.name && "ring-1 ring-primary/60",
            )}
          >
            <div className="font-semibold capitalize">{e.name.replace(/-/g, " ")}</div>
            <p className="mt-1 text-xs text-muted-foreground">{e.description}</p>
          </Card>
        ))}
      </div>

      {current && current.properties.length > 0 && (
        <Card className="animate-rise max-w-md space-y-5 p-5" style={{ animationDelay: "0.1s" }}>
          {current.properties.map((p) => (
            <div key={p.key}>
              <label className="mb-2 flex items-center justify-between font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                {p.label}
                <span className="text-foreground/70">
                  {p.type === "number" ? Number(props[p.key] ?? 0).toFixed(2) : String(props[p.key] ?? "")}
                </span>
              </label>
              {p.type === "color" ? (
                <input
                  type="color"
                  value={String(props[p.key] ?? "#009bde")}
                  onChange={(e) => setProp(p.key, e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-lg border border-border bg-transparent"
                />
              ) : p.type === "number" ? (
                <Slider
                  value={[Number(props[p.key] ?? p.min ?? 0)]}
                  min={p.min ?? 0}
                  max={p.max ?? 1}
                  step={(p.max ?? 1) > 5 ? 1 : 0.05}
                  onValueChange={([v]) => setProp(p.key, v)}
                />
              ) : (
                <input
                  className="w-full rounded-md border border-border bg-secondary px-2 py-1 text-sm text-foreground"
                  value={String(props[p.key] ?? "")}
                  onChange={(e) => setProp(p.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
