import dagre from '@dagrejs/dagre';
import { Background, BackgroundVariant, Controls, MarkerType, MiniMap, ReactFlow, type Edge, type Node } from '@xyflow/react';
import { useMemo } from 'react';
import { buildDoctrine, type Layer } from '../engine/doctrine';
import type { SimulationConfig } from '../types/simulation';
import { DOCTRINE_SIZE, doctrineNodeTypes, type DoctrineData } from './TacticalNodes';

export const NEON = '#22d3ee';
export const STEEL = '#38bdf8';
export const CRIMSON = '#fb7185';

/** The plan itself: shocks, contingencies and the sensors that wake them, laid out left to right. */
export function DoctrineMap({ config, layer }: { config: SimulationConfig; layer: Layer }) {
  const { nodes, edges } = useMemo(() => {
    const doc = buildDoctrine(config, layer);
    const size = (n: (typeof doc.nodes)[number]) =>
      n.kind === 'shock' ? DOCTRINE_SIZE.shock : n.kind === 'sensor' ? DOCTRINE_SIZE.sensor : DOCTRINE_SIZE.contingency(n.contingency);
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', nodesep: 26, ranksep: 90 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const n of doc.nodes) g.setNode(n.id, { width: size(n).w, height: size(n).h });
    for (const e of doc.edges) g.setEdge(e.source, e.target);
    dagre.layout(g);

    const flowNodes: Node<DoctrineData>[] = doc.nodes.map((n) => {
      const p = g.node(n.id);
      const s = size(n);
      return { id: n.id, type: n.kind, width: s.w, height: s.h, position: { x: p.x - s.w / 2, y: p.y - s.h / 2 }, data: { node: n, timeline: config.timeline, dimmed: false } };
    });
    const flowEdges: Edge[] = doc.edges.map((e) => {
      if (e.kind === 'trigger') {
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          animated: true,
          className: 'edge-trigger',
          label: e.label,
          labelStyle: { fontSize: 10, fill: NEON, fontFamily: 'ui-monospace, monospace' },
          labelBgStyle: { fill: '#020617' },
          style: { stroke: NEON, strokeWidth: 2, strokeDasharray: '6 4' },
          markerEnd: { type: MarkerType.ArrowClosed, color: NEON, width: 14, height: 14 },
          zIndex: 5,
        };
      }
      if (e.kind === 'intercept') {
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label: '⟂ intercepts',
          className: 'edge-intercept',
          labelStyle: { fontSize: 10, fill: STEEL, fontWeight: 600 },
          labelBgStyle: { fill: '#020617' },
          style: { stroke: STEEL, strokeWidth: 2.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: STEEL, width: 14, height: 14 },
          zIndex: 4,
        };
      }
      const fromShock = e.source.startsWith('shock:');
      const color = fromShock ? 'rgba(251,113,133,0.55)' : 'rgba(56,189,248,0.55)';
      return { id: e.id, source: e.source, target: e.target, style: { stroke: color, strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color, width: 12, height: 12 } };
    });
    return { nodes: flowNodes, edges: flowEdges };
  }, [config, layer]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={doctrineNodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      fitView
      // Clamp so a big plan opens readable; the fit-view control still shows everything.
      fitViewOptions={{ padding: 0.15, maxZoom: 1, minZoom: 0.7 }}
      minZoom={0.05}
      colorMode="dark"
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Lines} gap={40} color="#0f1d2e" />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable nodeColor={(n) => (n.type === 'shock' ? CRIMSON : n.type === 'sensor' ? NEON : STEEL)} maskColor="rgba(2,6,23,0.7)" />
      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-500">Nothing on this layer yet.</div>
      )}
    </ReactFlow>
  );
}
