// Publish only verified aggregate results and repository-relative image links.
const section=`<!-- MODEL-STUDY-START -->
## Results

With notes: the model saves a summary of feedback for its next attempt. Without notes: it receives no past feedback.

![latte/bench by mubit: scores with and without notes](docs/model-study/benchmark-report.png)

Score is the mean best result after five attempts across three matched milk seeds. Notes help some models, but not all; these results do not establish learning or transfer.

[Full results →](docs/model-study/README.md) · [Methodology](docs/model-study/methodology.md) · [Scores CSV](docs/model-study/attempts.csv)
<!-- MODEL-STUDY-END -->
`;
let readme=await Bun.file('README.md').text();
if(readme.includes('<!-- MODEL-STUDY-START -->'))readme=readme.replace(/<!-- MODEL-STUDY-START -->[\s\S]*?<!-- MODEL-STUDY-END -->\n?/,section);
else readme=readme.replace('## Run\n',section+'\n## Run\n');
readme=readme.replace('## Frozen two-model heart run (v0.7)','## Earlier two-model heart run (v0.7)');
await Bun.write('README.md',readme);console.log('README updated from verified summary.');
