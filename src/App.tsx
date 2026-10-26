import { AlertTriangle, Download, FileText, RotateCcw, Upload, Waypoints } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Dossier, buildDossierMarkdown } from './components/Dossier';
import { Editor } from './components/Editor';
import { GraphView } from './components/GraphView';
import { Button, Select } from './components/ui';
import { sampleScenario } from './data/sampleScenario';
import { bestPath, computeOutcomes } from './engine/analysis';
import { parseConfig, parseConfigJson } from './engine/schema';
import { simulate } from './engine/simulate';
import type { SimulationConfig } from './types/simulation';

const STORAGE_KEY = 'outcome-sim:scenario:v1';
const MAX_IMPORT_BYTES = 2_000_000;

function loadStored(): SimulationConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const r = parseConfigJson(raw);
      if (r.ok) return r.config;
    }
  } catch {
    // storage unavailable (private mode etc.): fall through to the sample
  }
  return sampleScenario;
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scenario';

export default function App() {
  const [config, setConfig] = useState<SimulationConfig>(loadStored);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [graphPick, setGraphPick] = useState(0); // bumps when a node is clicked in the graph
  const [visibleCap, setVisibleCap] = useState(300);
  const [confirmReset, setConfirmReset] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const deferred = useDeferredValue(config);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      // ignore quota / private mode
    }
  }, [config]);

  // Everything the engine sees has passed the zod schema. While the editor
  // holds an invalid draft, keep showing the last good result.
  const validation = useMemo(() => parseConfig(deferred), [deferred]);
  const [goodConfig, setGoodConfig] = useState(config);
  if (validation.ok && validation.config !== goodConfig) setGoodConfig(validation.config);
  const sim = useMemo(() => ({ result: simulate(goodConfig), config: goodConfig }), [goodConfig]);

  const outcomes = useMemo(() => (sim ? computeOutcomes(sim.result) : []), [sim]);

  const minP = useMemo(() => {
    if (!sim) return 0;
    const ps = Object.values(sim.result.nodes).map((n) => n.probability).sort((a, b) => b - a);
    return ps.length > visibleCap ? ps[visibleCap - 1] : 0;
  }, [sim, visibleCap]);

  const selected = selectedId && sim?.result.nodes[selectedId] ? selectedId : null;
  const { highlight, highlightEdges } = useMemo(() => {
    const nodes = new Set<string>();
    const edges = new Set<string>();
    if (sim && selected) {
      for (const e of bestPath(sim.result, selected)) {
        edges.add(e.id);
        nodes.add(e.source);
        nodes.add(e.target);
      }
    }
    return { highlight: nodes, highlightEdges: edges };
  }, [sim, selected]);

  const onImport = async (file: File) => {
    if (file.size > MAX_IMPORT_BYTES) {
      setImportError('File is larger than 2 MB.');
      return;
    }
    const r = parseConfigJson(await file.text());
    if (r.ok) {
      setConfig(r.config);
      setSelectedId(null);
      setImportError(null);
    } else setImportError(r.errors.join('\n'));
  };

  const stats = sim?.result.stats;
  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <Waypoints className="text-indigo-600" size={20} />
        <h1 className="mr-2 text-base font-semibold">{config.title || 'Outcome Simulator'}</h1>
        {stats && (
          <span className="text-xs text-slate-500">
            {stats.nodes} states · {stats.edges} transitions · {outcomes.length} outcomes
            {stats.mergedArrivals > 0 && ` · ${stats.mergedArrivals} merged`} · {stats.ms} ms
          </span>
        )}
        {stats?.truncated && (
          <span className="flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
            <AlertTriangle size={12} /> Node limit hit; least likely states dropped
          </span>
        )}
        {!validation.ok && (
          <span className="flex items-center gap-1 rounded bg-rose-100 px-1.5 py-0.5 text-xs text-rose-700" title={validation.errors.join('\n')}>
            <AlertTriangle size={12} /> {validation.errors[0]}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImport(f);
              e.target.value = '';
            }}
          />
          <Button onClick={() => fileRef.current?.click()} title="Import scenario JSON">
            <Upload size={14} /> Import
          </Button>
          <Button onClick={() => download(`${slug(config.title ?? '')}.json`, JSON.stringify(config, null, 2), 'application/json')} title="Export scenario JSON">
            <Download size={14} /> Export
          </Button>
          <Button
            disabled={!sim}
            onClick={() => sim && download(`${slug(config.title ?? '')}-dossier.md`, buildDossierMarkdown(sim.config, sim.result, outcomes), 'text/markdown')}
            title="Download the story dossier as Markdown"
          >
            <FileText size={14} /> Dossier
          </Button>
          <Button
            variant={confirmReset ? 'danger' : 'ghost'}
            title="Load the sample scenario (replaces the current one)"
            onBlur={() => setConfirmReset(false)}
            onClick={() => {
              if (!confirmReset) return setConfirmReset(true);
              setConfig(sampleScenario);
              setSelectedId(null);
              setConfirmReset(false);
            }}
          >
            <RotateCcw size={14} /> {confirmReset && 'Replace with sample?'}
          </Button>
        </div>
      </header>
      {importError && (
        <div className="flex items-start gap-2 border-b border-rose-200 bg-rose-50 px-3 py-1.5 text-xs whitespace-pre-wrap text-rose-700">
          <span className="flex-1">Import failed: {importError}</span>
          <button type="button" onClick={() => setImportError(null)} className="font-medium">
            Dismiss
          </button>
        </div>
      )}
      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="h-[45vh] shrink-0 border-b border-slate-200 bg-slate-50 lg:h-auto lg:w-[380px] lg:border-r lg:border-b-0">
          <Editor config={config} onChange={setConfig} />
        </aside>
        <section className="relative min-h-[50vh] flex-1">
          {sim && (
            <GraphView result={sim.result} minP={minP} selectedId={selected} highlight={highlight} highlightEdges={highlightEdges}
              onSelect={(id) => {
                setSelectedId(id);
                if (id) setGraphPick((n) => n + 1);
              }}
            />
          )}
          <div className="absolute right-3 top-3 flex items-center gap-1 rounded bg-white/90 px-2 py-1 text-xs shadow">
            Show
            <Select value={visibleCap} onChange={(e) => setVisibleCap(Number(e.target.value))} className="!py-0 text-xs">
              <option value={100}>top 100</option>
              <option value={300}>top 300</option>
              <option value={1000}>top 1000</option>
              <option value={100000}>all</option>
            </Select>
            states
          </div>
        </section>
        <aside className="h-[60vh] shrink-0 border-t border-slate-200 bg-slate-50 lg:h-auto lg:w-[380px] lg:border-t-0 lg:border-l">
          {sim && <Dossier config={sim.config} result={sim.result} outcomes={outcomes} selectedId={selected} graphPick={graphPick} onSelect={setSelectedId} />}
        </aside>
      </main>
    </div>
  );
}
