# Cutting a release

Two artefacts, one build: the npm packages and the GitHub release the Homebrew formula points at.
`packaging/npm/build.ts` produces both from one `TARGETS` list and the root `package.json` version.

## Before the first one — three things that are not code

1. **The npm org.** The packages are `@snypd/darwin-arm64` and friends, and a scope is an organisation:
   `npm org ls snypd` currently answers *"Scope not found"*. Create it at
   <https://www.npmjs.com/org/create> (free for public packages). The bare name `snypd` is unpublished
   and available; the scoped ones need the org to exist first.
   *Alternative if you would rather not:* change the scope in `packaging/npm/build.ts`'s `TARGETS` and the
   matching map in `snypd/bin/snypd.js` — `packaging.test.ts` fails if the two disagree, which is the
   point of that test.
2. **A token CI can actually use.** Write access on `snypd` **and** `@snypd/*` is necessary and not
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
3. **Decide it.** The name is claimed permanently and a scoped unpublish window is 72 hours. `07`
   decision 69 keeps this with a person on purpose.

## The release

```
git tag v0.1.0 && git push origin v0.1.0
```

`release.yml` then: builds five platforms, `npm publish --dry-run`s each, publishes the platform packages
**before** the launcher (its pins are exact, so the other order leaves a window where `npm i snypd`
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
