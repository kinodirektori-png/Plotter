# Plotter

A tactical contingency planner, a war room for branching outcomes. Model what you cannot control (external shocks with probabilities) apart from what you can (pre-planned If-Then contingencies driven by sensors), then see every way the operation can play out, how much of your risk is covered, and where your blind spots are.

Everything runs in the browser. There is no backend, no account and no network traffic; scenarios are saved to `localStorage` and can be exported/imported as JSON.

## Scenarios

Use **New** to start a blank plan, then build it in the left-hand editor:

- **Shocks** (`externalEvents`): the chaos. Each has a probability, a severity, optional tick window (`from`/`until`) and world conditions. The planner can never edit them.
- **If-Then** (`contingencies`): the agency. Sensors are thresholds over world state (`savings < 500`) or the clock (`tick >= 6`, `date >= 2026-10-31`). A rule either fires as soon as its sensors trip (proactive) or sits armed and **intercepts** the shocks it names, cancelling their effects.

The **Examples** menu has two war-room plans (a night raid and a layoff runway plan) plus the career and fairy-tale scenarios. Scenarios exported before the redesign still import: their events become shocks and their decisions become contingencies.

## The canvas

- **Doctrine map**: the plan itself. Crimson/amber cards are shocks (with `P = 15%` tags), steel-blue blocks are contingencies with their If → Then rule on the face, and cyan pills are sensors. Solid lines are causal flow; pulsing neon dashes are sensor-to-contingency triggers.
- **Simulated timeline**: every reachable state with its probability, coloured by what got it there.
- **Layer toggles**: Show All, External Shocks (Vulnerabilities), or Contingencies (If-Then Triggers).

The right-hand **Resilience** tab shows contingency coverage (the share of high-risk shocks that have an If-Then rule intercepting them or watching what they change) and blind spots (dead ends where a high-risk shock hit before any sensor could trip). Shocks without a severity count as high risk from P = 25%.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine tests
npm run build    # static site in dist/
```

Pushing to `main` runs the tests and deploys `dist/` to GitHub Pages via `.github/workflows/deploy.yml` (enable Pages → "GitHub Actions" in the repo settings once).

## How the engine works

The world is a flat key/value state: variables by id, and actor attributes as `actorId.attribute`. Each **tick**, one thing happens, in war-room order:

1. **Sensor sweep.** If a proactive contingency's sensors are all tripped and it hasn't fired yet, it takes the tick and branches into each valid action. The actor reacts before the world can move again.
2. **Shocks.** Otherwise every shock whose conditions and window hold (and that hasn't hit yet, unless repeatable) is eligible, and they compete in proportion to their probability. With *quiet ticks* on, if the eligible probabilities sum below 1, the remainder becomes a "quiet tick" branch; with it off, they are rescaled. If an armed interceptor names the shock that hits, the shock is used up but its mutations are replaced by the interceptor's action.
3. **Time passes.** If nothing is eligible but a shock is scheduled later or a clock sensor could still trip, the clock advances.

**Exhaustive mode** expands breadth-first, one depth at a time. States that are identical (same variables and same used-up events) at the same depth are merged into one DAG node, so their probabilities add up. A level is fully accumulated before pruning, so the prune threshold is applied to exact merged probabilities. A node cap protects the browser.

**Monte Carlo mode** samples N seeded paths through the same rules and folds them into the same DAG, with observed frequencies as probabilities.

**Outcomes** group end states by final world state. Each shows its total probability, how many distinct orderings lead there, and the single most likely route as a story.

**Option policy.** When a contingency has several actions, by default each is followed in full (probability "given the options taken"), so outcomes from different branches can sum to more than 100%. Set it to *uniform* to treat options as coin flips.

## Security

- The production build ships a strict Content-Security-Policy (`connect-src 'none'`, no inline scripts).
- Preconditions and mutations are structured data; nothing is ever `eval`'d.
- All imported/stored scenarios are validated with zod (size caps, finite numbers, no `__proto__`-style keys) before the engine sees them.

## Layout

```
src/types/simulation.ts   schema types: ExternalEvent, Contingency, sensors, timeline
src/engine/               state rules, simulation, resilience analysis, doctrine map, zod schema (+ v1 migration), tests
src/components/           editor, tactical React Flow nodes, doctrine map, timeline, resilience panel, dossier
src/data/                 example plans (warRoom.ts) and scenarios
```
