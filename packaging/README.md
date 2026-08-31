# Cutting a release

Two artefacts, one build: the npm packages and the GitHub release the Homebrew formula points at.
`packaging/npm/build.ts` produces both from one `TARGETS` list and the root `package.json` version.

## Before the first one — three things that are not code

1. **The npm org.** The packages are `@snypd/darwin-arm64` and friends, and a scope is an organisation:
   `npm org ls snypd` answered *"Scope not found"* before v0.1.0. Create it at
   <https://www.npmjs.com/org/create> (free for public packages). Everything this project publishes is
   inside that scope, the launcher included — the bare name `snypd` is *not* available, and S18h is the
   record of finding that out (see item 2).
   *Alternative if you would rather not:* change the scope in `packaging/npm/build.ts`'s `TARGETS` and the
   matching map in `cli/bin/snypd.js` — `packaging.test.ts` fails if the two disagree, which is the
   point of that test.
2. **A token CI can actually use.** Write access across `@snypd/*` is necessary and not
   sufficient: if the account requires 2FA for writes, the registry refuses a token that cannot answer an
   OTP, and a workflow cannot —

   > `E403 … Two-factor authentication or granular access token with bypass 2fa enabled is required`

   which is how v0.1.0's first attempt failed, on the first of six packages. Either a **classic
   Automation** token (that type exists for CI and bypasses 2FA by design) or a **granular** token with
   *bypass 2FA* enabled. Then `gh secret set NPM_TOKEN`. Once the packages exist, npm's trusted
   publishing can replace the token entirely and the secret can be deleted.

   The dry run cannot catch this: `npm publish --dry-run` never contacts the registry, so the token is
   first exercised by the real publish. That is why the publish step skips what is already there — a
   retry after a partial run is safe, and no version has to be burned to get past it.

   **And a scope is not a package.** v0.1.0's second attempt published all five platform packages from
   CI — run `33393069941` attempt 2, tag `v0.1.0`, commit `cae06c6`, each one carrying a SLSA provenance
   attestation naming exactly that run — and then failed on the sixth:

   > `E403 … You may not perform that action with these credentials` — `PUT https://registry.npmjs.org/snypd`

   That pair is the diagnosis, and it needs no further test: the same token, in the same run, wrote five
   packages **inside the scope** and was refused one **outside** it. A granular token scoped to
   `@snypd/*`, or to a list of packages that existed when it was minted, behaves exactly so — it cannot
   *create* a new top-level name, and the selector on npmjs.com cannot even offer one, because it lists
   only packages that already exist. Creating a new unscoped name needs **all packages** write access, or
   a classic Automation token.

   *(An earlier draft of this file said the five went up by hand and that CI had therefore never
   published anything. The attestations disprove it — read one with
   `curl -s https://registry.npmjs.org/-/npm/v1/attestations/@snypd%2flinux-x64@0.1.0`, decode
   `dsseEnvelope.payload`, and the `invocationId` names the run. Kept as a note because the wrong version
   made the token look more broken than it was, and the right one settles the question without a probe.)*

   **Then the name itself was refused, and that one is not a permission** (S18h). With an all-packages
   token the credentials gate passed — provenance signed, five packages correctly skipped as already
   present — and the registry answered:

   > `E403 … Package name too similar to existing package snyk; try renaming your package to`
   > `'@snymrova/snypd' and publishing with 'npm publish --access=public' instead`

   No token, no retry and no version bump gets past that; it is a registry-side name rule, and its
   documented remedy is a scope. So the launcher is **`@snypd/cli`**, and the `bin` map keeps the command
   it installs called `snypd` — see `07` decision 71. An appeal to npm support for the bare name is worth
   one email and is not worth blocking a release on: if it is ever granted, publishing `snypd` as a second
   name is a one-commit change and `@snypd/cli` stays the canonical one until then.

   **Two things the similarity rule is worth remembering for.** It fires only on a real `PUT`, so like the
   token it is invisible to `--dry-run`; and it is opaque, so a candidate name cannot be pre-cleared —
   each one costs an attempt.
3. **Decide it.** The name is claimed permanently and a scoped unpublish window is 72 hours. `07`
   decision 69 keeps this with a person on purpose.

## The release

```
git tag v0.1.1 && git push origin v0.1.1
```

`release.yml` then: builds five platforms, `npm publish --dry-run`s each, publishes the platform packages
**before** the launcher (its pins are exact, so the other order leaves a window where `npm i @snypd/cli`
resolves a launcher whose binary does not exist), attaches the tarballs and the generated formula to the
GitHub release, and signs every package with provenance from that workflow run's OIDC identity.

`workflow_dispatch` runs the same thing with `dry_run` defaulted **on** — use it to rehearse.

## Publishing by hand

Possible, and it costs the attestation: `--provenance` needs an OIDC identity, which only CI has.
Provenance is half of why `07` S18d′ chose npm over `curl | sh`, so this is the fallback, not the path.

```
bun packaging/npm/build.ts --out=dist/release --formula
cd dist/release/npm
for d in @snypd/*; do (cd "$d" && npm publish --access public); done
cd snypd && npm publish --access public
```

**Not** `npm publish` in the repo root: that is the workspace, `"private": true`, and it is not the
product — the product is generated into `dist/release/npm/` by the line above.

## After

The tap is a second repo and takes the formula the release just attached —
[`homebrew/README.md`](homebrew/README.md) has the three commands.
