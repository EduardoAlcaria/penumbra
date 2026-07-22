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

export interface EffectProperty {
  key: string;
  label: string;
  type: "color" | "number" | "boolean" | "combobox" | string;
  default: unknown;
  min: number | null;
  max: number | null;
  values: string[] | null;
}
export interface EffectInfo {
  name: string;
  description: string;
  properties: EffectProperty[];
}
export interface ControllerFrame {
  controllerKey: string;
  colors: string[];
}

/** A controller detected but not drivable yet — shown to the user as a warning. */
export interface UnsupportedDevice {
  id: string;
  name: string;
  reason: string;
}

/** Bundled gear (fans/strips) with SignalRGB asset photos + LED geometry. */
export interface Component {
  id: number;
  name: string;
  brand: string;
  type: string;
  ledCount: number;
  width: number;
  height: number;
  ledCoordinates: [number, number][];
  imageUrl: string;
}

/** x/y are canvas pixels; cx/cy are the LED's cell in the component's own grid. */
export interface LayoutLed { flatIndex: number; x: number; y: number; cx: number; cy: number }
/** originX/Y, width/height are canvas pixels; cols/rows are the LED grid. */
export interface LayoutFan {
  componentId: number;
  name: string;
  imageUrl: string;
  channel: number;
  position: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
  cols: number;
  rows: number;
  leds: LayoutLed[];
}
export interface ControllerLayout {
  controllerKey: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  fans: LayoutFan[];
}
export interface Assignment { channel: number; position: number; componentId: number }

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  i18n: (lang: string) => fetch(`${BASE}/api/i18n?lang=${lang}`).then(json<Record<string, string>>),
  devices: () => fetch(`${BASE}/api/devices`).then(json<Device[]>),
  components: () => fetch(`${BASE}/api/components`).then(json<Component[]>),
  unsupported: () => fetch(`${BASE}/api/unsupported`).then(json<UnsupportedDevice[]>),
  rescan: () => fetch(`${BASE}/api/rescan`, { method: "POST" }).then(json<Device[]>),
  effects: () => fetch(`${BASE}/api/effects`).then(json<EffectInfo[]>),
  activeEffect: () =>
    fetch(`${BASE}/api/effect/active`).then(json<{ name: string; props: Record<string, unknown> }>),
  effectCanvas: (n: number) =>
    fetch(`${BASE}/api/effect/canvas?n=${n}`).then(json<{ colors: string[] }>),
  setEffect: (body: { name?: string; yaml?: string; props?: Record<string, unknown> }) =>
    fetch(`${BASE}/api/effect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(json<{ effect: string }>),
  frame: () =>
    fetch(`${BASE}/api/frame`).then(json<{ controllers: ControllerFrame[] }>),
  layout: () =>
    fetch(`${BASE}/api/layout`).then(json<{ controllers: ControllerLayout[] }>),
  /** Drop a fan at (x, y) on the canvas; omit x/y to put it back on auto-arrange. */
  setPlacement: (controllerKey: string, channel: number, position: number, x?: number, y?: number) => {
    const q = new URLSearchParams({ controllerKey, channel: String(channel), position: String(position) });
    if (x !== undefined) q.set("x", String(x));
    if (y !== undefined) q.set("y", String(y));
    return fetch(`${BASE}/api/layout/placement?${q}`, { method: "PUT" }).then(json<ControllerLayout>);
  },
  setAssignments: (controllerKey: string, items: Assignment[]) =>
    fetch(`${BASE}/api/layout/assignments?controllerKey=${encodeURIComponent(controllerKey)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(items),
    }).then(json<ControllerLayout>),
};
