# V1 readiness inspection — 2026-09-17

Inspected baseline: `798ddcf` on `armand-ratombotiana/v2`; clean working tree at
start. This preparation changes governance documents only. No fresh deployment
or external-user demonstration was performed.

## Findings supported by repository inspection

| Area | Evidence | V1 assessment |
| --- | --- | --- |
| Runtime | package.json, vite.config.ts, db/index.ts, .openai/hosting.json | TypeScript/Vinext/Workers/D1; no implemented FastAPI/PostgreSQL backend |
| Identity | app/chatgpt-auth.ts, build/local-workspace-plugin.ts, compose.yaml | Hosted identity integration and local development session exist; external pilot access unverified |
| URL intake | app/api/mission/route.ts: inspectWebsite and POST | Fetches HTML, extracts text, then synthesizes/simulates a mission; not isolated ingestion |
| Source storage | db/missions.ts: saveMission; db/evidence.ts: createEvidence | Passes body into content hashing; stored extracted facts contain title/source URL, not the cleaned body; US-001 persistence gap |
| Fetch security | lib/url-safety.ts; tests/edge-url-safety.test.ts | Redirect/literal checks and body cap exist; mapped IPv6 bypass is explicitly accepted by a test; DNS/egress guarantee unproven |
| Deadline | lib/url-safety.ts: fetchWithRedirectLimit | Timer cleared after headers before reader loop; stalled body can outlive timeout |
| Understanding/strategy | mission route; campaign planning modules | Structured synthesis and durable plans exist, but not verified against the new US-002/003 experience |
| Five posts | mission route content_queue schema and demoMission | Five cross-channel hooks/CTAs, not five complete X text posts |
| Review | content/action routes, action-decisions.ts | Existing approval infrastructure is useful; new post-version journey unverified |
| X OAuth/publishing | connector routes/catalog, CURRENT_STATE.md | Setup records are not OAuth. Resend is the implemented outbound adapter; X path absent |
| Analytics | mission signals, Resend/Stripe evidence | Existing email/payment evidence does not establish X metrics |
| UX/commercial | app/page.tsx, workspace-client.tsx | Landing/workspace exist; broad multichannel UI conflicts with the narrow target; waitlist not established by this inspection |
| Deployment | compose.yaml, README.md, worklog.md | Compose is loopback development; prior Sites project_not_found is historical evidence, not a freshly reproduced result |

## Baseline validation performed

Node: v22.23.2. Command:

```powershell
node node_modules/tsx/dist/cli.mjs --test tests/url-safety.test.ts tests/edge-url-safety.test.ts tests/product-spec.test.mjs
```

Result: 31 tests passed, zero failed. First sandbox execution could not spawn
test workers (EPERM); rerunning with the required execution permission succeeded.
The passing mapped-IPv6 test documents unsafe behavior; it is not evidence that
the destination policy is secure. The catalog test validates the preserved
84-story document structure, not implementation of those stories.

Documentation checks: local Markdown links resolved successfully across all nine
changed documents; `git diff --check` passed for tracked edits. The change is
limited to PRODUCT.md, BACKLOG.md, README.md, CURRENT_STATE.md, V1_GOVERNANCE.md,
V1_USER_STORIES.md, V1_READINESS.md, US-001_AGENT_CONTRACT.md and ADR-001.

No full build, full suite, live model request, X provider call, authenticated
browser journey or external-user validation was performed in this preparation.
Prior worklog assertions are retained as historical reports, not new results.

## Decision gates

1. Approve the US-001 contract and proposed runtime ADR, or require a revised
   architecture if production Docker Compose is mandatory immediately.
2. During US-001, establish enforceable network isolation and actual pilot-host
   access. Failure blocks completion and requires a bounded revised proposal.
3. Check X developer eligibility and official current integration requirements
   before relying on the 30-day publication target. Do not implement US-006 early.
4. Demonstrate US-001 before starting US-002. None is Complete today.
