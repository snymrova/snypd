---
title: How the route key is built
date: 2026-06-19
tags: [operations]
---

A route re-renders when its key changes, and the key is small.

```ts
const key = hash([
  contentHash,          // the source file
  themeHash,            // every file in the theme chain
  configHash,           // the merged config, provenance stripped
  termList,             // only while a transform reads terms
]);
```

Four inputs, and the fourth is conditional: a site with no transform that reads the term list does not pay for the term list. That conditional is what keeps an incremental build at thirteen milliseconds.
