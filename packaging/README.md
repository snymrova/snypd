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
2. **A token.** A granular access token on npmjs.com with **write** on `snypd` and `@snypd/*`, then
   `gh secret set NPM_TOKEN`. (Once the packages exist, npm's trusted publishing can replace it and the
   secret can be deleted.)
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
