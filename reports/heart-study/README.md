# Heart study presentation

A dependency-free, presentation-only report using the workstation's paper, sage and ceramic palette. It reads the completed frozen v3 results, verification and actual foam surfaces. It makes no API or model calls and does not modify the tagged runner, scorer, thresholds or measurements.

Generate after the original frozen report and verification exist:

```sh
bun scripts/style-heart-report.js
```

Outputs the same standalone HTML to `results/report.html` (the workstation's Results link) and `results/heart-frozen-v3/report/report.html`. CSS, JavaScript, measurements and evidence PNGs are embedded. Google Fonts is optional; local fallbacks remain usable offline. The page includes a self-contained HTML download, JSON exports, interactive SVG curves, matched-seed results, filterable evidence cups and full visual reviews.

The original frozen report generator can still reproduce the original presentation. Run this renderer afterwards to apply this theme. No benchmark files need to change.
