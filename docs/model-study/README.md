# latte/bench

latte bench by mubit

Can models improve a simulated latte pour using their own notes?

With notes: the model saves a summary of feedback for its next attempt. Without notes: it receives no past feedback. Neither mode changes model weights.

![Scores with and without notes](benchmark-report.png)

Score is the mean best result after five attempts across three matched milk seeds. It measures shape overlap, contour fit and concavity on a 0–100 scale.

Astra was the only model to pass: 5/15 pours with notes, 2/15 without. Its average best score was lower with notes because one seed performed poorly. Two passing pours were weak visual matches.

![Best score by attempt](learning-curves.png)

The CMA-ES comparison uses five evaluations, before its first population update. Pro returned no valid plan within the fixed output limit. These results measure performance with saved feedback, not established learning or transfer.

[Methodology and full results](methodology.md) · [Scores CSV](attempts.csv) · [Passing pours](passes.json) · [Replayable evidence](evidence.json)
