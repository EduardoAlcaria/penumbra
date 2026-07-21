import { useEffect, useMemo, useState } from "react";
import { api, type Component, type ControllerLayout, type Device } from "@/lib/api";
import SearchBar from "@/components/SearchBar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/lib/i18n";

interface Props {
  devices: Device[];
}

// One row per assigned fan; the channel comes from the row's channel field.
interface Row {
  channel: number;
  componentId: number;
}

/** Draws one controller's fans as a static board, scaled to fit the card. */
function Board({ layout }: { layout: ControllerLayout }) {
  const { minX, minY, maxX, maxY } = layout.bounds;
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const scale = 26; // px per world unit
  return (
    <div
      className="relative rounded-xl bg-muted/30 ring-1 ring-inset ring-white/10"
      style={{ width: (w + 2) * scale, height: (h + 2) * scale }}
    >
      {layout.fans.flatMap((fan) =>
        fan.leds.map((led) => (
          <span
            key={`${fan.channel}-${fan.position}-${led.flatIndex}`}
            className="absolute h-2 w-2 rounded-full"
            style={{
              left: (led.x - minX + 1) * scale,
              top: (led.y - minY + 1) * scale,
              background: "var(--glow)",
              boxShadow: "0 0 6px var(--glow)",
            }}
          />
        )),
      )}
    </div>
  );
}

export default function LayoutScreen({ devices }: Props) {
  const { t } = useT();
  const [gear, setGear] = useState<Component[]>([]);
  const [layout, setLayout] = useState<ControllerLayout | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState("");

  const controllerKey = devices[0]?.id ?? null;

  useEffect(() => {
    api.components().then(setGear).catch(() => {});
  }, []);

  useEffect(() => {
    if (!controllerKey) return;
    api.layout().then((d) => {
      const mine = d.controllers.find((c) => c.controllerKey === controllerKey) ?? null;
      setLayout(mine);
      setRows(mine ? mine.fans.map((f) => ({ channel: f.channel, componentId: f.componentId })) : []);
    }).catch(() => {});
  }, [controllerKey]);

  const fans = useMemo(
    () => gear.filter((g) => g.type === "Fan" && g.name.toLowerCase().includes(query.trim().toLowerCase())),
    [gear, query],
  );

  const channelCount = devices[0]?.channels ?? 0;

  // Picking a fan fills every channel with exactly one of it (one fan per
  // channel) and retracts the search. Re-picking replaces; trim per channel
  // with the ✕ chips, or wipe everything with Clear all.
  const setAllChannels = (componentId: number) => {
    setRows(Array.from({ length: channelCount }, (_, ch) => ({ channel: ch, componentId })));
    setQuery("");
  };
  const clearAll = () => setRows([]);
  const removeRow = (idx: number) => setRows((r) => r.filter((_, i) => i !== idx));

  const save = () => {
    if (!controllerKey) return;
    // position = order within each channel, derived from row order
    const perChannel: Record<number, number> = {};
    const items = rows.map((row) => {
      const position = perChannel[row.channel] ?? 0;
      perChannel[row.channel] = position + 1;
      return { channel: row.channel, position, componentId: row.componentId };
    });
    api.setAssignments(controllerKey, items).then(setLayout).catch(() => {});
  };

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
          <Board layout={layout} />
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
          {Array.from({ length: channelCount }, (_, ch) => (
            <div key={ch} className="rounded-lg bg-muted/20 p-3">
              <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                {t("layout.channel")} {ch + 1}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {rows.some((row) => row.channel === ch) ? (
                  rows.map((row, idx) =>
                    row.channel === ch ? (
                      <button
                        key={idx}
                        onClick={() => removeRow(idx)}
                        className="rounded-full bg-secondary px-3 py-1 text-xs ring-1 ring-primary/40 hover:ring-destructive/60"
                      >
                        {gear.find((g) => g.id === row.componentId)?.name ?? row.componentId} ✕
                      </button>
                    ) : null,
                  )
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex gap-2">
          <Button onClick={save}>{t("layout.save")}</Button>
          {rows.length > 0 && (
            <Button variant="secondary" onClick={clearAll}>
              {t("layout.clear")}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
