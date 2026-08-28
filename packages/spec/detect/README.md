# Detectors — how snypd recognises a primitive in prose someone already wrote

One YAML per primitive, read by `content.suggest_blocks` (`@snypd/core/suggest`). Deliberately **not**
part of `snypd://spec/primitives/*`: an agent reading the vocabulary needs to know how to *write* a
chart, not how snypd *spots* one, and every token in the primitive YAMLs is paid by every agent on
every session (`tokens.learn`, gated at 4,800). Detectors are read by the tool, not by the reader.

A detector is scored, not matched:

```yaml
shape: table          # which candidate extractor in suggest.ts this reads (7 exist)
base: 0.35            # confidence when `require` holds and no signal fires
require:              # hard gates on the shape's facts — outside these, no candidate at all
  rows: [2, 12]       # a numeric fact as [min, max]
  labelColumn: true   # a boolean fact
signals:              # each fires at most once; weights add
  - { fact: numericColumns, equals: 1, weight: 0.25, because: … }
min: 0.55             # a candidate below this is never suggested
```

`because` is the sentence the agent is shown for that suggestion, so it is written for a reader:
say why the shape means the primitive, not what the regex matched.

Operators: `equals` `atLeast` `atMost` `matches` (regex, on a string fact) `isTrue` `isFalse` `oneOf`.
Facts are whatever the shape publishes. `snypd bench suggest --facts [--shape=table]` prints the key
list per shape and every candidate in a corpus, so a detector can be written without reading `suggest.ts`.

**Adding a primitive:** if it fits one of the seven shapes, this directory is the only code you write.
If it needs a new shape, add one extractor to `suggest.ts` and a rewriter beside it.
