# Plotter

Model a situation as world variables, actors, random events and decisions, and see every way it can play out: an interactive graph of states with probabilities, plus a story dossier of the likely outcomes.

Everything runs in the browser. There is no backend, no account and no network traffic; scenarios are saved to `localStorage` and can be exported/imported as JSON.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine tests
npm run build    # static site in dist/
```

Pushing to `main` runs the tests and deploys `dist/` to GitHub Pages via `.github/workflows/deploy.yml` (enable Pages → "GitHub Actions" in the repo settings once).

## How the engine works

The world is a flat key/value state: variables by id, and actor attributes as `actorId.attribute`.

Each **step**, one thing happens:

1. If a **decision** has its conditions met and hasn't been made yet, it takes the step and branches into every valid choice.
2. Otherwise every **event** whose preconditions hold (and that hasn't fired, unless repeatable) is eligible. They compete for the step in proportion to their probability. With *quiet steps* on, if the eligible probabilities sum below 1, the remainder becomes a "nothing happens" branch; with it off, they are rescaled to sum to 1.

Because events are gated by state rather than a fixed sequence, "lose job" can happen before or after "relocate", and causality is enforced only where preconditions say so.

**Exhaustive mode** expands breadth-first, one depth at a time. States that are identical (same variables and same used-up events) at the same depth are merged into one DAG node, so their probabilities add up. A level is fully accumulated before pruning, so the prune threshold is applied to exact merged probabilities. A node cap protects the browser.

**Monte Carlo mode** samples N seeded paths through the same rules and folds them into the same DAG, with observed frequencies as probabilities.

**Outcomes** group end states by final world state. Each shows its total probability, how many distinct orderings lead there, and the single most likely route as a story.

**Choice policy.** By default a choice is followed in full (probability "given your choices"), so outcomes from different branches can sum to more than 100%. Set it to *uniform* to treat choices as coin flips.

## Security

- The production build ships a strict Content-Security-Policy (`connect-src 'none'`, no inline scripts).
- Preconditions and mutations are structured data; nothing is ever `eval`'d.
- All imported/stored scenarios are validated with zod (size caps, finite numbers, no `__proto__`-style keys) before the engine sees them.

## Layout

```
src/types/simulation.ts   schema types (spec section 3 + optional extensions)
src/engine/               state rules, simulation, outcome analysis, zod schema, tests
src/components/           editor, React Flow graph, dossier
src/data/sampleScenario.ts
```
