import { invoke } from "@tauri-apps/api/core";

export interface Theme {
  file: string;
  name: string;
  vars: Record<string, string>;
}

const STORAGE = "penumbra.theme";
const IS_TAURI = "__TAURI_INTERNALS__" in window;

// ponytail: flat "key: value" parser, not full YAML — nesting/lists unsupported;
// swap in js-yaml if themes ever grow past a flat map.
function parse(file: string, content: string): Theme {
  const vars: Record<string, string> = {};
  let name = file;
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf(":");
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    const value = t.slice(i + 1).trim();
    if (key === "name") name = value;
    else vars[key] = value;
  }
  return { file, name, vars };
}

/** YAML files from the user's themes folder (desktop app only). */
export async function listThemes(): Promise<Theme[]> {
  if (!IS_TAURI) return [];
  const raw = await invoke<{ file: string; content: string }[]>("list_themes");
  return raw.map((r) => parse(r.file, r.content)).sort((a, b) => a.name.localeCompare(b.name));
}

let appliedKeys: string[] = [];

/** Override :root CSS vars with the theme's; null restores the built-in look. */
export function applyTheme(theme: Theme | null) {
  const root = document.documentElement;
  for (const k of appliedKeys) root.style.removeProperty(`--${k}`);
  appliedKeys = [];
  if (theme) {
    for (const [k, v] of Object.entries(theme.vars)) {
      root.style.setProperty(`--${k}`, v);
      appliedKeys.push(k);
    }
  }
  localStorage.setItem(STORAGE, theme ? theme.file : "");
}

export const savedThemeFile = () => localStorage.getItem(STORAGE) ?? "";

/** Re-apply the persisted theme at boot (and after edits to its file). */
export async function restoreTheme() {
  const file = savedThemeFile();
  if (!file) return;
  const themes = await listThemes().catch(() => []);
  applyTheme(themes.find((t) => t.file === file) ?? null);
}
