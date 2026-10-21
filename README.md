# latte/bench

latte bench by mubit

A benchmark for model planning and adaptation in a simulated latte pour.

<!-- MODEL-STUDY-START -->
## Results

With notes: the model saves a summary of feedback for its next attempt. Without notes: it receives no past feedback.

![latte/bench by mubit: scores with and without notes](docs/model-study/benchmark-report.png)

Score is the mean best result after five attempts across three matched milk seeds. Notes help some models, but not all; these results do not establish learning or transfer.

[Full results →](docs/model-study/README.md) · [Methodology](docs/model-study/methodology.md) · [Scores CSV](docs/model-study/attempts.csv)
<!-- MODEL-STUDY-END -->

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

<details>
<summary>Earlier experiments</summary>

## Earlier two-model heart run (v0.7)

Freeze tag: `latte-bench-v0.7-heart-freeze`. The exact protocol is in [`experiments/heart-frozen-v3.json`](experiments/heart-frozen-v3.json). GPT-6 Astra and GPT-6.1 Sol each run five milk seeds (42–46) × ten attempts in no-notes and notes modes. CMA-ES gets the same five × ten evaluations once as a shared baseline. Total authorized cap is $50 across both models and every repair/reflection call. Four independent attempts may run concurrently; each pending call reserves its complete upper charge before dispatch.

No-notes planning receives only a fresh target, current volume/starting temperature and the complete parameter guide. Poisoned-history tests and runtime equality checks enforce this. Its reflection receives only the current attempt and is discarded. Requests have no conversation/session IDs, no memory SDK, and `store:false`; upstream gateway memory injection remains outside client observability.

Quality is now `100 × max(0, min(IoU, boundary F1) - 0.25 × mean raw density in hull(target)-target)`. There is no binary concavity veto. The heart quality floor equals its existing 78.26% IoU floor; the other gates are unchanged. Reviewed reference: **85.8%, pass**. Old oval seeds 42/46: **60.5% / 58.9%, fail**. The concavity term is continuous even though the target still has one concavity cell and the IoU/contour masks remain binary. No reference, target or physics was changed.

The runners require the tagged commit and an unchanged tracked checkout before starting, save source hashes, and refuse to overwrite existing run ledgers. After the run, read **http://127.0.0.1:3000/heart-frozen-v3/** or `results/heart-frozen-v3/report/report.html`. Reports include per-attempt pass rate, cumulative seed success, best-so-far mean ± sample SD, per-seed records, cost, and every numerical pass PNG. Results remain Git-ignored so the frozen source commit stays unchanged.

```sh
# Regenerate reports and verify saved results; no paid requests:
uv run scripts/frozen3-report.py
bun scripts/frozen3-verify.js
```

All earlier reports below are historical and require their matching scorer versions for replay. Do not pool their scores with v0.7. The v0.7 report does not establish held-out transfer or model-weight learning.

## Historical concavity frontier rerun (v0.6)

Current report: **http://127.0.0.1:3000/heart-pilot-v2/** and [`docs/heart-pilot-v2/report.html`](docs/heart-pilot-v2/report.html). The report states whether the run is complete. Frozen protocol: CMA-ES 5 × 300; GPT-6 Astra, seeds 42–44, 10 attempts per mode (`no-notes` and `notes`); $20 total cap. Tulip is dropped. The 33 physical bounds, simulator and milk schedules are unchanged.

Completed results: **0/1,500 CMA-ES passes, 0/30 Astra no-notes passes, 12/30 Astra notes passes**. Notes first passes: seed 42 at attempt 2 ($0.29699), seed 43 at attempt 1 ($0.17041), seed 44 at attempt 9 ($1.29545). All 60 agent attempts completed with zero format errors, repairs or rejections. Conservative total cost estimate: **$8.87569** across 120 calls; standard usage-detail estimate $8.87479. Every numeric pass was inspected and has its own PNG. Several images are only weakly heart-like despite passing; the new one-cell gate fixes the old oval regressions but does not establish visual quality or robust skill. No controller passed on its final matched attempt 10. Verification recomputes all 1,560 scores, physically replays all 60 agent attempts plus 10 selected optimizer pours, and checks all nine frozen source hashes and the cost ledger.

The target-agnostic concavity gate takes the convex hull of target foreground cell centres, rasterizes it at 32×32, and subtracts the target. At least 80% of those cells must remain below the 0.25 foam threshold. Score is 100 × min(IoU, boundary F1, concavity empty fraction). Targets without concavity pass this gate vacuously. **The current heart has only one concavity cell**, so its notch gate is binary and is not a robust recognisability test. Both old CMA passes (seed 42/eval 219 and seed 46/eval 270) now fail; the reviewed reference remains a pass at 87.0%. Existing heart IoU, boundary and precision thresholds stay fixed.

Strict output schemas enforce the plan and notes objects. Every parameter's physical meaning, units, bounds and normalization formula is included in the planning payload; see [`docs/heart-pilot-v2/agent-input.json`](docs/heart-pilot-v2/agent-input.json). Up to two format repairs happen before simulation and stay within the same attempt. Format errors and terminal rejections are separately logged; red X marks rejected plans in the pilot plots, while circles include valid zero scores. Only starting volume and temperature are revealed; flow, texture, spread and mixing remain hidden.

The live runner reserves every call before dispatch against $20, conservatively counting all input at Astra's $12.50/M cache-write rate and output, including reasoning, at $50/M. Both modes generate reflections; the control discards them. The report includes usage-based standard-pricing estimates alongside this conservative bound. Provider-side memory/routing is not independently controlled, and these are adaptation measurements, not proof of learned model weights.

```sh
# Recompute/verify saved evidence only; no model requests:
uv run scripts/pilot2-report.py
bun scripts/verify-pilot2.js
```

Every numerical pass has a target/result PNG and an explicit visual review. All 1,500 optimizer candidates and all agent traces/requests/responses/usage are retained under `results/heart-pilot-v2/` (Git-ignored); the source hash manifest checks that the scored code stayed frozen during the run. Do not run the paid runner again to regenerate reports.

## Historical capped heart pilot (v0.5)

The archived pilot report is at **http://127.0.0.1:3000/heart-pilot/** and [`docs/heart-pilot/report.html`](docs/heart-pilot/report.html). The simulator, 33-parameter plan and v0.5 scorer were frozen.

- CMA-ES: five randomized milk seeds (42–46), 300 evaluations each, generic initialization. First numerical passes: seed 42 at 219 and seed 46 at 270; the other three did not pass. No pass below 30. The two passing images lack a clear heart notch: the scorer still admits visually weak shapes.
- Agent: configured `gpt-4.1-mini` (returned `gpt-4.1-mini-2025-04-14`), seeds 42–44, ten attempts per seed in no-notes and notes modes. All 60 attempts completed, 120 provider calls. No passes; 25 rejected plans. Interface compliance is a major confound.
- Conservative cost at user-confirmed standard rates: **$0.1314928**, under the $20 cap. Applying published cached-input pricing estimates **$0.1260016**. The gateway returned token counts, not dollar costs; these are estimates, not invoices. Both modes used one plan and one reflection call per attempt; no-notes discarded its reflections.
- At the matched ten-attempt budget on seeds 42–44, every controller had zero passes. CMA-ES had higher best scores. This does not establish a learning advantage for either agent mode.
- Separated-layer tulip remains unproven in the current simulator; no target or physics changes were made.

Full plans, observations, traces, provider usage and a persistent cost ledger are saved under `results/heart-pilot/` (Git-ignored). Portable metrics and PNGs are in `docs/heart-pilot/`. Source hashes verify the frozen simulation, scorer, calibration and runner code. The live runner refuses automatic reruns when its ledger exists, and reserves a token-cost upper bound before each dispatch. Unknown billing or provider errors stop the run without paid retries.

```sh
# Historical verification requires the matching v0.5 source; no paid calls:
bun scripts/verify-pilot.js
bun run verify --replay results/heart-pilot/agents.json
uv run scripts/pilot-report.py
```

## Historical shape audit (v0.5)

Open **http://127.0.0.1:3000/shape-audit/** or [`docs/shape-audit/report.html`](docs/shape-audit/report.html). This audit runs no paid models. It keeps the 33-parameter executor and physical simulator unchanged, adds a shared one-cell boundary F1 check, and scores 100 matched random plans plus three fixed naive plans per target on nominal milk.

Displayed quality is **100 × min(mask IoU, boundary F1)**. All three targets use the same four-connected outline and Euclidean one-cell tolerance. Foam precision and every serving constraint remain separate pass gates. Chamfer and Hausdorff distances are also logged.

| Pour | IoU | Boundary F1 | Verdict |
| --- | --- | --- | --- |
| Reviewed heart | 86.96% | 91.09% | Pass |
| Canonical teardrop → heart | 81.93% | 73.12% | Fails contour |
| Hand-written tulip | 86.24% | 94.76% | Pass for current fused target silhouette |
| Best tested rosetta candidate | 60.00% | 61.83% | Fails; calibration withheld |

The tulip target itself merges overlapping layers. Its passing reference does not establish separated-layer tulip art. None of 30 explicit rosetta recipes produced four leaf pairs and a thin stem; six linear segments and radial pool spreading merge the gaps. This is an observed limitation, not an impossibility proof. The 36 tulip and 30 rosetta design recipes are recorded in `docs/shape-audit/design-sweep.json`.

Heart thresholds: **IoU ≥78.26%, boundary F1 ≥81.98%, precision ≥85.34%**. Tulip: **IoU ≥77.61%, boundary F1 ≥85.28%, precision ≥82.94%**. Thresholds are 90% of accepted reference metrics, rounded down, subject to predeclared floors of 50% IoU / 80% boundary F1 / 80% precision. They were fixed before the random/naive controls. Rosetta has no calibrated threshold and is blocked before provider calls; its floors are diagnostic only. Calibration is per task, versioned to scorer and simulator, and replay-verified.

For both calibrated targets, **0/100 random and 0/3 naive plans pass**. The strongest naive heart reaches 86.6% of all shape requirements; the heart reference reaches 111.1%. Tulip's strongest naive reaches 59.2%, its reference 111.1%. Removing only the reviewed heart's final pull still passes: its lobes already formed. The fixed naive no-pull control is the generic circle pour. This benchmark scores output, not compliance with a prescribed technique.

```sh
bun run calibrate
bun scripts/shape-headroom.js
uv run scripts/render-shape-audit.py
bun scripts/calibration-evidence.js
bun run verify --replay results/shape-calibration-evidence.json
```

Calibration performs three reference replays, not another 1,000-candidate search. Full control plans, foam maps and reference traces are in `docs/shape-audit/headroom.json`; distributions are in `summary.json`. These are nominal-milk diagnostics, not randomized/held-out results or evidence of learning. Historical v0.3/v0.4 scores must not be pooled with v0.5.

## Diagnosis and corrected reference (v0.4)

Open **http://127.0.0.1:3000/diagnosis/** or [`docs/diagnosis/report.html`](docs/diagnosis/report.html) for the complete numerical audit, original and corrected PNGs, and parameter tables. No paid model ablations were run.

The old 14.36% pour was a few small spots. The scorer passed its self/translation/scale checks, and a directly injected heart retained 96.86% after 22.72 seconds. The bottleneck was deposition and control expressiveness: local saturation discarded foam rather than spreading it, source strength depended on resolution, and the old plan could neither lift per phase nor move continuously.

The corrected reference achieves **86.9565% IoU, 94.8276% precision, 230.8 ml, 60.7°C and zero spills**. It has two lobes, a notch and a narrowing front, though its point is blunt and slightly asymmetric. The simple four-phase circle-and-pull plan scores 81.93% but looks like a teardrop: IoU alone does not guarantee recognizable art. The reviewed reference explicitly builds the lobes. This remains a stylized simulation, not validated latte physics.

</details>

## One plan, one attempt

The model returns only `{"parameters": [33 numbers]}` in `[0,1]`, enforced by a strict JSON Schema and validated without clipping. A malformed or out-of-bounds submission receives its validation error and up to two format corrections within the same episode. These corrections do not consume extra simulator attempts but are billed and logged separately. After all three submissions fail, one rejected episode consumes the attempt. Provider failures also consume attempts. Both models and CMA-ES use [`src/plans.js`](src/plans.js), `pour-plan/2`.

| Coordinates | Meaning after linear decoding |
| --- | --- |
| 0 | Nominal pre-drawing cup volume, 100–200 ml (determines fill duration) |
| 1 | High-fill height, 100–220 mm |
| 2 | High-fill tilt, 45–85° |
| 3–7, 8–12, 13–17, 18–22, 23–27, 28–32 | Six endpoint segments, each with x ∈ [−0.8,0.8], z ∈ [−0.8,0.8], height ∈ [10,180] mm, tilt ∈ [0,85]°, duration ∈ [0.1,5] s |

Preparation and the nominal high fill are compiled before execution from the revealed milk volume/temperature. The fill is at the cup center; additional high-pour travel can use any endpoint segment. Position, height and tilt interpolate continuously at 60 Hz. Repeated endpoints hold steady. Tilt ≤25° produces no flow. The final segment can lift and pull through the center while reducing flow. Settle for 0.5 seconds, then serve. No observations, corrections, top-ups or model calls occur mid-pour. Execution runs at CPU speed.

The old step controller remains disabled unless `ENABLE_STEP_MODE=1`. Historical 21-parameter experiments and v0.3 reports require commit `ebe84b3`; their scores and thresholds must not be pooled with v0.4.

## Calibration before agents or randomized benchmarks

The foam state, target mask, agent input and evaluator all use **32×32** cells, defined once in [`src/grid.js`](src/grid.js). The scorer rejects other resolutions. PNGs use nearest-neighbor enlargement without smoothing. The surface now treats incoming foam as a bounded layer: overflow at a saturated cell fills the closest available surface capacity instead of being deleted. Deposition uses normalized area units; diffusion was not reduced. This layer is an approximation, not a solved foam/crema density interface.

The historical v0.4 diagnosis included a 1,001-candidate CMA-ES search and an IoU-only reference calibration. Its curve remains in `docs/calibration-search.json`, and its calibration manifest is archived in `docs/shape-audit/previous-calibration.json`. That search does not establish the new contour gate. The old Python calibration writer is disabled to prevent overwriting the per-task manifest. Use the current audit commands above.

## Inputs, reflection and memory

Before each attempt, the model receives the target mask/instruction/constraints, the shared plan schema, **starting milk volume and temperature**, and the selected memory. The full planning payload example is in [`docs/agent-input.json`](docs/agent-input.json). It receives no current foam observation, hidden flow/spread/mixing coefficients, raw history in notes mode, or simulator controls during execution.

After every attempt, a second model call receives the submitted plan, a compact trace summary, score breakdown (IoU, boundary F1/distances, precision/recall, volume, temperature, spills and all serving checks), and the **32×32 final foam map**, quantized to density digits 0–9 for the prompt. Full-precision evidence is logged separately. This call writes a replacement note of at most 4,000 characters. Invalid notes are recorded; they do not replace the previous valid note. Rejected plans receive error feedback. All three model ablations get the same two-call opportunity, even when notes will be discarded:

| Ablation | Context on the next attempt |
| --- | --- |
| `no-notes` | Target and revealed milk only; generated notes discarded |
| `raw-history` | Target, milk and all prior plans, raw traces and feedback; notes discarded |
| `notes` | Target, milk and the model's latest replacement note; no raw history |
| `optimizer` | CMA-ES with the identical 33 bounds and fixed executor; one simulator evaluation per attempt |

Raw-history prompts deliberately grow without hidden truncation. A provider context-limit failure consumes the attempt and appears in the report. This ablation can be substantially more expensive. Gateway-side memory is not reset by any of these conditions.

## Milk schedule and full traces

Milk randomization is enabled only after calibration. [`tasks/environment.json`](tasks/environment.json) defines seeded volume, starting temperature, flow, foam retention/spread, mixing, texture, initial pitcher offset and surface motion. The same experiment seed and zero-based attempt index produce identical batches across every controller. The high seed bit is reserved for the milk-holdout namespace, so seeds with matching low 31 bits share physical schedules; use small, distinct seeds. Target seed is fixed at 42 by default, independently of milk seeds.

Every executed experimental attempt logs:

- The submitted normalized plan, decoded action schedule, task and environment snapshots and version fingerprints.
- Pitcher position, height, tilt, flow and cup volume at **60 Hz**.
- Full-precision **32×32 foam fields every 1 simulated second**, including time zero, plus the final field.
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

Those general model commands are outside the capped pilot and can allow **up to 420 billed calls**: three seeds × (25 training + 5 milk holdout + 5 shape holdout) × (one plan, up to two format repairs, one reflection). No model calls occur without `--live`. `--default-milk` disables randomized conditions for a control experiment.

The optimizer uses pinned `cma==4.4.0` and `numpy==2.2.6` through uv. It receives one final objective per candidate: min(IoU, boundary F1, concavity empty fraction) minus one per failed non-shape serving constraint. There is no averaging over extra uncounted simulator runs. Its covariance updates after each population of eight candidates; incomplete final populations still count toward the budget. Frozen evaluation uses the best training vector. The initial vector is the same fixed generic prior for every seed, not the calibrated witness.

Each experiment explicitly separates:

1. **Training:** adaptive notes, raw history or optimizer state.
2. **Held-out milk:** same shape and target, disjoint milk seed namespace, frozen training notes/history/vector.
3. **Held-out shape:** unseen Tulip target, practice milk schedule, the same frozen training memory/vector. No held-out results are used to update memory or select a plan.

`results/report.html` and `results/report.json` contain score versus attempt, sample variance/standard deviation across seeds, sample counts, rejected/error counts, per-attempt and cumulative API cost, first passing attempt, and total cost to first pass. Training source costs are retained separately for holdouts. Missing provider prices remain **unknown**, never zero; first pass is **not reached** when no attempt passes. Optimizer API dollars are zero, but local compute is not free. Reports keep different protocols, shapes, budgets, spaces and returned model identities in separate groups. Error/rejected attempts score zero in these aggregate curves.

The 105-attempt optimizer pilot is historical v0.3 evidence. The v0.5 and v0.6 paid heart pilots have separate reports above; never pool their different scorer versions. Only heart is currently enabled. Tulip and rosetta calibration are paused, so the general holdout examples above require separately authorized future calibration before use.

## Verify

```sh
bun test
bun run build
bun run verify results/optimizer-plans.json
bun run verify --replay results/shape-calibration-evidence.json
```

The verifier recomputes scores and checks plan/environment identity. `--replay` additionally compares the complete physical replay, including recorded path and foam snapshots. Old exports require their matching benchmark/scorer version. Tests cover malformed plans, exact schedules, no hidden-condition leakage, full trace cadence, rejection budgets, memory isolation, frozen holdouts, cost accounting, scorer sanity, reference reachability and the two-call API sequence.

## Physical scope

Rapier supplies rigid-body collisions. Milk uses ballistic droplets and a stylized 2D surface solver. The bounded spreading layer has no validated density-driven microfoam/crema layering, surface tension, drainage or rheology. Randomization measures robustness to this model's assumptions. Neither a passing plan nor a successful transfer experiment establishes real-world barista skill or model weight learning.
