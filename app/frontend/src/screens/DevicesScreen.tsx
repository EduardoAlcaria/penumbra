import { useState } from "react";
import type { Device, UnsupportedDevice } from "@/lib/api";
import SearchBar from "@/components/SearchBar";
import { Card } from "@/components/ui/card";
import { useT } from "@/lib/i18n";

interface Props {
  devices: Device[];
  unsupported: UnsupportedDevice[];
}

export default function DevicesScreen({ devices, unsupported }: Props) {
  const { t } = useT();
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const match = (s: string) => s.toLowerCase().includes(q);
  const visible = devices.filter((d) => match(d.name) || match(d.brand) || match(d.id));
  const visibleUnsupported = unsupported.filter((u) => match(u.name) || match(u.id));
  const totalLeds = devices.reduce((sum, d) => sum + d.totalLeds, 0);

  return (
    <div className="space-y-6">
      <div className="animate-rise flex items-center gap-4">
        <div className="flex-1">
          <SearchBar value={query} onChange={setQuery} placeholder={t("devices.search")} />
        </div>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {totalLeds} {t("devices.total")}
        </span>
      </div>

      {visible.length === 0 && visibleUnsupported.length === 0 ? (
        <Card className="animate-rise border-dashed bg-card/40 p-10 text-center">
          <div className="font-medium">{t("devices.empty.title")}</div>
          <div className="mt-1 text-sm text-muted-foreground">{t("devices.empty.hint")}</div>
        </Card>
      ) : (
        <div className="animate-rise grid gap-4 sm:grid-cols-2" style={{ animationDelay: "0.06s" }}>
          {visible.map((d) => {
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
                      {t("devices.leds")}
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

          {visibleUnsupported.map((u) => (
            <Card key={u.id} className="border-dashed bg-card/40 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold leading-tight">{u.name}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{u.id}</div>
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t("devices.unsupported.title")}
                </span>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{u.reason}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
