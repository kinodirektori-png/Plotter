import { Cpu, GitBranch, Layers, Map as MapIcon, Radar } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Layer } from '../engine/doctrine';

export type CanvasView = 'doctrine' | 'timeline';

function Segment<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { id: T; label: string; icon: ReactNode; tone: string }[]; label: string }) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-slate-800 bg-slate-950 p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition ${value === o.id ? o.tone : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** View switch plus the tactical layer filters at the top of the canvas. */
export function LayerToolbar({ view, onView, layer, onLayer }: { view: CanvasView; onView: (v: CanvasView) => void; layer: Layer; onLayer: (l: Layer) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-900/80 px-3 py-1.5">
      <Segment
        label="Canvas view"
        value={view}
        onChange={onView}
        options={[
          { id: 'doctrine', label: 'Doctrine map', icon: <MapIcon size={13} />, tone: 'bg-slate-700 text-slate-100' },
          { id: 'timeline', label: 'Simulated timeline', icon: <GitBranch size={13} />, tone: 'bg-slate-700 text-slate-100' },
        ]}
      />
      <Segment
        label="Tactical layers"
        value={layer}
        onChange={onLayer}
        options={[
          { id: 'all', label: 'Show All', icon: <Layers size={13} />, tone: 'bg-slate-700 text-slate-100' },
          { id: 'shocks', label: 'External Shocks (Vulnerabilities)', icon: <Radar size={13} />, tone: 'bg-rose-500/20 text-rose-200 ring-1 ring-rose-500/50' },
          { id: 'contingencies', label: 'Contingencies (If-Then Triggers)', icon: <Cpu size={13} />, tone: 'bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/50' },
        ]}
      />
      <div className="ml-auto hidden items-center gap-3 text-[10px] text-slate-500 xl:flex">
        <span className="flex items-center gap-1">
          <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#fb7185" strokeWidth="2" /></svg> causal flow
        </span>
        <span className="flex items-center gap-1">
          <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#22d3ee" strokeWidth="2" strokeDasharray="5 3" /></svg> sensor trigger
        </span>
      </div>
    </div>
  );
}
