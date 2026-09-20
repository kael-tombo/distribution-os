# Private MVP release review — 2026-09-20

## Contract

Mission: review, stabilize and ship the existing working application under the
owner's instruction to "review and ship an stable MVP". This authorizes routine
release repairs and private deployment on the existing runtime. It does not
establish completion of the broader X-publishing product contract.

Expected outcome: a private release with durable source capture, explicit
simulation status, campaign checklists and preserved approval boundaries.

Allowed paths for this release repair (maximum ten): this document,
`.github/workflows/ci.yml`, `.openai/hosting.json`, `app/api/mission/route.ts`,
`tests/product-extraction.test.ts`, `app/page.tsx`, `app/layout.tsx`,
`tests/rendered-html.test.mjs`, `public/og.png`, `Dockerfile`.
Existing uncommitted source-capture, Docker and governance changes are reviewed
and retained as the release baseline; their earlier contracts remain historical.

Forbidden: secrets, dependency changes, schema migrations, public access changes,
external communications, provider publication, unrelated refactors.

Acceptance: typecheck, lint, production build and the complete TS/MJS suite pass;
local sign-in and source capture/reload work; hosting targets the verified owner-only
site; source and deployment identity are recorded; limitations remain explicit.

Required evidence: actual commands/results, source commit, private deployment URL
and status, local HTTP demonstration, known release gaps. No fixture or local
result is represented as external-user acceptance.

Risks: heuristic HTML extraction; external DNS/rebinding isolation is not proven;
X OAuth/publication/metrics are absent; AI/provider integrations need configuration.
No public pilot or US-001 Complete status is authorized by passing local checks.

## Findings and validation

- Baseline isolated Docker verification passed typecheck, lint, Worker build and
  the complete test runner before this release's repairs.
- CI omitted typecheck and MJS tests, and uploaded a nonexistent build directory.
- Hosting metadata referenced an inaccessible project. Discovery found the existing
  owner-only Distribution OS site, with one allowed account and no groups/visitors.
- Mission AI synthesis had no timeout, unlike the campaign planner/provider adapter.
- Landing copy did not clearly state that unconfigured synthesis uses simulation
  or that social publication is unavailable.
- The real Docker URL capture failed TLS verification in workerd while Node fetch
  succeeded. The slim runtime needs the system CA trust bundle used by workerd.

## Verified release checks

- `docker compose --profile test run --name distribution-os-release-20260920 --no-deps verify`
  exited 0: typecheck, lint, production Worker build, and all 1,940 test entries.
  Log: `.verification-release.log` (ignored local artifact).
- `docker compose exec -T app node scripts/docker-smoke.mjs record` passed:
  sign-in, D1 access, forged-header rejection and cross-origin write rejection.
- The new synthesis regression exercises a response-body timeout: HTTP 504,
  retryable structured error, no provider details leaked and no mission saved.
- `git diff --check` passed. The Sites helper packaged the verified Worker,
  static assets, hosting metadata and SQL migrations successfully.
- Real capture initially failed because `/etc/ssl/certs/ca-certificates.crt`
  was absent. Added Debian's `ca-certificates` package to the runtime image;
  the rebuilt runtime and capture are checked separately below.

Release source is the commit containing these repairs. The existing private
source branch is an ancestor of this branch; no force-push is needed. Access
remains owner-only. Deployment and final live-check results are recorded below
when available.

## Shipped private release

Source: `08b1ce724e51d9ed4776246a8531e17b1790b3f0`.
Private deployment succeeded at 2026-09-20 20:15 UTC:
https://distribution-os.razafimanantsoamarin.chatgpt.site

- Sites version: 3, `appgprj_6a9c84f0dfac8191a7780ca1d6975f2f~appgver_e741540fe5348191a1c231bb0428e23b`.
- Deployment: `appgdep_6ab03ea6239c8191b51beac29d4ff595`, status `succeeded`.
- GitHub release review: https://github.com/kael-tombo/distribution-os/pull/5.
- GitHub CI also passed typecheck, lint, build and the complete suite on the
  release source: run `35534852248`, duration 1m16s.
- With the CA bundle installed, authenticated local capture of
  `https://example.com/` passed. Mission
  `MISSION-0248ce97-26b9-4f9e-ac22-e787cb3596c7` retained 127 characters of real
  source text. An exact reload after restarting the container passed, with
  unchanged content hash `7accd734e486cb977d50b201b2688c54251dbe209280c76e1a1303d2586b4ee0`.
- Docker smoke `verify` passed after restart, including workspace/session
  persistence. The test also rejected private URL intake with HTTP 400.
- No live AI request, email, social post, payment or external invitation was sent.

## Remaining limitations

This is the existing private planning MVP, not completion of PRODUCT.md's
URL-to-X publication promise. X OAuth, publishing and metrics remain absent.
DNS/rebinding isolation and an external user's authenticated hosted capture
journey remain unverified; US-001 is not marked Complete. Local Docker remains
loopback-only. No interactive browser/mobile QA was performed in this release.

`npm audit --omit=dev` reported zero high/critical findings and one moderate
transitive finding in `baseline-browser-mapping@2.10.30`,
[GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv).
It is reached through Next/build tooling; searches found no matching module or
export names in the emitted Worker. That is an exposure assessment, not proof
that the dependency is vulnerability-free. A separate narrow lockfile update to
the patched 2.11.0 or newer remains recommended. The default branch's broader
GitHub alert count was not represented as this release's audit result.
