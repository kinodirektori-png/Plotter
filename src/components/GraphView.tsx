import dagre from '@dagrejs/dagre';
import { Background, BackgroundVariant, Controls, MarkerType, MiniMap, ReactFlow, useReactFlow, type Edge, type Node } from '@xyflow/react';
import { useEffect, useMemo } from 'react';
import { formatP, isHighRisk } from '../engine/analysis';
import type { Layer } from '../engine/doctrine';
import { diffState, formatTick } from '../engine/state';
import type { EdgeKind, SimEdge, SimResult, SimulationConfig } from '../types/simulation';
import { CRIMSON, NEON, STEEL } from './DoctrineMap';
import { TIMELINE_SIZE, TimelineNode, ifClause, type TimelineData } from './TacticalNodes';

const NODE_W = TIMELINE_SIZE.w;
const NODE_H = TIMELINE_SIZE.h;

const nodeTypes = { state: TimelineNode };

/** Which arrivals a layer keeps at full strength. */
const LAYER_KINDS: Record<Layer, EdgeKind[] | null> = {
  all: null,
  shocks: ['shock'],
  contingencies: ['contingency', 'intercept'],
};

/** Pans to the selected state (e.g. when picked from the outcomes list) without changing zoom. */
function FocusOnSelect({ center }: { center: { x: number; y: number } | undefined }) {
  const rf = useReactFlow();
  useEffect(() => {
    if (center) void rf.setCenter(center.x, center.y, { zoom: rf.getZoom(), duration: 300 });
  }, [center, rf]);
  return null;
}

interface Props {
  config: SimulationConfig;
  layer: Layer;
  result: SimResult;
  minP: number;
  selectedId: string | null;
  highlight: Set<string>; // node ids on the highlighted route
  highlightEdges: Set<string>;
  onSelect: (id: string | null) => void;
}

/** Headline and detail line for a state, from the transition on its most likely route. */
function describeArrival(config: SimulationConfig, e: SimEdge): { heading: string; detail?: string } {
  if (e.kind === 'shock') return { heading: config.externalEvents.find((x) => x.id === e.refId)?.title ?? e.label };
  if (e.kind === 'quiet') return { heading: e.label };
  const [shockId, rule] = e.kind === 'intercept' ? e.refId.split('>') : [undefined, e.refId];
  const [cid, aid] = rule.split(':');
  const c = config.contingencies.find((x) => x.id === cid);
  const action = c?.actions.find((x) => x.id === aid)?.label ?? aid;
  if (!c) return { heading: e.label };
  if (shockId) return { heading: `${config.externalEvents.find((x) => x.id === shockId)?.title ?? shockId}`, detail: `⟂ ${c.title} → ${action}` };
  return { heading: `${c.title} → ${action}`, detail: `IF ${ifClause(c)}` };
}

export function GraphView({ config, layer, result, minP, selectedId, highlight, highlightEdges, onSelect }: Props) {
  const layout = useMemo(() => {
    const root = result.nodes[result.rootId];
    const visible = Object.values(result.nodes).filter((n) => n.id === result.rootId || n.probability >= minP);
    const ids = new Set(visible.map((n) => n.id));
    const edges = result.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'TB', nodesep: 24, ranksep: 70 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const n of visible) g.setNode(n.id, { width: NODE_W, height: NODE_H });
    for (const e of edges) g.setEdge(e.source, e.target);
    dagre.layout(g);
    const maxP = Math.max(...visible.filter((n) => n.id !== result.rootId).map((n) => n.probability), 0);
    const pos = new Map(visible.map((n) => [n.id, g.node(n.id)]));
    return { visible, edges, maxP, pos, root };
  }, [result, minP]);

  const keep = LAYER_KINDS[layer];
  const nodes: Node<TimelineData>[] = useMemo(() => {
    const edgeById = new Map(result.edges.map((e) => [e.id, e]));
    const shockById = new Map(config.externalEvents.map((e) => [e.id, e]));
    return layout.visible.map((n) => {
      const p = layout.pos.get(n.id)!;
      const changes = diffState(layout.root.state, n.state).map((d) => `${d.key}=${d.after}`);
      const via = n.bestEdge ? edgeById.get(n.bestEdge) : undefined;
      const { heading, detail } = via ? describeArrival(config, via) : { heading: 'Start', detail: 'plan armed, waiting for the first shock' };
      const shock = via?.kind === 'shock' ? shockById.get(via.refId) : undefined;
      const tripped = n.pendingContingency ? config.contingencies.find((c) => c.id === n.pendingContingency)?.title : undefined;
      return {
        id: n.id,
        type: 'state',
        width: NODE_W,
        height: NODE_H,
        position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 },
        data: {
          sim: n,
          isRoot: n.id === result.rootId,
          arrival: via?.kind,
          heading,
          detail: detail ?? (via?.kind === 'shock' ? changes.join(' · ') || undefined : undefined),
          stepP: via?.probability,
          tick: formatTick(config.timeline, n.depth),
          changes,
          blindSpot: !!shock && n.terminal && n.terminalReason === 'noMoves' && isHighRisk(shock),
          tripped,
          highlighted: highlight.has(n.id),
          selected: n.id === selectedId,
          dimmed: !!keep && n.id !== result.rootId && !(via && keep.includes(via.kind)),
          maxP: layout.maxP,
        },
      };
    });
  }, [layout, highlight, selectedId, result, config, keep]);

  const showLabels = layout.edges.length <= 60;
  const edges: Edge[] = useMemo(
    () =>
      layout.edges.map((e) => {
        const hot = highlightEdges.has(e.id);
        // Solid: the world moving (shocks, time). Pulsing neon dashes: a sensor woke a contingency.
        const trigger = e.kind === 'contingency' || e.kind === 'intercept';
        const base = e.kind === 'shock' ? CRIMSON : e.kind === 'contingency' ? NEON : e.kind === 'intercept' ? STEEL : '#475569';
        const color = hot ? '#f8fafc' : base;
        const faded = !!keep && !keep.includes(e.kind);
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          animated: trigger,
          className: trigger ? 'edge-trigger' : undefined,
          label: showLabels || hot ? `${e.label} · ${formatP(e.probability)}` : undefined,
          labelStyle: { fontSize: 10, fill: hot ? '#f8fafc' : trigger ? NEON : '#94a3b8' },
          labelBgStyle: { fill: '#020617' },
          labelBgPadding: [3, 1] as [number, number],
          style: {
            stroke: color,
            strokeWidth: Math.max(1, Math.min(6, 1 + e.flow * 8)),
            strokeDasharray: trigger ? '6 4' : e.kind === 'quiet' ? '2 4' : undefined,
            opacity: faded ? 0.12 : e.kind === 'shock' && !hot ? 0.75 : 1,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
          zIndex: hot ? 10 : trigger ? 5 : 0,
        };
      }),
    [layout, highlightEdges, showLabels, keep],
  );

  const hidden = result.stats.nodes - layout.visible.length;
  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, n) => onSelect(n.id)}
        onPaneClick={() => onSelect(null)}
        nodesDraggable={false}
        nodesConnectable={false}
        // Big trees are unreadable fully zoomed out, so open at a readable zoom on the start node.
        // The fit-view control in the corner shows everything.
        onInit={(rf) => {
          const p = layout.pos.get(result.rootId);
          if (p) void rf.setCenter(p.x, p.y + 260, { zoom: 0.85 });
        }}
        minZoom={0.05}
        colorMode="dark"
        proOptions={{ hideAttribution: true }}
      >
        <FocusOnSelect center={selectedId ? layout.pos.get(selectedId) : undefined} />
        <Background variant={BackgroundVariant.Lines} gap={40} color="#0f1d2e" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          maskColor="rgba(2,6,23,0.7)"
          nodeColor={(n) => {
            const d = n.data as TimelineData;
            return d.blindSpot ? '#f43f5e' : d.arrival === 'shock' ? '#9f1239' : d.arrival === 'contingency' || d.arrival === 'intercept' ? STEEL : '#475569';
          }}
        />
      </ReactFlow>
      {hidden > 0 && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-slate-900/90 px-2 py-1 text-xs text-slate-400 shadow">
          Showing {layout.visible.length} of {result.stats.nodes} states (hiding those below {formatP(minP)})
        </div>
      )}
    </div>
  );
}
