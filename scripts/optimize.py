# /// script
# requires-python = ">=3.11"
# dependencies = ["cma==4.4.0", "numpy==2.2.6"]
# ///
"""CMA-ES search using the same Bun physics, action limits and evaluator as agents."""
import argparse
import json
import pathlib
import subprocess
import time

import cma

ROOT = pathlib.Path(__file__).resolve().parent.parent
INITIAL = [.5, .6, .2, .35, .4, .6, .65, .4, .6, .4, .55, .4, .6, .55, .4, .5, .65, .3, .5, .5, .4]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--task", choices=["heart", "tulip", "rosetta"], default="heart")
    parser.add_argument("--candidates", type=int, default=49, help="Total candidate vectors, including the initial policy")
    parser.add_argument("--train-seeds", type=int, default=2)
    parser.add_argument("--test-seeds", type=int, default=5)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", default="results/optimizer.json")
    parser.add_argument("--warm-start", help="Prior report: reuse its best vector, with fresh CMA covariance and budget")
    args = parser.parse_args()
    if not (1 <= args.candidates <= 10000 and 1 <= args.train_seeds <= 100 and 1 <= args.test_seeds <= 100 and 0 <= args.seed <= 0xffffffff):
        parser.error("Invalid budget or seed")
    initial = INITIAL
    source = None
    if args.warm_start:
        source = json.loads(pathlib.Path(args.warm_start).read_text())
        if source.get("schema") != "latte-bench/0.2" or source.get("policyVersion") != "six-pour/1":
            parser.error("Warm start requires matching benchmark and policy versions")
        initial = source["bestParameters"]
    worker = subprocess.Popen(["bun", "scripts/optimizer-worker.js"], cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    attempts, curve = [], []
    started = time.monotonic()
    best = None

    def evaluate(parameters, split, evidence=False, closed_loop=True):
        rows = []
        count = args.train_seeds if split == "practice" else args.test_seeds
        for index in range(count):
            request = dict(parameters=[float(x) for x in parameters], taskId=args.task, seed=args.seed,
                           index=index, split=split, evidence=evidence, closedLoop=closed_loop)
            worker.stdin.write(json.dumps(request) + "\n")
            worker.stdin.flush()
            line = worker.stdout.readline()
            if not line:
                raise RuntimeError("Bun evaluator exited unexpectedly")
            result = json.loads(line)
            if "error" in result:
                raise RuntimeError(result["error"])
            result["number"] = len(attempts) + 1 if evidence else None
            rows.append(result)
            if evidence:
                attempts.append(result)
        return rows

    def train(parameters):
        nonlocal best
        rows = evaluate(parameters, "practice")
        objective = sum(row["objective"] for row in rows) / len(rows)
        entry = dict(candidate=len(curve) + 1, environmentEpisodes=(len(curve) + 1) * args.train_seeds,
                     objective=objective, meanShape=sum(row["evaluation"]["score"] for row in rows) / len(rows),
                     passRate=sum(row["evaluation"]["passed"] for row in rows) / len(rows),
                     parameters=[float(x) for x in parameters],
                     conditions=[row["environment"] for row in rows],
                     evaluations=[row["evaluation"] for row in rows],
                     decisions=sum(len(row["decisions"]) for row in rows),
                     simulationSeconds=sum(row["observation"]["episodeSeconds"] for row in rows))
        curve.append(entry)
        if best is None or objective > best["objective"]:
            best = entry
        print(f"Candidate {entry['candidate']}/{args.candidates}: shape {entry['meanShape']:.1f}%, pass {entry['passRate']:.0%}; best objective {best['objective']:.3f}", flush=True)
        return -objective

    try:
        train(initial)
        es = cma.CMAEvolutionStrategy(initial, .18, {
            "bounds": [0, 1], "seed": args.seed or 1, "popsize": 8,
            "verbose": -9, "verb_log": 0,
        })
        while len(curve) < args.candidates:
            population = es.ask()
            remaining = args.candidates - len(curve)
            losses = [train(candidate) for candidate in population[:remaining]]
            if len(losses) == len(population):
                es.tell(population, losses)
        # All selections are finished BEFORE holdout observations are collected.
        reports = {}
        for label, vector, closed_loop in [
            ("initialClosedLoop", initial, True),
            ("optimizedClosedLoop", best["parameters"], True),
            ("optimizedOpenLoop", best["parameters"], False),
        ]:
            rows = evaluate(vector, "holdout", evidence=True, closed_loop=closed_loop)
            reports[label] = dict(meanShape=sum(r["evaluation"]["score"] for r in rows)/len(rows),
                                  passRate=sum(r["evaluation"]["passed"] for r in rows)/len(rows),
                                  scores=[r["evaluation"]["score"] for r in rows],
                                  failedChecks=[r["evaluation"]["failedChecks"] for r in rows],
                                  episodeNumbers=[r["number"] for r in rows])
        report = dict(schema="latte-bench/0.2", policyVersion="six-pour/1", optimizer="pycma/4.4.0 full-covariance CMA-ES",
                      task=args.task, seed=args.seed, trainingSeeds=args.train_seeds, heldoutSeeds=args.test_seeds,
                      sourceTask=source.get("task") if source else None,
                      sourceTrainingEpisodes=source.get("trainingEpisodes") if source else 0,
                      bestParameters=best["parameters"], trainingEpisodes=len(curve)*args.train_seeds,
                      evaluationEpisodes=len(attempts), apiCalls=0, apiCostUSD=0,
                      wallSeconds=round(time.monotonic()-started, 3), curve=curve, heldout=reports, attempts=attempts,
                      limitations=["Stylized simulation; no real-world skill claim.",
                                   "Milk holdouts vary conditions, not the target geometry.",
                                   "Open-loop is a frozen-vector ablation, not a separately optimized competitor.",
                                   "No matched LLM run in this report. Local compute is not free.",
                                   "Warm-start transfer requires a separate cold-start run with matched budget."])
        output = pathlib.Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(dict(heldout=reports, trainingEpisodes=report["trainingEpisodes"],
                              wallSeconds=report["wallSeconds"], output=str(output)), indent=2))
    finally:
        worker.stdin.close()
        worker.terminate()
        worker.wait()


if __name__ == "__main__":
    main()
