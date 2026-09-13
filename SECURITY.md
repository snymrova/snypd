# Security

## Reporting

**Do not open a public issue for a vulnerability.** Use GitHub's private reporting:
[**Report a vulnerability**](https://github.com/snymrova/snypd/security/advisories/new).

You should get an acknowledgement within 72 hours and a fix or a decision — with reasoning — within 14
days. If a report is not a vulnerability under the model below, you will be told why rather than ignored,
and if it is a real defect it becomes a normal issue with credit.

Scope: this repository and the published `@snypd/*` packages, including the five platform binaries.

## Supported versions

While the project is `0.x`, **only the latest published minor is supported**. Fixes go out as a new patch
release from CI with npm provenance; there are no backports.

| Version | Supported |
|---|---|
| latest `0.1.x` | ✅ |
| anything earlier | ❌ — upgrade |

## The trust model, said plainly

Overclaiming is the failure mode this file exists to prevent, so it states what is enforced and what is
not. This is the same position as [`docs/10` §4.7](docs/10-plugins-and-launch.md), in one place a reporter
will actually look.

### Not vulnerabilities — these are the documented design

- **A plugin runs your code with your privileges. There is no sandbox.** Enabling a plugin is installing a
  dependency, and you should vet it the same way. The manifest makes what a plugin *declared* inspectable
  (`snypd://plugins`, `site › doctor`); it does not constrain what the code does once loaded.
- **Raw HTML in a markdown file is rendered verbatim.** That is CommonMark behaviour and it is what lets
  you embed an iframe. Content files are trusted input — whoever can write to the repository can put
  anything on the site, exactly as with any static site generator.
- **The MCP server speaks stdio to a local process.** It has no listener, no port and no authentication
  because it is not a network service. Exposing it to a network is an operator decision, not a default.
- **The site index (`.snypd/`) is disposable.** Corrupting it degrades a build; it holds no secrets and
  rebuilds from the files in git, which are the truth.

### Vulnerabilities — please report these

- A way to get script or markup into a rendered page **without write access to the content repository** —
  an escaping bypass in the renderer, a directive that survives as markup, a frontmatter value that
  reaches an attribute unescaped.
- A `ctx.fetch` call from a plugin that reaches a host the manifest's `network:` list does not name.
- A path that writes **outside** the site's `dist/`, `content/` or `.snypd/` — a slug, a `ref`, an emit
  prefix or a media filename that traverses.
- A config or token value that changes the meaning of the emitted stylesheet or document beyond its own
  declaration — CSS or markup injection through `theme.tokens`, `theme.settings` or a plugin option.
- A plugin tool, prompt or resource that can shadow or impersonate a core one.
- Anything in the release path: the published binary not matching the tagged source, a provenance
  attestation that does not verify, a dependency substitution in the launcher's platform packages.
- Secrets or tokens reaching a build artefact, a log line, the `.md` twin or the JSON API.

## Hardening that is scheduled, not secret

Known gaps are tracked in the open rather than sat on. If your report matches one, it will be linked to
the existing issue and still credited.
