// Tiny typed client for the local Penumbra backend.
// Absolute base: the Tauri window is served from tauri://localhost, so it must
// reach the Java engine by its real address, not a same-origin relative path.
const BASE = "http://127.0.0.1:8787";

export interface Device {
  id: string;
  name: string;
  brand: string;
  channels: number;
  ledsPerChannel: number[];
  totalLeds: number;
}

export interface EffectRequest {
  type: "rainbow" | "static" | "breathing";
  color?: string;
  speed?: number;
  spread?: number;
}

/** A controller detected but not drivable yet — shown to the user as a warning. */
export interface UnsupportedDevice {
  id: string;
  name: string;
  reason: string;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  i18n: (lang: string) => fetch(`${BASE}/api/i18n?lang=${lang}`).then(json<Record<string, string>>),
  devices: () => fetch(`${BASE}/api/devices`).then(json<Device[]>),
  unsupported: () => fetch(`${BASE}/api/unsupported`).then(json<UnsupportedDevice[]>),
  rescan: () => fetch(`${BASE}/api/rescan`, { method: "POST" }).then(json<Device[]>),
  setEffect: (req: EffectRequest) =>
    fetch(`${BASE}/api/effect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    }).then(json<{ effect: string }>),
};
