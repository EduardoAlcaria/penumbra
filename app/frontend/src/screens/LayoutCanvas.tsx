import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  SelectionMode,
  useNodesState,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ControllerLayout, LayoutFan } from "@/lib/api";
import FanSvg, { FAN_MODELS, MODEL_LABELS, modelFor, type FanModel } from "@/components/FanSvg";

/**
 * The effect canvas as a pannable/zoomable board. Node positions are canvas
 * pixels — the same 320x200 space the effect paints and the LEDs sample — so
 * pan and zoom are purely a view transform and never change what a fan sees.
 */

/**
 * LED colors ride a context, not node data: they change ~10x a second and
 * rebuilding the node array that often would thrash React Flow and fight the
 * drag. Nodes only change when the layout does.
 */
const Colors = createContext<string[]>([]);

type FanData = { fan: LayoutFan };

function FanNode({ data, selected }: NodeProps) {
  const colors = useContext(Colors);
  const { fan } = data as FanData;
  const model = (fan.svgModel || "auto") as FanModel;
  return (
    <div
      className={
        "h-full w-full rounded-md ring-offset-1 ring-offset-transparent transition-shadow " +
        (selected ? "ring-2 ring-primary" : "ring-0")
      }
    >
      <FanSvg fan={fan} colors={colors} model={model} className="h-full w-full" />
    </div>
  );
}

/** Where a dragged fan came from, so the move reads as a move. */
function GhostNode({ data }: NodeProps) {
  const colors = useContext(Colors);
  const { fan } = data as FanData;
  return (
    <div className="h-full w-full opacity-25 grayscale">
      <FanSvg fan={fan} colors={colors} model={(fan.svgModel || "auto") as FanModel} className="h-full w-full" />
    </div>
  );
}

/** A dashed outline around one channel's daisy chain. */
function ChannelNode({ data }: NodeProps) {
  const { channel } = data as { channel: number };
  return (
    <div className="relative h-full w-full rounded-lg border border-dashed border-primary/30">
      <span className="absolute -top-3.5 left-0 font-mono text-[5px] uppercase tracking-widest text-primary/70">
        ch {channel + 1}
      </span>
    </div>
  );
}

const nodeTypes = { fan: FanNode, ghost: GhostNode, channel: ChannelNode };

const fanId = (f: LayoutFan) => `fan-${f.channel}-${f.position}`;

export default function LayoutCanvas({
  layout,
  colors,
  onMove,
  onChangeModel,
}: {
  layout: ControllerLayout;
  colors: string[];
  onMove: (moves: { fan: LayoutFan; x: number; y: number }[]) => void;
  onChangeModel: (channel: number, svg?: string) => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [selected, setSelected] = useState<LayoutFan | null>(null);
  // While a drag is in flight the layout poll must not yank nodes back.
  const dragging = useRef(false);

  const layoutNodes = useMemo<Node[]>(() => {
    const out: Node[] = [];

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
        position: { x: x - 3, y: y - 3 },
        data: { channel },
        draggable: false,
        selectable: false,
        style: { width: w + 6, height: h + 6 },
        zIndex: -1,
      });
    }

    for (const fan of layout.fans) {
      out.push({
        id: fanId(fan),
        type: "fan",
        position: { x: fan.originX, y: fan.originY },
        data: { fan },
        style: { width: fan.width, height: fan.height },
      });
    }
    return out;
  }, [layout]);

  useEffect(() => {
    if (dragging.current) return;
    setNodes(layoutNodes);
  }, [layoutNodes, setNodes]);

  // A translucent copy of every fan being dragged, pinned where it started.
  const addGhosts = useCallback(
    (moved: Node[]) => {
      dragging.current = true;
      setNodes((ns) => [
        ...ns.filter((n) => n.type !== "ghost"),
        ...moved
          .filter((n) => n.type === "fan")
          .map((n) => ({
            ...n,
            id: `ghost-${n.id}`,
            type: "ghost",
            draggable: false,
            selectable: false,
            zIndex: -1,
          })),
      ]);
    },
    [setNodes],
  );

  const commit = useCallback(
    (moved: Node[]) => {
      dragging.current = false;
      setNodes((ns) => ns.filter((n) => n.type !== "ghost"));
      const moves = moved
        .filter((n) => n.type === "fan")
        .map((n) => ({ fan: (n.data as FanData).fan, x: n.position.x, y: n.position.y }));
      if (moves.length) onMove(moves);
    },
    [onMove, setNodes],
  );

  const currentModel: FanModel = selected ? ((selected.svgModel || "auto") as FanModel) : "auto";

  return (
    <Colors.Provider value={colors}>
      <div className="h-[520px] w-full overflow-hidden rounded-xl ring-1 ring-inset ring-border">
        <ReactFlow
          nodes={nodes}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={(_, n) => setSelected((n.data as Partial<FanData>).fan ?? null)}
          onPaneClick={() => setSelected(null)}
          onNodeDragStart={(_, __, moved) => addGhosts(moved)}
          onNodeDragStop={(_, __, moved) => commit(moved)}
          onSelectionDragStart={(_, moved) => addGhosts(moved)}
          onSelectionDragStop={(_, moved) => commit(moved)}
          // Left-drag on empty space draws a selection box; pan with middle or
          // right button, or space-drag.
          selectionOnDrag
          panOnDrag={[1, 2]}
          selectionMode={SelectionMode.Partial}
          panOnScroll
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.5}
          maxZoom={12}
          proOptions={{ hideAttribution: true }}
          style={{ background: "transparent" }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeStrokeWidth={2} />

          <Panel position="top-right">
            <div className="w-52 rounded-lg bg-card/90 p-3 ring-1 ring-inset ring-border backdrop-blur">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {selected ? `ch ${selected.channel + 1} — artwork` : "select a fan"}
              </div>
              <select
                disabled={!selected}
                value={currentModel}
                onChange={(e) =>
                  selected &&
                  onChangeModel(selected.channel, e.target.value === "auto" ? undefined : e.target.value)
                }
                className="w-full rounded-md border border-border bg-secondary px-2 py-1 text-xs text-foreground disabled:opacity-40"
              >
                {FAN_MODELS.map((m) => (
                  <option key={m} value={m} className="bg-popover text-popover-foreground">
                    {MODEL_LABELS[m]}
                    {m === "auto" && selected ? ` (${modelFor(selected)})` : ""}
                  </option>
                ))}
              </select>
              {selected && (
                <div className="mt-2 font-mono text-[10px] text-muted-foreground">
                  {selected.cols}×{selected.rows} grid · {selected.leds.length} leds
                </div>
              )}
            </div>
          </Panel>
        </ReactFlow>
      </div>
    </Colors.Provider>
  );
}
