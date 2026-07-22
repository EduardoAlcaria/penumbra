import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Component, ControllerLayout, LayoutFan } from "@/lib/api";
import FanSvg, { modelFor, type FanModel } from "@/components/FanSvg";

/**
 * The effect canvas as a pannable/zoomable board. Node positions are canvas
 * pixels — the same 320x200 space the effect paints and the LEDs sample — so
 * pan and zoom are purely a view transform and never change what a fan sees.
 */

const CANVAS_W = 320;
const CANVAS_H = 200;

/**
 * LED colors ride a context, not node data: they change ~10x a second and
 * rebuilding the node array that often would thrash React Flow. Nodes only
 * change when the layout does.
 */
const Colors = createContext<string[]>([]);

function FanNode({ data }: NodeProps) {
  const colors = useContext(Colors);
  const { fan, model } = data as { fan: LayoutFan; model?: FanModel };
  return <FanSvg fan={fan} colors={colors} model={model} className="h-full w-full" />;
}

/** The 320x200 effect canvas itself, so it's obvious where the effect lives. */
function CanvasNode() {
  return <div className="h-full w-full rounded-md border border-white/15 bg-black/50" />;
}

/** A dashed outline around one channel's daisy chain. */
function ChannelNode({ data }: NodeProps) {
  const { channel } = data as { channel: number };
  return (
    <div className="relative h-full w-full rounded-md border border-dashed border-primary/40">
      <span className="absolute -top-4 left-0 font-mono text-[6px] uppercase tracking-widest text-primary/70">
        ch {channel + 1}
      </span>
    </div>
  );
}

const nodeTypes = { fan: FanNode, canvas: CanvasNode, channel: ChannelNode };

export default function LayoutCanvas({
  layout,
  colors,
  gear,
  onMove,
  onChangeModel,
}: {
  layout: ControllerLayout;
  colors: string[];
  gear: Component[];
  onMove: (fan: LayoutFan, x: number, y: number) => void;
  onChangeModel: (channel: number, componentId: number) => void;
}) {
  const [selected, setSelected] = useState<LayoutFan | null>(null);

  // Drop a stale selection if the layout changed underneath it.
  useEffect(() => {
    if (selected && !layout.fans.some((f) => f.channel === selected.channel && f.position === selected.position)) {
      setSelected(null);
    }
  }, [layout, selected]);

  const nodes = useMemo<Node[]>(() => {
    const out: Node[] = [
      {
        id: "canvas",
        type: "canvas",
        position: { x: 0, y: 0 },
        data: {},
        draggable: false,
        selectable: false,
        style: { width: CANVAS_W, height: CANVAS_H },
        zIndex: -2,
      },
    ];

    // One outline per channel, sized to whatever its fans currently span.
    const byChannel = new Map<number, LayoutFan[]>();
    for (const f of layout.fans) {
      const list = byChannel.get(f.channel) ?? [];
      list.push(f);
      byChannel.set(f.channel, list);
    }
    for (const [channel, fans] of byChannel) {
      const x = Math.min(...fans.map((f) => f.originX));
      const y = Math.min(...fans.map((f) => f.originY));
      const w = Math.max(...fans.map((f) => f.originX + f.width)) - x;
      const h = Math.max(...fans.map((f) => f.originY + f.height)) - y;
      out.push({
        id: `ch-${channel}`,
        type: "channel",
        position: { x: x - 2, y: y - 2 },
        data: { channel },
        draggable: false,
        selectable: false,
        style: { width: w + 4, height: h + 4 },
        zIndex: -1,
      });
    }

    for (const fan of layout.fans) {
      out.push({
        id: `fan-${fan.channel}-${fan.position}`,
        type: "fan",
        position: { x: fan.originX, y: fan.originY },
        data: { fan },
        style: { width: fan.width, height: fan.height },
        selected: selected?.channel === fan.channel && selected?.position === fan.position,
      });
    }
    return out;
  }, [layout, selected]);

  const fanModels = useMemo(
    () => gear.filter((g) => g.type === "Fan").sort((a, b) => a.name.localeCompare(b.name)),
    [gear],
  );

  return (
    <Colors.Provider value={colors}>
      <div className="h-[520px] w-full overflow-hidden rounded-xl ring-1 ring-inset ring-white/10">
        <ReactFlow
          nodes={nodes}
          nodeTypes={nodeTypes}
          onNodeClick={(_, n) => setSelected((n.data as { fan?: LayoutFan }).fan ?? null)}
          onPaneClick={() => setSelected(null)}
          onNodeDragStop={(_, n) => {
            const fan = (n.data as { fan?: LayoutFan }).fan;
            if (fan) onMove(fan, n.position.x, n.position.y);
          }}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.5}
          maxZoom={12}
          proOptions={{ hideAttribution: true }}
          style={{ background: "transparent" }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#3f3f46" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeStrokeWidth={2} style={{ background: "#0e1014" }} />

          <Panel position="top-right">
            <div className="w-56 rounded-lg bg-card/90 p-3 ring-1 ring-inset ring-white/10 backdrop-blur">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {selected ? `ch ${selected.channel + 1} — fan model` : "select a fan"}
              </div>
              <select
                disabled={!selected}
                value={selected?.componentId ?? ""}
                onChange={(e) => selected && onChangeModel(selected.channel, Number(e.target.value))}
                className="w-full rounded-md border border-border bg-secondary px-2 py-1 text-xs text-foreground disabled:opacity-40"
              >
                {fanModels.map((g) => (
                  <option key={g.id} value={g.id} className="bg-popover text-popover-foreground">
                    {g.name}
                  </option>
                ))}
              </select>
              {selected && (
                <div className="mt-2 font-mono text-[10px] text-muted-foreground">
                  {selected.cols}x{selected.rows} grid · {selected.leds.length} leds ·{" "}
                  {modelFor(selected)}
                </div>
              )}
            </div>
          </Panel>
        </ReactFlow>
      </div>
    </Colors.Provider>
  );
}
