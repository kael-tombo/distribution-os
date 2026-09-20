# US-001 Agent Contract

Status: IMPLEMENTED / RELEASE UNVERIFIED. Reviewed and continued 2026-09-17
against base commit `798ddcf7f2ca8449180d1ebae8d0dd96e4e1eec5` plus uncommitted
working-tree changes. Architecture: [proposed ADR](adr/ADR-001-v1-runtime.md).
The owner's "review and continue" instruction authorizes continuation of the
existing bounded implementation. No architecture migration or external release
is claimed. The evidence record below supersedes the preparation-only status.

## Mission

US-001 only: as a founder, submit one public product URL, retrieve and clean its
main content, then review the durably stored source after refreshing.

## Expected outcome

From the existing authenticated workspace URL form, a founder submits a public
HTML page and can open its source evidence: title, submitted/final URL, cleaned
main text, retrieval time and any extraction limitations. Reload reads saved
content without refetching the page. Source capture is clearly distinguished
from the existing mission's generated or simulated interpretation.

## Allowed files

Maximum ten paths, including tests and the evidence update:

1. `app/api/mission/route.ts` — use a defined extraction result and safe errors.
2. `lib/url-safety.ts` — bounded fetch and destination validation fixes.
3. `lib/product-extraction.ts` (new) — typed extraction envelope/main-text logic.
4. `db/missions.ts` — persist cleaned source/provenance in existing website
   evidence `extracted_facts_json`, with the existing tenant ownership boundary.
5. `app/workspace/evidence-panel.tsx` — escaped saved-source display and warnings.
6. `tests/url-safety.test.ts` — deadlines, bounds and redirect regression cases.
7. `tests/edge-url-safety.test.ts` — replace the known unsafe mapped-IP expectation.
8. `tests/product-extraction.test.ts` (new) — extraction, database round-trip and
   API boundary tests using deterministic fixtures and isolated storage.
9. `tests/rendered-html.test.mjs` — source panel/error/rendering regression cases.
10. `docs/US-001_AGENT_CONTRACT.md` — actual commands, demo evidence and limitations.

Budget: zero dependencies, zero migrations. Existing evidence JSON and APIs can
carry bounded source data; do not alter shared schema merely to store a text
field. Confirm projection/export/deletion behavior before using that field. If
another file or storage change is required, stop and propose a revised contract.
Browser/API demonstration can run with existing tools without adding a package.

## Forbidden files

All paths not explicitly allowed, especially authentication, billing, connectors,
publishing, campaign planning, package manifests/lockfile, schema/migrations,
Docker/hosting configuration, secrets and the generated DOS-* story catalog.
Do not rewrite legacy synthesis, create X drafts or implement US-002 incidentally.

## Acceptance criteria

1. Server derives workspace ownership from authentication. Anonymous writes get
   401; foreign workspace source data cannot be read or changed. Input cannot
   select ownership or inject records. Invalid input has an actionable safe error.
2. Only public HTTP(S) HTML is accepted. Reject credentials, private/reserved
   destinations, normalized IPv4-mapped IPv6 bypasses and unsafe redirects.
   Enforce a ten-second total fetch/body deadline, at most five redirects and
   a 120,000-byte response limit. Each redirect repeats the destination check.
3. Establish deployment-level DNS/private-network protection, including rebinding;
   a hostname string check or separate DNS preflight alone does not satisfy this.
   If runtime egress cannot be proven safe, block external release and revise the
   architecture rather than asserting SSRF protection.
4. Extract readable main content, remove scripts/styles/navigation noise where
   identifiable, decode entities and preserve meaningful text order. Prefer
   main/article content; label a fallback. Empty pages, unsupported content and
   JavaScript-only shells produce a useful limitation/error, not invented text.
5. Save cleaned text (bounded to 8,000 UTF-8 bytes), title, original/final URL,
   content hash, extraction version/time and truncation/fallback warnings.
   The saved record must contain the text, not only its hash. A reopened evidence
   panel reads exactly the saved version; render it as text, never executable HTML.
6. Return a validated URL-module envelope with status, confidence, result,
   assumptions, sources, warnings and next_action. Keep the existing outer
   mission API compatible. Extraction confidence describes coverage, not truth.
7. Handle timeout, oversized/truncated input, fetch errors, non-HTML, parsing and
   persistence failures. Failed persistence never displays saved success.
   Unexpected internals, credentials and sensitive URL query values are redacted.
8. Record request ID, safe origin, workspace, duration, outcome and error code;
   record a durable source-capture audit event on successful persistence. Do not
   log body text, cookies, tokens or query secrets. Verify request-size and resource
   bounds; if existing abuse controls are inadequate for external access, pause
   for a scoped contract revision before release.
9. Existing URL submit/loading/error/retry remains usable. The source view has
   accessible labels, keyboard operation and readable mobile layout. Refresh
   preserves source data; repeat submission cannot be mistaken for an old result.
10. Relevant tests pass and a deployed authenticated test URL is usable by an
    external tester, with a real URL → saved source → refresh demonstration and
    recorded limitations. Local-only evidence is insufficient for Complete.

## Out of scope

Product interpretation, new strategy/content generation, X integration,
publishing, analytics, crawling multiple pages, browser-rendered extraction,
voice, queues, new auth, payment changes, redesign and framework migration.

## Smallest implementation and assumptions

Repair the existing URL-to-mission path, reuse its website evidence record, and
make stored source reviewable. The current mission route still performs legacy
synthesis after extraction; this contract does not refactor that flow. With no
model key its existing simulation remains explicitly labelled, while the fetched
source is a real observation. A configured model failure may still fail mission
creation; display that failure honestly. If independent intake is required before
any model request, revise this contract rather than creating a second workflow.

Assume a public server-rendered HTML page within the stated bounds, existing
workspace identity and approved runtime retention. External-user authentication
and deployment are unproven prerequisites. Do not expose local operator sessions.

## Required tests

- Unit: main/fallback extraction, entities, unsafe markup, empty/non-HTML content,
  multibyte limits, warning/envelope validation and page prompt injection.
- Fetch/security: blocked destinations including normalized mapped IPv6, redirect
  loops/private redirects, slow headers AND slow body, oversized/chunked responses,
  total deadline, cancellation and safe error redaction. Verify real egress policy.
- Integration: migrated isolated SQLite/D1 source text/hash round-trip, tenant
  separation, save failure/compensation, audit, export/deletion compatibility.
- API: authenticated success, 401, invalid/oversized input, upstream failures,
  durable reload and safe errors; mock outbound fetch without weakening production
  destination checks. Test the route, not only helper mirrors.
- UI/E2E: submit real public URL, open source, refresh/reopen, inspect loading and
  failure recovery; keyboard and mobile checks. Keep fixture and live evidence separate.
- Regression: typecheck, lint, build and existing suite through project scripts.

## Required evidence

Record source SHA, environment/test URL, timestamp, commands and outcomes here.
Include persisted source proof after reload, screenshot/recording of the journey,
negative-case results, audit entry/request ID, deployed version and external
tester access. A real external user's successful use is required for completion.

## Risks

The preparation baseline accepted an unsafe mapped-IP form, stopped the fetch
timer before reading the body, and hashed source text without storing it. Those
paths now have implementation and regression coverage. HTML extraction remains
heuristic; JavaScript-rendered sites may fail. Legacy synthesis remains coupled
to intake. Actual DNS/private-network isolation and external-user access remain
unverified. Any necessary auth/egress/hosting expansion requires a revised
contract; do not silently exceed the ten-file budget.

## Approval and evidence record

### Review and continuation, 2026-09-17 (Africa/Nairobi)

The inherited working tree already contained the nine implementation/test paths
listed above. This continuation repaired that work within the same contract;
this document is the tenth path. Earlier governance documents are retained as
the preparation record. No dependencies, migrations, credentials, hosting
configuration or unrelated feature paths changed in this continuation.

Review findings resolved:

- The new integration test was missing a closing brace and used an incorrect
  deletion confirmation; it now exercises the actual routes and migrated SQL.
- Page titles up to the extractor's 300-character limit broke the legacy
  200-character simulation name. Simulation now bounds its name while preserving
  the captured title.
- Upstream source validation errors were incorrectly reported as invalid user
  requests. Input and source validation now have separate safe error codes.
- Headers inside main/article regions were removed, discarding product promises.
  They are retained while navigation is removed.
- Truncating UTF-8 mid-codepoint could introduce a replacement character beyond
  the selected bytes. Partial trailing codepoints are now omitted.
- Compressed IPv6 special-purpose addresses could bypass the transition-range
  filter. Numeric prefix checks now include the compressed forms.
- Mission events and agent telemetry stored full URL queries/fragments. These
  records now use the origin; tenant-scoped source evidence retains exact URLs.
- Compensation now removes capture audit and mission records in one database
  batch, with a regression that fails a later artifact write.

Local proof uses deterministic HTTP fixtures, actual mission/export/deletion
handlers and repositories, all existing migrations, and isolated in-memory
SQLite implementing the D1 binding. It demonstrates persisted source text and
hash after a separate authenticated GET, tenant separation, durable capture
audit, export/deletion compatibility, failure compensation and safe errors.
Rendering checks demonstrate escaped source text, warning/provenance disclosure
and native disclosure controls. These are not browser interaction, mobile or
external-user tests, nor a real Cloudflare D1 deployment.

Final local validation (2026-09-17, Windows, Node v22.23.2):

| Command | Result |
| --- | --- |
| `npm.cmd run typecheck` | Passed; also rerun after the final IPv6 change |
| `npm.cmd run verify` | Typecheck, lint and production build passed; full test suite failed on 11 pre-existing execution tests |
| `node --import tsx --test --test-reporter=tap tests/product-extraction.test.ts tests/url-safety.test.ts tests/edge-url-safety.test.ts tests/rendered-html.test.mjs` | Final source-capture regression run: 55 passed, 0 failed |
| Base-commit reproduction of `tests/action-decisions.test.ts tests/confirmed-execution.test.ts tests/execution-recovery.test.ts` | 27 tests: 16 passed, the same 11 failed |
| `git diff --check` | Passed |

The 11 failures comprise three assertions expecting `false` where execution
claims return `null`, one confirmed-execution spend assertion, and seven recovery
fixtures missing the `db/action-execution-claims` dependency. They reproduce from
an isolated `git archive HEAD` copy of the unchanged base. Their source files
are outside this story's permitted scope and were not modified; the full suite
must not be described as green. Address these in a separately bounded regression
repair before release.

Logs: `.verification-review.log`, `.sites-runtime/us001-focused-tests.log` and
`.sites-runtime/us001-baseline-tests.log` (ignored local verification artifacts).
The initial sandbox run was blocked by Windows child-process permissions;
approved unsandboxed test runs produced the results above. No test credentials,
real model requests or external publications were used.

Source identity: base SHA above plus the nine allowed implementation/test files.
Their sorted path/content SHA-256 is
`1ac21f8981de16d70678c6e63f2774313cb413cebcc11cd5a13428aa7e9dca3d`:
hash each sorted relative UTF-8 path, a NUL, its raw file bytes, and a NUL,
excluding this evidence document. Changes remain uncommitted.

### Release gate and next bounded work

Sites `get_site` now succeeds for the existing project and reports owner-only
access, with one allowed account and zero external visitors. This supersedes the
historical `project_not_found` report; it does not establish pilot access or
validate the deployed application's behavior. No version was saved or deployed
during this continuation, and no external tester was invited.

URL literal/redirect checks do not constrain the IP ultimately selected by DNS.
The inspected [Cloudflare runtime documentation](https://developers.cloudflare.com/workers/platform/known-issues/#fetch-api-in-cname-setup)
describes Cloudflare DNS resolution, but does not establish this deployment's
private-network/rebinding boundary. The current local runtime likewise has no
proven connection-level policy. Acceptance criteria 3 and 10 remain unmet;
US-001 is not Complete and US-002 must not start.

Next, verify the actual runtime egress guarantee and exercise it with controlled
DNS/redirect/rebinding cases. If it cannot be established, propose a separate
bounded egress/hosting contract (including permitted configuration paths and
deployment tests) before introducing infrastructure. After that gate, perform
the authenticated real-URL capture, refresh/reopen, keyboard/mobile and external
tester demonstration. Broader architectural approval remains a separate decision.

### Supporting Docker regression repair completed, 2026-09-17

The separately bounded [Docker review](DOCKER_REVIEW_CONTRACT.md) now supersedes
the earlier full-suite failure status. Its three fixture/assertion repairs were
reviewed against production submission and spending contracts. Final isolated
Docker verification passed typecheck, lint, the production Worker build and all
1,934 test entries. Source-capture code was unchanged during this supporting task.

The local app is healthy at `http://localhost:5173`, runs as UID 1000, and binds
only loopback. Strengthened HTTP smoke checks verify anonymous rejection,
complete forged-identity rejection, correct identity with a valid session,
cross-origin write rejection and persisted workspace/session fingerprints after
container recreation. Optional Wrangler usage telemetry is disabled in Docker
after a delayed startup was observed. Commands, image/source identities and
limitations are recorded in the linked contract; no volume was deleted.

This clears the regression-repair prerequisite, not acceptance criteria 3 or 10.
DNS/rebinding controls, the deployed real-URL capture/reload journey, keyboard
and mobile interaction, and external-user access remain unverified. No hosted
deployment was performed and US-002 has not started.

### Extraction review continuation, 2026-09-17

Mission: repair source loss found while reviewing the existing US-001 work.
Expected outcome: an empty main region does not hide a readable article/body,
and a page-level product header survives extraction while navigation is removed.
Allowed files for this continuation: `lib/product-extraction.ts`,
`tests/product-extraction.test.ts`, and this evidence document, all within the
existing story allowance. Forbidden files and exclusions remain as above; no
new dependencies, migrations, infrastructure or next-story implementation.

Acceptance: preserve meaningful text and provenance for these layouts; reject
empty shells; do not mistake hyphenated custom elements for standard HTML tags.
Required tests: reproduce the failures, run the focused source-capture tests,
then run typecheck, lint, build and the full suite in isolated Docker. Required
evidence: actual results and current hosting/access limitations below. Risk:
extraction remains heuristic and cannot render JavaScript or evaluate CSS.
