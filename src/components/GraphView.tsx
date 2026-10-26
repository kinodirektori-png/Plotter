import dagre from '@dagrejs/dagre';
import { Background, Controls, useReactFlow, Handle, MarkerType, MiniMap, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import { Flag, GitFork, Play } from 'lucide-react';
import { memo, useEffect, useMemo } from 'react';
import { formatP } from '../engine/analysis';
import { diffState } from '../engine/state';
import type { SimNode, SimResult } from '../types/simulation';

const NODE_W = 190;
const NODE_H = 74;

type FlowData = { sim: SimNode; changes: string[]; isRoot: boolean; highlighted: boolean; selected: boolean; maxP: number };

const StateNode = memo(({ data }: NodeProps<Node<FlowData>>) => {
  const { sim, changes, isRoot, highlighted, selected, maxP } = data;
  const tone = isRoot
    ? 'border-slate-500 bg-slate-800 text-white'
    : sim.pendingDecision
      ? 'border-amber-400 bg-amber-50'
      : sim.terminal
        ? 'border-emerald-400 bg-emerald-50'
        : 'border-slate-300 bg-white';
  const ring = selected ? 'ring-2 ring-indigo-500 ring-offset-1' : highlighted ? 'ring-2 ring-indigo-300' : '';
  const share = maxP > 0 ? Math.min(1, sim.probability / maxP) : 0;
  return (
    <div className={`rounded-md border px-2 py-1.5 text-[11px] leading-tight shadow-sm ${tone} ${ring}`} style={{ width: NODE_W, height: NODE_H }}>
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-0 !bg-slate-400" />
      <div className="flex items-center gap-1 font-semibold">
        {isRoot ? <Play size={11} /> : sim.pendingDecision ? <GitFork size={11} /> : sim.terminal ? <Flag size={11} /> : null}
        <span>{isRoot ? 'Start' : `Step ${sim.depth}`}</span>
        <span className="ml-auto tabular-nums">{formatP(sim.probability)}</span>
      </div>
      <div className={`mt-0.5 h-1 rounded ${isRoot ? 'bg-slate-600' : 'bg-slate-200'}`}>
        <div className="h-1 rounded bg-indigo-500" style={{ width: `${share * 100}%` }} />
      </div>
      <div className={`mt-1 space-y-px overflow-hidden ${isRoot ? 'text-slate-300' : 'text-slate-600'}`}>
        {(changes.length ? changes : [isRoot ? 'Initial state' : 'No change from start']).slice(0, 2).map((c) => (
          <div key={c} className="truncate font-mono">
            {c}
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !border-0 !bg-slate-400" />
    </div>
  );
});

const nodeTypes = { state: StateNode };

/** Pans to the selected state (e.g. when picked from the outcomes list) without changing zoom. */
function FocusOnSelect({ center }: { center: { x: number; y: number } | undefined }) {
  const rf = useReactFlow();
  useEffect(() => {
    if (center) void rf.setCenter(center.x, center.y, { zoom: rf.getZoom(), duration: 300 });
  }, [center, rf]);
  return null;
}

interface Props {
  result: SimResult;
  minP: number;
  selectedId: string | null;
  highlight: Set<string>; // node ids on the highlighted route
  highlightEdges: Set<string>;
  onSelect: (id: string | null) => void;
}

export function GraphView({ result, minP, selectedId, highlight, highlightEdges, onSelect }: Props) {
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

  const nodes: Node<FlowData>[] = useMemo(
    () =>
      layout.visible.map((n) => {
        const p = layout.pos.get(n.id)!;
        const changes = diffState(layout.root.state, n.state).map((d) => `${d.key}=${d.after}`);
        return {
          id: n.id,
          type: 'state',
          width: NODE_W,
          height: NODE_H,
          position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 },
          data: { sim: n, changes, isRoot: n.id === result.rootId, highlighted: highlight.has(n.id), selected: n.id === selectedId, maxP: layout.maxP },
        };
      }),
    [layout, highlight, selectedId, result.rootId],
  );

  const showLabels = layout.edges.length <= 60;
  const edges: Edge[] = useMemo(
    () =>
      layout.edges.map((e) => {
        const hot = highlightEdges.has(e.id);
        const color = hot ? '#4f46e5' : e.kind === 'choice' ? '#d97706' : e.kind === 'quiet' ? '#cbd5e1' : '#94a3b8';
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label: showLabels || hot ? `${e.label} · ${formatP(e.probability)}` : undefined,
          labelStyle: { fontSize: 10, fill: hot ? '#3730a3' : '#475569' },
          labelBgPadding: [3, 1] as [number, number],
          style: { stroke: color, strokeWidth: Math.max(1, Math.min(6, 1 + e.flow * 8)), strokeDasharray: e.kind === 'quiet' ? '4 3' : undefined },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
          zIndex: hot ? 10 : 0,
        };
      }),
    [layout, highlightEdges, showLabels],
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
        proOptions={{ hideAttribution: true }}
      >
        <FocusOnSelect center={selectedId ? layout.pos.get(selectedId) : undefined} />
        <Background gap={20} color="#e2e8f0" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor={(n) => ((n.data as FlowData).sim.terminal ? '#34d399' : (n.data as FlowData).sim.pendingDecision ? '#fbbf24' : '#cbd5e1')} />
      </ReactFlow>
      {hidden > 0 && (
        <div className="pointer-events-none absolute left-3 top-3 rounded bg-white/90 px-2 py-1 text-xs text-slate-500 shadow">
          Showing {layout.visible.length} of {result.stats.nodes} states (hiding those below {formatP(minP)})
        </div>
      )}
    </div>
  );
}
