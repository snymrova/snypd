# The tap

`brew install snymrova/tap/snypd` needs a second repository — `github.com/snymrova/homebrew-tap` — because
brew resolves `<user>/<tap>/<formula>` to `github.com/<user>/homebrew-<tap>`. This repo does not contain
it, and does not want to: a tap is a directory of formulae with its own release cadence, and vendoring it
here would mean a snypd release could only ever ship one formula.

`snypd.rb` is **generated**, never edited. The release workflow runs

```
bun packaging/npm/build.ts --out=dist/release --formula
```

which compiles every platform, tars each binary, hashes it, and writes `snypd.rb` naming the GitHub
release assets for that version. The file is attached to the release and uploaded as a workflow artefact.

## Once, to create the tap

```
gh repo create snymrova/homebrew-tap --public --description "Homebrew formulae for snypd"
git clone https://github.com/snymrova/homebrew-tap && mkdir -p homebrew-tap/Formula
cp packaging/homebrew/snypd.rb homebrew-tap/Formula/snypd.rb   # from the release artefact
cd homebrew-tap && git add -A && git commit -m "snypd 0.1.0" && git push
```

## Per release

Copy the generated `snypd.rb` into `Formula/` and push. Automating that push means a token with write
access to a second repo held in this one's secrets, which is a trust decision for a release that has an
audience, not for the first one.

## Why brew at all, when npm serves the same binary

The arrival npm does not serve: somebody at a terminal, on macOS, who has `brew` and may not have Node.
It installs the same tarball the GitHub release carries, so brew and npm are two doors onto one artefact —
`brew` gets the binary straight, with no launcher and no Node boot in front of it.
