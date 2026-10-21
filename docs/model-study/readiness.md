# What latte/bench measures

latte/bench by mubit measures bounded open-loop planning and adaptation through saved textual feedback in a stylized simulator. It is an experimental evaluation harness, not yet a validated general-purpose model leaderboard or a real-world robotics benchmark.

## Control rate

Model latency does not affect a pour. The model returns one complete plan; the executor interpolates its six movement segments at 60 Hz with a fixed 1/60-second simulation step. Every controller receives the same 33-parameter space. Segment durations are rounded to simulation ticks.

This removes a model-response-frequency advantage, but not representation limits or numerical sensitivity. Six straight segments constrain the available trajectories. Changing segment count, update frequency, or observation cadence defines a different benchmark configuration. Timestep convergence and ranking stability across simulation rates have not been established. The legacy interactive mode must be reported separately.

The current task tests planning before action and feedback between attempts. It does not measure reaction speed, closed-loop control, or dynamic correction during a pour.

## Why the task is useful

The target and outcome are machine-readable, the control space is shared with numerical optimizers, and the environment is replayable. This lets us examine initial strategy, inference about hidden milk behavior, and whether a model's own notes affect subsequent plans. Parameter changes expose whether the controller preserves a trajectory, makes local adjustments, or replaces many controls at once.

A rising best-so-far curve can come from repeated sampling. Notes/no-notes comparisons are necessary, and parameter changes alone are not evidence of learning. Milk also changes between attempts; a score gain does not establish that a specific edit helped. A causal follow-up would replay old and new plans on the same milk conditions.

## Before using it as a public model-ranking benchmark

1. Validate the score against independent visual judgments and adversarial shapes. Some numerical passes are weak visual matches.
2. Add held-out milk and tasks, more independent seeds, repeated model samples, and confidence intervals. The published study has only three practice seeds and one shape.
3. Compare full optimizer learning curves. The current five-evaluation CMA-ES comparison ends before its first population update.
4. Audit sensitivity to segment count, timestep and output budget. Pro's failures reflect the fixed output-token allowance; equal output caps do not imply equal compute.
5. Package a configurable, versioned runner for new lab submissions, isolate credentials and jobs, record model snapshots and inference settings, and verify submissions automatically. The published study scripts are specific to the frozen experiment.
6. Control or disclose provider-side routing and memory. Client-side context isolation is verified; gateway internals are not independently observable.

Existing safeguards include bounded schemas, matched environment schedules, separate format-error accounting, replayable plans, frozen source identities, token/cost records and physical replay checks. These support internal comparisons now. The items above are required before stronger claims about general adaptation, transfer or reliable rankings.

## Parameter audit

[Open the offline explorer](parameter-audit.html) or download the [CSV](parameter-changes.csv). The HTML is self-contained; GitHub displays its source, so download and open it locally. Regenerate all parameter exports with `bun scripts/parameter-audit.js`, without model requests.

The audit reports every requested value in normalized and physical units, signed changes from the immediately preceding valid attempt, changed-control counts, mean absolute changes, outcome and score change. It keeps each model/mode/seed separate. First attempts, missing plans and comparisons across rejected slots have no delta. These are submitted control settings; the recorded execution trace remains the source for effective pitcher motion.
