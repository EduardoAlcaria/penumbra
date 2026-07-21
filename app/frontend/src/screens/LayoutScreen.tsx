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

  const addRow = (channel: number, componentId: number) =>
    setRows((r) => [...r, { channel, componentId }]);
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
        <div className="mt-4 space-y-4">
          {Array.from({ length: channelCount }, (_, ch) => (
            <div key={ch} className="rounded-lg bg-muted/20 p-3">
              <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                {t("layout.channel")} {ch + 1}
              </div>
              <div className="flex flex-wrap gap-2">
                {rows.map((row, idx) =>
                  row.channel === ch ? (
                    <button
                      key={idx}
                      onClick={() => removeRow(idx)}
                      className="rounded-full bg-secondary px-3 py-1 text-xs ring-1 ring-primary/40 hover:ring-destructive/60"
                    >
                      {gear.find((g) => g.id === row.componentId)?.name ?? row.componentId} ✕
                    </button>
                  ) : null,
                )}
                <select
                  // Colors come from theme vars so the dropdown stays readable on
                  // any custom YAML theme, light or dark (not hardcoded to dark).
                  className="rounded-md border border-border bg-secondary px-2 py-1 text-xs text-foreground"
                  value=""
                  onChange={(e) => e.target.value && addRow(ch, Number(e.target.value))}
                >
                  <option value="" className="bg-popover text-popover-foreground">
                    ＋ {t("layout.addfan")}
                  </option>
                  {fans.map((f) => (
                    <option key={f.id} value={f.id} className="bg-popover text-popover-foreground">
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5">
          <Button onClick={save}>{t("layout.save")}</Button>
        </div>
      </Card>
    </div>
  );
}
