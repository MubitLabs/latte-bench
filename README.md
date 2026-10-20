# Latte Bench

A small, interactive environment for evaluating how agents operate a coffee workstation and adapt from feedback. Vanilla JavaScript, Three.js, Rapier, and Bun. No React.

The scene is the environment. A model receives physical observations and a target, chooses bounded controls, and gets an evaluation of the resulting cup. The same controls are available to a person.

![Latte Bench workstation](preview.jpg)

## Run

```sh
bun install
bun run dev
```

Open http://127.0.0.1:3000. Use the task selector for **Heart**, **Tulip**, or **Rosetta**. The instruction below the scene shows the next preparation step. Drag on **Your cup** to aim; height controls mixing versus surface deposition, and tilt controls milk flow. **Serve & score** records the result. **Results** contains the episode history, cup images, scores, and exports.

Keyboard: `1` grind, `2` extract, `3` toggle steam, `4` pick up, `5` serve; `WASD` / arrows move; `Q/E` change height; hold `Space` to pour.

## Gateway configuration

Bun loads `.env` automatically. Copy `.env.example` only when creating a new configuration:

```dotenv
MUBIT_BASE_URL=https://api.mubit.ai/openai/v1/
MUBIT_API_KEY=your-key
MUBIT_MODEL=your-model-or-route-id
FRONTIER_MODEL=your-baseline-model
```

Keys are server-only, ignored by Git, and never served as static files. Optional `FRONTIER_BASE_URL` / `FRONTIER_API_KEY` use a separate endpoint; otherwise both routes use the Mubit gateway. Optional `MUBIT_EXTRA_BODY` forwards documented provider fields only on the Mubit route. The UI identifies when both routes use the same gateway and model. Restart Bun after editing credentials.

**Run benchmark** selects the route, episode count, protocol, and seed. Up to 32 model requests per episode may be billed. The UI offers 1, 3, or 5 episodes. A request error stops the batch. Taking manual control cancels pending browser work; an already accepted upstream call can still be billed.

## Task files

Each task is a versioned JSON file:

- [`tasks/heart.json`](tasks/heart.json): one centered heart.
- [`tasks/tulip.json`](tasks/tulip.json): three stacked lobes.
- [`tasks/rosetta.json`](tasks/rosetta.json): paired leaves around a stem.

A task specifies its instruction, target geometry, serving constraints, target-variation ranges, and decision/time limits. `src/benchmark.js` registers the files and rasterizes their primitives into a mask. Add a new JSON file and register it in `TASKS` to extend the suite. Increment a task's version when changing its geometry or constraints.

The seed deterministically translates, rotates, and scales the visible target. It does **not** seed the upstream language model. Each episode also samples a reproducible milk batch from [`tasks/environment.json`](tasks/environment.json). Independent and feedback runs share a batch schedule; holdout uses a separate seed namespace. Reset within an episode replays its batch. Volume (205–245 ml), starting temperature (14–22°C), initial pitcher offset, flow, deposition spread, foam retention, velocity damping, mixing, spatial texture and flow pulsation vary. These are stylized ranges, not measured milk properties. Full conditions are exported for reproduction; the model only receives observable state. Seeds whose low 31 bits match share a physical schedule; the high bit is reserved for the holdout namespace. The target fingerprint records the exact configuration and transform; it is an identity check, not a cryptographic integrity guarantee.

## Evaluation v0.2

The evaluator reads the **actual 96×96 foam field**, not a preset image, model-written score, or completion message. Foam density ≥ 0.25 is classified as visible foam. Shape match is fixed-orientation intersection-over-union (IoU) against the target mask. Empty and completely white cups are penalized by this metric.

A cup passes only when **all** of these are true:

- Shape IoU ≥ 0.55.
- Cup served, with 190–240 ml total volume.
- Milk at 55–65°C and never scorched in the final cup.
- At most 5 ml spilled from the final cup.
- Episode within its 120-second simulation-time budget.

The controller is capped at 32 decisions. Resetting the cup does not reset the episode time budget; discarded cups remain visible in the action trace, though preparation/shape checks concern the final cup. API waiting time is excluded: simulation time pauses during requests, and browser actions advance in fixed 1/60-second steps with a bounded final partial step. Reported model usage and optional USD `usage.cost` are recorded separately; prices are not inferred.

**These are provisional geometric targets and thresholds.** They are not calibrated to barista judgments, taste, or real milk physics. We have not established a passing physical reference policy for every shape. The bundled scripted controller is a smoke-test baseline, not a solution. Do not use these pass rates as a validated ranking of model intelligence.

## Measuring adaptation

| Protocol | Target | Prior episode information |
| --- | --- | --- |
| Independent baseline | Seeded target, identical within a batch | None; fresh episode context |
| Feedback practice | Same seeded target as baseline | Up to three prior scores, failed checks, and action sequences from this batch |
| Held-out target | Separate deterministic transform stream | None |

The model receives JSON, not screenshots. See the complete [input example](docs/agent-input.json), or open **Trace → Input preview** in the UI (after an API call this shows its last actual input). The model sees the target instruction, serving requirements, a 16×16 target mask, actual physical state, a 10×10 foam observation, recent within-episode actions, and the remaining decision/time budget. Each action advances 0.05–5 seconds, then returns a new observation; shorter pours enable closed-loop correction. Current `surfaceFoam` is a 10×10 density grid (0–9), while `targetFoam` is a 16×16 binary mask (0/1). Both use x to the right and z from back to front. `recentActions` pairs commands with state immediately after dispatch, before timed evolution; the top-level observation is the latest post-duration state. The server also supplies a system prompt describing controls and simulator rules. Hidden batch coefficients and the full 96×96 evaluator field are not sent. Feedback practice explicitly adds earlier episode evidence to the prompt; this measures **in-context adaptation**, not weight training. The server rejects feedback in independent and held-out modes.

Results plot only comparable episodes: same experiment, benchmark/environment version, milk split, task fingerprint, protocol, requested model, and returned model identity. v0.1 fixed-condition results are not comparable to v0.2 randomized conditions. Manual and scripted runs are excluded from learning curves. Raw episode scores and first-to-last deltas are observations, not statistical evidence of learning. For a defensible experiment, collect larger repeated baselines, compare feedback practice under matched conditions, and evaluate a frozen learned controller on held-out tasks/seeds with confidence intervals. The UI's three/five-episode runs are exploratory.

No training-status API, adapter identity signal, or adapter-creation threshold has been established for the configured gateway. Adapter status is **unverified**. No progress meter claims that model weights are being trained or owned adapters have been created. A changing response or returned model name alone is not proof of an adapter update. Gateway-side memory, routing, and weights are not reset or controlled by the independent protocol; a rigorous comparison requires a fixed backend policy as well.

## Headless runner and evidence verification

A local scripted smoke test makes no API calls:

```sh
bun run bench --task heart --episodes 3 --seed 42 --output results/baseline.json
bun run verify results/baseline.json
```

For real models, keep `bun run dev` running and explicitly add `--live`:

```sh
bun run bench --live --route mubit --task heart --episodes 5 --mode feedback --seed 42 --output results/practice.json
bun run bench --live --route frontier --task heart --episodes 5 --mode independent --seed 42 --output results/control.json
```

The runner accepts `--mode independent|feedback|holdout`, `--task heart|tulip|rosetta`, `--episodes 1..20`, and a 32-bit unsigned `--seed`. `--milk-split holdout` changes milk conditions independently of the target protocol, allowing exact comparison with optimizer milk holdouts. By default the `holdout` protocol changes both the target transform and milk split. CLI live runs use the same local server, prompts, action validation, physics, and evaluator as the browser. `--help` lists options. A scripted run does not simulate learning even when a protocol option is supplied; it is labeled scripted.

Exports include the environment configuration, task snapshot/fingerprint, protocol, benchmark and prompt versions, model IDs, usage, decisions, actions, observations, full foam field, and evaluation breakdown. `bun run verify <export.json>` recomputes each saved score and verdict from that evidence without API calls and rejects mismatched task definitions. It verifies scoring evidence, not the authenticity of the export or replay of a remote model. The last 30 browser episodes are stored locally; export if storage becomes full. `results/` is ignored by Git.

## Computer-use interface

The HTML buttons and sliders are accessible to a computer-use agent. The browser also exposes:

```js
coffeeWorkstation.observe();
coffeeWorkstation.task();
await coffeeWorkstation.act({ command: 'grind', duration: 2.2 });
coffeeWorkstation.evaluate();
coffeeWorkstation.capture();
coffeeWorkstation.exportTrace();
coffeeWorkstation.reset();
```

Controls are `grind`, `extract`, `steam`, `pickup`, `move`, `pour`, `stop`, `serve`, and `reset`. Optional numeric fields: `x,z ∈ [-1.4,1.4]`, height 10–220 mm, tilt 0–85°, duration 0.05–5 seconds. The UI and model controller use the same validation. The convenience browser bridge uses real-time manual control and is not the deterministic batch runner; use the API runner for timed benchmark episodes.

## Physics and validation

Rapier handles rigid-body gravity and collision response for the sugar cubes, counter, and kinematic tools. Tool proxies are simplified; the explicit rim constraint prevents the pitcher lip being lowered into an underfilled cup. Milk droplets follow ballistic trajectories and conserve volume across pitcher, airborne drops, cup, and spills. The circular surface uses semi-Lagrangian transport, pressure projection, and foam deposition. This is a real-time 2D surface approximation coupled to 3D droplets, not full 3D CFD or PhysX. Foam appearance comes from height-based deposition and heuristic outward transport. The solver has no explicit density-driven microfoam/crema layering, surface tension, bubble drainage or calibrated rheology. Randomization tests robustness to these heuristics; it does not validate the physical model. Switching rigid-body engines would not supply the missing milk physics. Claims are limited to control/adaptation within this environment. Real-pouring transfer would require a calibrated multiphase model and independent experimental validation.

```sh
bun test
bun run build
```

Tests cover physical invariants, control limits, repeat-run reset/cancellation, episode budgets, target determinism, evaluator edge cases, protocol isolation, model grouping, and the server adapter against a mock gateway. `dist/` is a static build for manual/scripted operation; live models require the Bun server.


## Optimizer baseline, first attempts, and transfer

Run a real full-covariance [CMA-ES implementation](https://cma-es.github.io/apidocs-pycma/cma.evolution_strategy.CMAEvolutionStrategy.html), installed with uv. This development-only Python runner drives the existing Bun simulator; nothing is added to the browser bundle, and it makes no model/API calls.

```sh
bun run baseline --task heart --candidates 49 --train-seeds 2 --test-seeds 5 --output results/optimizer-heart.json
bun run verify results/optimizer-heart.json
```

The search has 21 bounded parameters: initial fill, drawing tilt/height and six (x, z, duration) pours. Preparation and volume/flow feedback are hand-written priors. The policy receives the same observable physical fields as models, not latent batch coefficients or direct access to the foam solver. Both use 32 decisions / 120 simulated seconds. This restricted policy family is an early baseline, not an upper bound on optimizer performance. CMA-ES maximizes mean IoU minus one per failed non-shape serving constraint. It gets final scores from the evaluator, with two fixed training batches per candidate (common random numbers). Every simulator evaluation counts toward the training budget; 49 candidates × 2 batches = 98 episodes, not 49 episodes.

After search, the chosen vector is frozen. Evaluate the initial and optimized feedback policies, plus the optimized vector with feedback disabled, on five separate milk seeds. The target stays fixed for this robustness test. The open-loop run is an ablation, not an independently optimized rival. Reports include parameters, search curve, conditions, scores, decisions, simulated time, wall time and full holdout fields/traces for verification. API cost is zero; local compute cost is not priced. Five seeds and one optimizer seed are a pilot, not a statistically validated comparison.

The initial pilot (seed 42, five held-out milk batches per row) produced:

| Policy / task | Additional training episodes | Held-out mean shape IoU | Full passes |
| --- | ---: | ---: | ---: |
| Initial feedback policy / Heart | 0 | 7.60% | 0/5 |
| CMA-ES feedback policy / Heart | 98 | 9.82% | 0/5 |
| Same Heart vector, feedback disabled | 0 | 9.24% | 0/5 |
| Cold-start CMA-ES / Tulip | 34 | 10.28% | 0/5 |
| Heart-initialized CMA-ES / Tulip | 34 (+98 source episodes) | 10.80% | 0/5 |

The low scores are a calibration warning. They neither establish that the task is unsolvable nor that LLMs outperform search. The Heart run took about 43 seconds of local wall time; all runs made zero API calls. The open-loop Tulip ablations actually scored slightly higher than their feedback counterparts (11.14% cold / 11.64% warm), so this pilot does not establish a consistent feedback advantage either.

For transfer, retain a Heart-trained policy, then compare warm and cold starts on Tulip with the same *additional* budget:

```sh
bun run baseline --task tulip --candidates 17 --train-seeds 2 --test-seeds 5 --warm-start results/optimizer-heart.json --output results/tulip-warm.json
bun run baseline --task tulip --candidates 17 --train-seeds 2 --test-seeds 5 --output results/tulip-cold.json
```

Warm start reuses the parameter vector only; covariance is reinitialized. Source training cost is reported separately. Do not select the source vector by looking at target holdouts. [Recorded pilot results](docs/baseline-pilot.json) contain the measured first-attempt and holdout scores; complete evidence is reproducible with the commands above.

The live runner can likewise reuse prior model traces on a new shape. This is explicitly **in-context transfer**, with source task names attached:

```sh
bun run bench --live --task tulip --mode feedback --transfer-from results/heart-model.json --episodes 5 --output results/tulip-model-warm.json
bun run bench --live --task tulip --mode feedback --episodes 5 --output results/tulip-model-cold.json
```

Compare first attempts, score versus *environment episodes*, attempts to the first full pass (null if never achieved), holdout pass rate/shape overlap, tokens, API calls and reported cost. Keep target, milk schedules, observation/action budgets and model identity matched. Freeze any learned policy/memory before final holdouts. The existing fresh-context holdout protocol does not itself freeze gateway-side learning. A model need not win this benchmark; an optimizer matching or beating it is a valid finding. No matched randomized LLM comparison has been run in this pilot, and there is still no established passing physical reference policy for every task.
