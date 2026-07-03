// Tiny typed client for the local Penumbra backend.

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
  devices: () => fetch("/api/devices").then(json<Device[]>),
  unsupported: () => fetch("/api/unsupported").then(json<UnsupportedDevice[]>),
  rescan: () => fetch("/api/rescan", { method: "POST" }).then(json<Device[]>),
  setEffect: (req: EffectRequest) =>
    fetch("/api/effect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    }).then(json<{ effect: string }>),
};
