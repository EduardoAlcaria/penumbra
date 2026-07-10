import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LANGUAGES, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Autostart / open-folder need the Tauri runtime; plain browser dev has none.
const IS_TAURI = "__TAURI_INTERNALS__" in window;

function Row({ title, hint, children }: { title: string; hint: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-4">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
      </div>
      {children}
    </div>
  );
}

export default function SettingsScreen() {
  const { t, lang, setLang } = useT();
  const [autostart, setAutostart] = useState(false);

  useEffect(() => {
    if (IS_TAURI) isEnabled().then(setAutostart).catch(() => {});
  }, []);

  const toggleAutostart = (on: boolean) => {
    setAutostart(on);
    (on ? enable() : disable()).catch(() => setAutostart(!on));
  };

  return (
    <div className="animate-rise max-w-2xl">
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">{t("settings.tab.general")}</TabsTrigger>
          <TabsTrigger value="system">{t("settings.tab.system")}</TabsTrigger>
          <TabsTrigger value="about">{t("settings.tab.about")}</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card className="divide-y divide-border/60 px-5">
            <Row title={t("settings.language")} hint={t("settings.language.hint")}>
              <div className="flex gap-1 rounded-lg bg-muted p-1">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => setLang(l.code)}
                    className={cn(
                      "rounded-md px-3 py-1 text-sm transition-colors",
                      lang === l.code
                        ? "bg-background font-medium text-foreground shadow"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </Row>
          </Card>
        </TabsContent>

        <TabsContent value="system">
          <Card className="divide-y divide-border/60 px-5">
            <Row title={t("settings.autostart")} hint={IS_TAURI ? t("settings.autostart.hint") : t("settings.desktop.only")}>
              <Switch checked={autostart} onCheckedChange={toggleAutostart} disabled={!IS_TAURI} />
            </Row>
            <Row title={t("settings.openconfig")} hint={IS_TAURI ? t("settings.openconfig.hint") : t("settings.desktop.only")}>
              <Button
                variant="outline"
                size="sm"
                disabled={!IS_TAURI}
                onClick={() => invoke("open_config_dir").catch(() => {})}
                className="gap-2"
              >
                <FolderOpen className="h-4 w-4" />
                {t("settings.openconfig")}
              </Button>
            </Row>
          </Card>
        </TabsContent>

        <TabsContent value="about">
          <Card className="p-5">
            <div className="text-xl font-bold tracking-[-0.04em]">Penumbra</div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">v0.1.0</div>
            <p className="mt-3 text-sm text-muted-foreground">{t("settings.about.body")}</p>
            <a
              href="https://github.com/EduardoAlcaria/penumbra"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-sm text-primary hover:underline"
            >
              github.com/EduardoAlcaria/penumbra
            </a>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
