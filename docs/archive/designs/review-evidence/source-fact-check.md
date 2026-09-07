# Content integrity check

Checked 2026-09-05 against the primary paper, separately from the two independent assessments.

The exported stress-test examples contain an especially relevant design failure: authoritative presentation without adequately supported content.

| Export evidence | Primary-source check | Design implication |
|---|---|---|
| Screens lines 521 and 572: “Footnote 4 concedes the regime where additive wins…” with locator `§3.2.1 · note 4`. | In the PDF, footnote 4 gives the independent, zero-mean, unit-variance assumption and derives the variance of a dot product. The performance comparison is in the surrounding section. | A locator resolving to a real passage does not establish that it supports the sentence. The design must distinguish source existence from evidential support. |
| Screens lines 522 and 573: “Table 3 reports wall-clock on identical hardware for both…” shown as partially arriving text. | Table 3 reports Transformer architecture variations, training steps, development perplexity, BLEU, and parameter counts. It is not the claimed additive-versus-dot-product timing comparison. | Streaming does not excuse an inaccurate exemplar in a trust-centered product. Replace this sample with a supported statement; define pending/unverified content behavior. |
| HTML and PDF footnote numbering differ. | The arXiv HTML rendition numbers the variance note as 1; the PDF numbers it as 4. | Preserve a canonical passage identifier and source-version metadata. The display locator must not be the only navigation identity. |

Sources: [paper HTML, §3.2.1 and Table 3](https://arxiv.org/html/1706.03762v7), [paper PDF, printed pages 4 and 9](https://arxiv.org/pdf/1706.03762).

This is a targeted check of two AI specimen statements and locator stability, not a scientific peer review of every illustrative human thesis. Human claims may be wrong in a tool designed to help users revise them; the interface should preserve their status, evidence, and subsequent revisions.
