---
title: The five calls the runtime needs
date: 2026-03-20
tags: [operations]
---

The database sits behind an interface with five methods, and that is the whole of it.

```ts
export interface Database {
  run(sql: string, ...params: unknown[]): void;
  all<T>(sql: string, ...params: unknown[]): T[];
  get<T>(sql: string, ...params: unknown[]): T | undefined;
  transaction<T>(fn: () => T): T;
  close(): void;
}
```

Two implementations satisfy it. One wraps the Bun driver and one wraps the Node one. Nothing above this interface knows which it has, which is what let the whole engine move between runtimes in an afternoon rather than a quarter.

The temptation is always to expose one more thing. Prepared statements, for instance, are right there and would save an allocation. But every method here is a method both drivers have to agree on forever.
