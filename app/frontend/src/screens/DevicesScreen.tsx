import { useEffect, useMemo, useState } from "react";
import { Cpu } from "lucide-react";
import { api, type Component, type Device, type UnsupportedDevice } from "@/lib/api";
import SearchBar from "@/components/SearchBar";
import { Card } from "@/components/ui/card";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  devices: Device[];
  unsupported: UnsupportedDevice[];
}

type Status = "all" | "detected" | "unsupported";

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors",
        active ? "bg-secondary text-foreground ring-1 ring-primary/50" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export default function DevicesScreen({ devices, unsupported }: Props) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [gearType, setGearType] = useState("all");
  const [gear, setGear] = useState<Component[]>([]);

  useEffect(() => {
    api.components().then(setGear).catch(() => {});
  }, []);

  const q = query.trim().toLowerCase();
  const match = (s: string) => s.toLowerCase().includes(q);
  const visible = status === "unsupported" ? [] : devices.filter((d) => match(d.name) || match(d.brand) || match(d.id));
  const visibleUnsupported =
    status === "detected" ? [] : unsupported.filter((u) => match(u.name) || match(u.id));
  const totalLeds = devices.reduce((sum, d) => sum + d.totalLeds, 0);

  const gearTypes = useMemo(
    () => [...new Set(gear.map((g) => g.type).filter(Boolean))].sort(),
    [gear],
  );
  const visibleGear = gear
    .filter((g) => gearType === "all" || g.type === gearType)
    .filter((g) => match(g.name) || match(g.brand))
    .slice(0, 60); // ponytail: cap the grid; add pagination if anyone scrolls past 60

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

      <div className="animate-rise flex flex-wrap gap-1">
        {(["all", "detected", "unsupported"] as Status[]).map((s) => (
          <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
            {t(`devices.filter.${s}`)}
          </Chip>
        ))}
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

                <div className="mt-4 flex gap-4">
                  <div className="flex-1 space-y-1.5">
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
                  {/* Device portrait: the controller lit by its own effect color. */}
                  <div
                    className="hidden w-28 shrink-0 items-center justify-center self-stretch rounded-xl ring-1 ring-inset ring-white/10 sm:flex"
                    style={{
                      background:
                        "radial-gradient(70% 70% at 50% 45%, color-mix(in oklab, var(--glow) 30%, transparent), transparent), oklch(0.16 0.014 275)",
                    }}
                  >
                    <Cpu className="h-10 w-10" style={{ color: "var(--glow)" }} />
                  </div>
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

      {/* Gear library: LED layouts bundled with the app, with SignalRGB photos */}
      {gear.length > 0 && (
        <section className="animate-rise" style={{ animationDelay: "0.1s" }}>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              {t("devices.gear")}
            </h2>
            <div className="flex flex-wrap gap-1">
              <Chip active={gearType === "all"} onClick={() => setGearType("all")}>
                {t("devices.filter.all")}
              </Chip>
              {gearTypes.map((ty) => (
                <Chip key={ty} active={gearType === ty} onClick={() => setGearType(ty)}>
                  {ty}
                </Chip>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visibleGear.map((g) => (
              <Card key={`${g.brand}:${g.name}`} className="p-3 transition-transform hover:-translate-y-0.5">
                {g.imageUrl ? (
                  <img
                    src={g.imageUrl}
                    alt={g.name}
                    loading="lazy"
                    className="mb-2 h-20 w-full object-contain"
                    onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
                  />
                ) : (
                  <div className="mb-2 h-20 w-full rounded-md bg-muted/40" />
                )}
                <div className="truncate text-xs font-medium" title={g.name}>{g.name}</div>
                <div className="mt-0.5 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                  <span className="truncate">{g.brand}</span>
                  <span className="shrink-0 tabular-nums">{g.ledCount} {t("devices.leds")}</span>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
