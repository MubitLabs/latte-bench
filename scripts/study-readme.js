// Publish only verified aggregate results and repository-relative image links.
const summary=await Bun.file('docs/model-study/summary.json').json(),v=summary.verification;
const models=summary.completeModels,winner=models[0],best=summary.groups.find(g=>g.model===winner&&g.mode==='notes');
const slots=summary.groups.filter(g=>models.includes(g.model)).reduce((n,g)=>n+g.attempts,0);
const section=`<!-- MODEL-STUDY-START -->
## Model study · October 2026

![Latte Bench: paired notes and no-notes pass rates, best scores and costs](docs/model-study/benchmark-report.png)

**${models.length} model routes · ${slots} attempt slots · 3 matched milk seeds · 5 attempts per mode.** Each model plans a whole pour, sees the result afterwards, and either keeps its own compact notes or receives no history on the next attempt. All model requests use the configured Mubit gateway.

**Astra was the only route to pass: 5/15 attempts with notes versus 2/15 without.** Its mean best score was lower with notes (74.7 versus 78.7), because one seed performed poorly. Notes did not consistently help across models. This small study measures context adaptation under a fixed output budget; it does not establish model-weight learning or held-out transfer. Best-so-far scores can rise through repeated sampling alone.

![Five-attempt learning curves for every completed model; shaded variation across three seeds](docs/model-study/learning-curves.png)

Conservative usage estimate, including unresolved error reservations: **$${v.costUpperUSD.toFixed(2)} / $${v.capUSD}**. ${v.rejectedPlans} plans were rejected; these are marked separately from valid zero-scoring pours. GPT-5.5 Pro returned no valid plan: all 90 plan submissions exhausted the 4,096-token output allowance, including reasoning. Its conservative cost was $86.17. CMA-ES uses the same five-evaluation budget, before its first population update; its trace is reused from the unchanged v0.7 run and physically replayed.

[**Full report and all model scores →**](docs/model-study/README.md) · [Per-attempt CSV](docs/model-study/attempts.csv) · [Every passing cup](docs/model-study/passes.json) · [Replayable plans and foam maps](docs/model-study/evidence.json) · [Verification](docs/model-study/verification.json)

Recent means a model catalogue creation date on or after 21 April 2026, with snapshot aliases deduplicated. ${summary.excludedFromRanking.length} restricted or incomplete routes are listed separately in the report; access failures are not model scores. The underlying simulator is stylized, and numerical passes can have weak notches. Mean ± SD uses only three seeds.

Reproduce the published pours and charts without model calls:

\`\`\`sh
bun scripts/study-replay.js
uv run scripts/study-report.py
\`\`\`
<!-- MODEL-STUDY-END -->
`;
let readme=await Bun.file('README.md').text();
if(readme.includes('<!-- MODEL-STUDY-START -->'))readme=readme.replace(/<!-- MODEL-STUDY-START -->[\s\S]*?<!-- MODEL-STUDY-END -->\n?/,section);
else readme=readme.replace('## Run\n',section+'\n## Run\n');
readme=readme.replace('## Frozen two-model heart run (v0.7)','## Earlier two-model heart run (v0.7)');
await Bun.write('README.md',readme);console.log('README updated from verified summary.');
