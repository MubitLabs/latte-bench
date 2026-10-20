# Latte Bench · plan then execute

A lightweight, vanilla JavaScript / Three.js workstation for testing planning and adaptation in a stylized latte simulator. Bun runs the app and physics. uv runs the development-only CMA-ES baseline. No React.

## Run

```sh
bun install
bun run dev
```

Open http://127.0.0.1:3000. **Run benchmark** selects the model route, attempt budget, milk seed and memory ablation. **Try without an API → Run calibrated reference** executes the passing default-milk witness. **Trace** exposes the planning input and exports full execution evidence. Physical buttons remain available for manual exploration.

Bun loads `.env`; keys stay server-side and are ignored by Git:

```dotenv
MUBIT_BASE_URL=https://api.mubit.ai/openai/v1/
MUBIT_API_KEY=your-key
MUBIT_MODEL=your-model-id
FRONTIER_MODEL=your-comparison-model-id
```

Optional `FRONTIER_BASE_URL` / `FRONTIER_API_KEY` select another OpenAI-compatible backend. Otherwise both routes use the gateway. Configure documented gateway-specific fields through `MUBIT_EXTRA_BODY`. Restart after changing credentials. Provider-side memory, routing and weight updates remain outside this benchmark's control; fix those when comparing controllers.

## One plan, one attempt

The model returns **only** `{"parameters": [21 numbers]}`. Every value must be finite and in `[0,1]`; no clipping, retry, additional controls or silent correction is allowed. Invalid JSON, wrong lengths and out-of-bounds values produce a clear rejection and consume an attempt. Provider failures are recorded as failed attempts too.

[`src/plans.js`](src/plans.js) is the single parameter schema, validator, decoder and executor used by both agents and CMA-ES. These are the previous optimizer's 21 coordinates and physical bounds, with a new, explicitly open-loop decoder:

| Coordinates | Meaning after linear decoding |
| --- | --- |
| 0 | Nominal pre-drawing cup volume, 180–210 ml |
| 1 | Drawing tilt, 45–85° |
| 2 | Drawing height, 10–40 mm |
| 3–20 | Six triples: x ∈ [−0.75,0.75], z ∈ [−0.75,0.75], duration ∈ [0.15,1.5] s |

The decoder compiles the **entire** schedule before simulation: grind, extract, heat toward 62°C from the revealed starting temperature, pick up, nominal fill, six stationary drawing pours, settle, serve. Fill duration comes from the nominal flow equation and revealed milk volume. Position transitions are instantaneous, as in the previous search space. Durations round to 60 Hz ticks. Hidden milk parameters never alter the compiled schedule. There are no mid-pour model calls, sensor-driven corrections, adaptive top-ups or early stops. The simulator executes as fast as the CPU permits; the browser displays the completed cup. Rendering time does not determine the result.

The old step controller is disabled by default. Enable it only for comparison with `ENABLE_STEP_MODE=1` in the server environment, then use the revealed UI checkbox or `bun run bench --step --live ...`. Legacy step results are a different protocol and must not be pooled with plan runs.

## Calibration before agents or randomized benchmarks

The server and optimizer check the calibration manifest, parameter-space fingerprint, scorer sanity and an exact physical reference replay before allowing experiments. The supplied calibration is complete:

- Exact Heart, Tulip and Rosetta masks score 100%.
- Increasing translations and scale changes degrade overlap gradually; recorded curves are in [`tasks/calibration.json`](tasks/calibration.json).
- A **1,001-evaluation** CMA-ES search on **default milk only** found a feasible Heart plan with **14.3639% IoU, 100% precision, 240 ml, 61.1°C and 2 ml spilled**.
- The frozen operational pass requirements are **IoU ≥ 0.1292 and precision ≥ 0.90**, plus served, 190–240 ml, 55–65°C, ≤5 ml spills, unscorched and ≤120 simulated seconds.
- Thresholds are 90% of the reference IoU and precision, rounded down to four decimals. Precision prevents an all-white cup from passing the lower overlap threshold. These same thresholds are frozen for unseen shapes; they are not calibrated on held-out shape results.

**The reference is a weak visual pattern, not a convincing heart.** This existence proof establishes reachability of an operational simulator threshold, not realistic latte-art mastery. Do not compare these v0.3 pass rates with the old 55% threshold. The search curve is preserved in [`docs/calibration-search.json`](docs/calibration-search.json); the parameter vector is in the manifest and can be replayed without any API.

Recalibrate after changing the physical model, plan decoder or scoring rules:

```sh
bun run calibrate --evaluations 1001
```

Calibration records the candidate score curve and full reference evidence in `results/calibration-evidence.json`. The published calibration uses Heart, seed 42 and nominal milk. It is separate from all experimental attempt budgets and is not used to initialize the optimizer ablation.

## Inputs, reflection and memory

Before each attempt, the model receives the target mask/instruction/constraints, the shared plan schema, **starting milk volume and temperature**, and the selected memory. The full planning payload example is in [`docs/agent-input.json`](docs/agent-input.json). It receives no current foam observation, hidden flow/spread/mixing coefficients, raw history in notes mode, or simulator controls during execution.

After every attempt, a second model call receives the submitted plan, a compact trace summary, score breakdown (IoU, precision/recall, volume, temperature, spills and all serving checks), and the **96×96 final foam map**, quantized to density digits 0–9 for the prompt. Full-precision evidence is logged separately. This call writes a replacement note of at most 4,000 characters. Invalid notes are recorded; they do not replace the previous valid note. Rejected plans receive error feedback. All three model ablations get the same two-call opportunity, even when notes will be discarded:

| Ablation | Context on the next attempt |
| --- | --- |
| `no-notes` | Target and revealed milk only; generated notes discarded |
| `raw-history` | Target, milk and all prior plans, raw traces and feedback; notes discarded |
| `notes` | Target, milk and the model's latest replacement note; no raw history |
| `optimizer` | CMA-ES with the identical 21 bounds and fixed executor; one simulator evaluation per attempt |

Raw-history prompts deliberately grow without hidden truncation. A provider context-limit failure consumes the attempt and appears in the report. This ablation can be substantially more expensive. Gateway-side memory is not reset by any of these conditions.

## Milk schedule and full traces

Milk randomization is enabled only after calibration. [`tasks/environment.json`](tasks/environment.json) defines seeded volume, starting temperature, flow, foam retention/spread, mixing, texture, initial pitcher offset and surface motion. The same experiment seed and zero-based attempt index produce identical batches across every controller. The high seed bit is reserved for the milk-holdout namespace, so seeds with matching low 31 bits share physical schedules; use small, distinct seeds. Target seed is fixed at 42 by default, independently of milk seeds.

Every executed experimental attempt logs:

- The submitted normalized plan, decoded action schedule, task and environment snapshots and version fingerprints.
- Pitcher position, height, tilt, flow and cup volume at **60 Hz**.
- Full-precision **96×96 foam fields every 1 simulated second**, including time zero, plus the final field.
- Scores, constraint checks, model identities, token usage, per-call reported cost, notes before/after and errors.

Live evidence is saved under `results/experiments/<id>.json` after each attempt. The UI keeps recent metadata locally and exports full evidence for the current server experiment. Restarting the server ends resumable in-memory sessions; saved files remain. Stopping the UI prevents future attempts; an already dispatched attempt may finish and be billed. `results/` is Git-ignored.

## Matched experiments and reports

Run the local optimizer (no model/API calls):

```sh
bun run baseline --attempts 25 --seeds 42,43,44 --test-attempts 5 --heldout-shape tulip --output results/optimizer-plans.json
```

With the server running, execute each model ablation at the same budgets:

```sh
bun run bench --live --attempts 25 --seeds 42,43,44 --ablation no-notes --test-attempts 5 --heldout-shape tulip --output results/no-notes.json
bun run bench --live --attempts 25 --seeds 42,43,44 --ablation raw-history --test-attempts 5 --heldout-shape tulip --output results/raw-history.json
bun run bench --live --attempts 25 --seeds 42,43,44 --ablation notes --test-attempts 5 --heldout-shape tulip --output results/notes.json
bun run report results/optimizer-plans.json results/no-notes.json results/raw-history.json results/notes.json
```

Those model commands each allow **210 billed calls**: three seeds × (25 training + 5 milk holdout + 5 shape holdout) × two calls. No model calls occur without `--live`. `--default-milk` disables randomized conditions for a control experiment.

The optimizer uses pinned `cma==4.4.0` and `numpy==2.2.6` through uv. It receives one final objective per candidate: IoU minus one per failed non-shape serving constraint. There is no averaging over extra uncounted simulator runs. Its covariance updates after each population of eight candidates; incomplete final populations still count toward the budget. Frozen evaluation uses the best training vector. The initial vector is the same fixed generic prior for every seed, not the calibrated witness.

Each experiment explicitly separates:

1. **Training:** adaptive notes, raw history or optimizer state.
2. **Held-out milk:** same shape and target, disjoint milk seed namespace, frozen training notes/history/vector.
3. **Held-out shape:** unseen Tulip target, practice milk schedule, the same frozen training memory/vector. No held-out results are used to update memory or select a plan.

`results/report.html` and `results/report.json` contain score versus attempt, sample variance/standard deviation across seeds, sample counts, rejected/error counts, per-attempt and cumulative API cost, first passing attempt, and total cost to first pass. Training source costs are retained separately for holdouts. Missing provider prices remain **unknown**, never zero; first pass is **not reached** when no attempt passes. Optimizer API dollars are zero, but local compute is not free. Reports keep different protocols, shapes, budgets, spaces and returned model identities in separate groups. Error/rejected attempts score zero in these aggregate curves.

The checked local pilot includes 25 optimizer training attempts plus two five-attempt holdouts for each of seeds 42/43/44. No live model ablation results are claimed; the model pipeline is integration-tested with a local mock gateway. Three seeds are a development pilot, not a statistically validated learning claim.

## Verify

```sh
bun test
bun run build
bun run verify results/optimizer-plans.json
bun run verify --replay results/calibration-evidence.json
```

The verifier recomputes scores and checks plan/environment identity. `--replay` additionally compares the complete physical replay, including recorded path and foam snapshots. Old exports require their matching benchmark/scorer version. Tests cover malformed plans, exact schedules, no hidden-condition leakage, full trace cadence, rejection budgets, memory isolation, frozen holdouts, cost accounting, scorer sanity, reference reachability and the two-call API sequence.

## Physical scope

Rapier supplies rigid-body collisions. Milk uses ballistic droplets and a stylized 2D surface solver. It has no validated density-driven microfoam/crema layering, surface tension, drainage or rheology. Randomization measures robustness to this model's assumptions. Neither a passing plan nor a successful transfer experiment establishes real-world barista skill or model weight learning.
