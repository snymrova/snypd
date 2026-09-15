---
title: Questions about plugins
date: 2026-04-20
tags: [agents]
---

The plugin contract is short, and the questions people ask about it are shorter.

### Does a plugin need code?

No. `changelog` is one manifest and nothing else: a type, a taxonomy, a URL pattern.

### Can a plugin add JavaScript to my page?

Only what it declares, and only within what the site affords under `bench.budgets.jsKb`. The build refuses a page that weighs more.

### What happens if I remove one?

Every byte it added is gone. The bench asserts a byte-identical site with each plugin on and then off.

### Where does a third-party plugin come from?

npm, as `snypd-plugin-<name>`, or the site's own `plugins/` directory. Both go through the same loader.
