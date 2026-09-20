# Docker and regression review contract

Status: COMPLETE for local Docker and regression verification. Authorized by the owner's 2026-09-17 instructions
"proceed" and "review and continue, dockerize".

## Mission and expected outcome

Repair the 11 reproduced baseline test failures and provide a reproducible,
verified Docker workflow for the existing application. Preserve the US-001
source-capture implementation and retain the current Workers/D1 architecture.
An existing development image is not evidence of a production server deployment.

## Scope and allowed paths

This bounded supporting task permits at most ten paths:

1. `tests/action-decisions.test.ts`
2. `tests/confirmed-execution.test.ts`
3. `tests/execution-recovery.test.ts`
4. `Dockerfile`
5. `compose.yaml`
6. `README.md`
7. `scripts/docker-smoke.mjs`
8. `docs/DOCKER_REVIEW_CONTRACT.md`
9. `.dockerignore`, only if required by container verification
10. `docs/US-001_AGENT_CONTRACT.md`, for the final evidence update

Forbidden: application/authentication/publishing logic, migrations, dependencies,
credentials and hosted access changes. Any actual production-code defect found
must be documented and scoped before broadening this repair. No X development,
provider sends, destructive volume cleanup or architecture rewrite.

## Acceptance and tests

- Tests match the actual fenced-submission and ledger-based spend contracts,
  while retaining checks for ownership, expiry, rollback and duplicate sends.
- Typecheck, lint, production build and full regression suite pass in Docker.
- Docker startup applies migrations, runs as a non-root user, binds loopback,
  persists D1/session state and serves authenticated local requests.
- A repeatable smoke command checks health, unauthenticated rejection, local
  sign-in, identity-header stripping and authenticated API access. Existing
  data survives container restart; no provider credentials enter verification.
- Record exact commands, image/source identity, results and limitations here.

## Assumptions and risks

Unless the owner requests server deployment, finish local Docker development
and verification. A server deployment needs a separately defined production
identity/storage boundary. Do not expose development identity to external users.
Container networking alone does not establish the US-001 DNS/rebinding guarantee.
US-001 remains release-unverified until that guarantee and an external-user
demonstration are established. No dependencies or migrations are planned.

## Evidence

### Review and local validation, 2026-09-17

Base: `798ddcf7f2ca8449180d1ebae8d0dd96e4e1eec5` plus the inherited working
tree. The owner's latest "review and continue" resumes this supporting task.
Changes remain uncommitted. Windows host; Docker Desktop Linux containers;
Node v22.23.0 in both image targets.

The three test repairs were checked against the actual production contracts:

- Submission acquisition returns a fencing token or `null`, requires workspace
  settings, and records one submission. Tests retain tenant, expiry and duplicate
  submission assertions and now inspect the token's persisted ledger row.
- Confirmed receipt recovery reads spending from `execution_submissions` joined
  to successful attempts. A failed local evidence transaction must preserve
  provider spending; recovery must not add another submission or charge.
- Recovery fixtures now supply the imported lease/retry constants and connector
  functions; forbidden outbound/configuration calls still fail the fixture.

The smoke script's original forged-identity check supplied only a user ID. The
route also requires email, so rejection could pass even without header stripping.
It now supplies every identity header, checks cookie shape, and verifies that a
valid session plus forged headers still resolves to the session's own workspace.

Container recreation also exposed a variable delay after Wrangler printed
"No migrations to apply": one startup exceeded the five-minute readiness window.
The reviewed Wrangler code enables optional usage telemetry by default and keeps
pending network requests. Docker now sets `WRANGLER_SEND_METRICS=false`; this
removes that unnecessary network dependency. Startup timing is verified below,
without treating telemetry as the sole proven cause of the observed delay.

| Command | Result |
| --- | --- |
| `docker compose --profile test build verify app` | Both targets built |
| `docker compose --profile test run --rm --no-deps verify` | Exit 0: typecheck, lint, production Worker build and full regression suite passed; 1,934 passing dot-reporter entries |
| `docker compose up -d --no-build --wait --wait-timeout 300 app` | Initial app healthy; existing D1 reported no pending migrations |
| `docker compose exec -T app node scripts/docker-smoke.mjs record` | Initial authentication/API checks passed; workspace ID and session hash saved in the runtime volume |
| `docker compose --profile test build app verify` | Rebuilt both targets after strengthening smoke assertions and disabling optional telemetry |
| `docker compose --profile test run --rm --no-deps verify node node_modules/eslint/bin/eslint.js scripts/docker-smoke.mjs` | Final smoke script lint passed |
| `docker compose exec -T app id` | `uid=1000(node) gid=1000(node)` |
| `docker compose ps --format json` | Host publication is `127.0.0.1:5173`; two persistent named volumes |
| Final `docker compose up -d --no-build --wait --wait-timeout 300 app` | Exit 0; final image healthy within the readiness window |
| Final `docker compose --profile test run --rm --no-deps verify` | Exit 0; typecheck, lint, production build and all 1,934 test entries passed again |
| Final `docker compose exec -T app node scripts/docker-smoke.mjs verify` | Passed strengthened identity checks and preserved workspace/session fingerprints across container recreation |
| `git diff --check` | Passed |

Full verification logs: `.verification-docker.log` and
`.verification-docker-final.log` (ignored local artifacts).
PowerShell labels Docker progress on stderr as `NativeCommandError`; the captured
process exit was 0, and all verification stages completed. This is not a test
failure. The verification service uses `network_mode: none`, receives no provider
environment file and mounts neither app volume.

The initial full suite ran against verification image
`sha256:8135515fa5994fbe25e6c967dc2479a1376a110dcf03301d1a028e4a20b80d67`.
Final verification image (includes smoke and telemetry changes):
`sha256:5e142ec1e367e3d7762fd757aed9ef3fb22c947f5cb693471c768e3c66871287`.
Final app image:
`sha256:5a69648533830ec93cc585340f15919355bdb5c46c6cf2fafd5b573e6fbb8a19`.
Evidence documentation is updated after image creation.

Sorted path/content SHA-256 of Dockerfile, compose.yaml, scripts/docker-smoke.mjs
and the three repaired test files:
`b62d7a0ffe7e5226fffc7f8ebf28310a04b6a68b88557fc35b42ea7e425d0d31`.
Hash each sorted relative UTF-8 path, a NUL, its raw bytes and a NUL.

The app is left running at `http://localhost:5173`. No volume was deleted and no
campaign content was changed by the smoke checks. The initial local sign-in can
create an operator workspace when one does not already exist. Persistence proof
compares the database-generated workspace UUID and a SHA-256 of the session
cookie, not the raw credential; it does not claim a full campaign-data backup.

This continuation changed Dockerfile, README.md, scripts/docker-smoke.mjs and
the two contract evidence documents. The inherited Compose and regression-test
repairs were reviewed and verified without further edits. All changes stay
within this supporting task's ten-path allowance.

### Remaining release boundary

This is local Docker development and regression verification. It does not prove
production Docker portability, DNS/rebinding isolation, browser/mobile usability,
external-user access or a deployed real-URL capture journey. US-001 remains
implemented/release-unverified; US-002 has not started. No hosted deployment or
provider send is part of this supporting task.
