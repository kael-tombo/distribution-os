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
