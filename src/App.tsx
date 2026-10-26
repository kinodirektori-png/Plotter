import { AlertTriangle, Download, FileText, FilePlus2, Upload, Waypoints } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Dossier, buildDossierMarkdown } from './components/Dossier';
import { Editor } from './components/Editor';
import { GraphView } from './components/GraphView';
import { Button, Select } from './components/ui';
import { blankScenario, examples, matchesExample } from './data/library';
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
  return examples[0].config;
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
  // A scenario waiting to replace the current one once the user confirms.
  const [pending, setPending] = useState<{ label: string; config: SimulationConfig } | null>(null);
  const [editorKey, setEditorKey] = useState(0); // remounts the editor so it opens on the right tab
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
  // Only react when validation produces something new, so a scenario opened
  // directly (below) isn't overwritten by the still-deferred old one.
  const [seenValidation, setSeenValidation] = useState(validation);
  if (validation !== seenValidation) {
    setSeenValidation(validation);
    if (validation.ok) setGoodConfig(validation.config);
  }
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

  const applyScenario = (next: SimulationConfig) => {
    setConfig(next);
    setGoodConfig(next); // simulate right away so the graph remounts on the new scenario
    setSelectedId(null);
    setPending(null);
    setEditorKey((k) => k + 1);
  };
  // Unchanged examples are safe to swap out; anything you edited asks first.
  const openScenario = (label: string, next: SimulationConfig) => (matchesExample(config) ? applyScenario(next) : setPending({ label, config: next }));

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
          <Select
            aria-label="Open an example or start a new scenario"
            value=""
            onChange={(e) => {
              const v = e.target.value;
              const next = v === 'new' ? { label: 'a new blank scenario', config: blankScenario() } : examples.find((x) => x.id === v);
              if (next) openScenario(next.label, next.config);
            }}
          >
            <option value="" disabled>
              Examples…
            </option>
            {examples.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </Select>
          <Button variant="primary" onClick={() => openScenario('a new blank scenario', blankScenario())} title="Start your own scenario from scratch">
            <FilePlus2 size={14} /> New
          </Button>
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

        </div>
      </header>
      {pending && (
        <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          <span className="flex-1">Open {pending.label}? This replaces your current scenario. Use Export first if you want to keep it.</span>
          <Button variant="primary" className="!py-0.5 text-xs" onClick={() => applyScenario(pending.config)}>
            Replace
          </Button>
          <Button className="!py-0.5 text-xs" onClick={() => setPending(null)}>
            Cancel
          </Button>
        </div>
      )}
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
          <Editor key={editorKey} config={config} onChange={setConfig} />
        </aside>
        <section className="relative min-h-[50vh] flex-1">
          {sim && (
            <GraphView key={editorKey} result={sim.result} minP={minP} selectedId={selected} highlight={highlight} highlightEdges={highlightEdges}
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
