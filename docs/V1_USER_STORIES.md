# Active V1 stories

Authority: [PRODUCT.md](../PRODUCT.md). US-* identifiers below are separate from
the preserved 84-story DOS-* catalog. No V1 story is marked complete from static
inspection. Every implementation requires its own contract and evidence.

## US-001 — Add a product

As a founder, I submit a public product URL so I can review its saved source
content. Retrieve, clean and persist the main text with provenance; render it
after refresh; handle invalid/blocked/unreachable URLs safely. Details and tests:
[selected contract](US-001_AGENT_CONTRACT.md). Status: awaiting approval.

## US-002 — Understand the product

As a founder, I review and correct the problem, audience, value proposition,
features, differentiation, CTA and uncertainties before generating content.
Acceptance: all seven fields persist, assertions cite the US-001 source version,
inferences are labelled, corrections survive refresh, invalid/failed model output
is recoverable without losing the source. Model fixtures do not prove live quality.
Evidence: real website, saved correction, reload, schema/provider-failure tests.
Depends on demonstrated US-001. Status: proposed.

## US-003 — Generate a strategy

As a founder, I receive one reviewable X strategy tied to my product.
Acceptance: objective, audience, angle, core message, frequency, exactly five
ideas and success indicators are saved with the reviewed understanding version;
unknown baselines remain unknown. No research claims without sources.
Evidence: a real strategy, revision linkage and malformed/provider-failure tests.
Depends on demonstrated US-002. Status: proposed.

## US-004 — Generate five posts

As a founder, I get five usable X text drafts.
Acceptance: exactly five distinct angles with hook, body, CTA, product link and
tone; current provider text/link constraints validated; quality findings block
unsupported claims from approval; content and provenance survive reload.
Evidence: five actual drafts from a real source, duplicate/claim/length tests,
human quality review. Depends on demonstrated US-003. Status: proposed.

## US-005 — Edit and approve

As a founder, I can edit, save, reject or approve each post.
Acceptance: immutable revision history, conflict handling for stale editors,
actor/time/hash on approval; an edit requires fresh approval; rejection cannot
publish. Evidence: edit/reload/approve/edit demonstration, concurrent update and
cross-workspace tests. Depends on demonstrated US-004. Status: proposed.

## US-006 — Connect X

As a founder, I connect my own X account securely.
Acceptance: documented current OAuth flow, callback/state validation, least
required permissions, encrypted tokens never returned to the browser or logs,
refresh/revocation/disconnect handling, correct tenant/account binding.
Evidence: real account connection and disconnect, tampered callback/tenant tests,
secret-redaction tests. Qualify access beforehand without implementing this story
early. Depends on demonstrated US-005. Status: proposed; provider access unknown.

## US-007 — Publish

As a founder, I explicitly publish one approved post revision.
Acceptance: server rechecks approval/hash/account, prevents concurrent duplicate
submission, records provider-confirmed ID/time/status/permalink and safe errors;
unknown outcomes require reconciliation, not blind resubmission. Provider
idempotency is not assumed. Evidence: one authorized real X post and matching
durable receipt, rejection/revocation/timeout/concurrency tests.
Depends on demonstrated US-006. Status: proposed.

## US-008 — Measure results

As a founder, I see publication history and the first available performance.
Acceptance: statuses, source, retrieval time and available impressions/clicks/
likes/replies (or other available metrics); denied/unavailable/stale metrics are
explicit, never fabricated zeros. Evidence: a real publication's fetched metrics,
reload, denied/rate-limited API tests. Depends on demonstrated US-007. Status: proposed.

## Supporting release stories

Authentication/workspace, onboarding and usable landing copy are prerequisites
within the first journey. Verify existing behavior during US-001; a blocker that
requires unrelated auth or hosting work pauses US-001 for a separately approved
contract instead of silently widening its file budget.

- **SUP-001 — Qualified waitlist:** founder submits interest from truthful landing
  copy and receives confirmation; persist consent, prevent abuse, handle failure.
  Separate bounded story before V1 release, after the eight core stories unless
  it blocks recruiting. Existing implementation is unverified.
- **VAL-001 — Unassisted pilot:** five consenting founders use the journey; record
  timings, blockers, 5 campaigns/25 drafts/5 publications and payment intent.
  Starts only after a safe reachable journey; invitations and publication require
  authorization. Document misses rather than marking numeric targets achieved.

## Thirty-day planning envelope

Days 1–5: US-001 and test access. Days 6–9: US-002/003. Days 10–14: US-004/005.
Days 15–21: US-006/007. Days 22–25: US-008 and SUP-001. Days 26–30: pilot and
recurring blockers. This is a planning allocation from approval, not a promise
that provider access or blocked prerequisites will resolve on schedule. Never
skip a demonstration gate to keep the calendar. Check provider eligibility and
test-host availability early as read-only readiness work.
