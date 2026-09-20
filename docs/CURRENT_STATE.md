# Distribution OS: Current State

## V1 reset and inspection — 2026-09-17

[PRODUCT.md](../PRODUCT.md) now controls scope and supersedes the product thesis
and next-wave roadmap below. Only [US-001](US-001_AGENT_CONTRACT.md) is selected,
awaiting approval. No application code or deployment changed in this reset.

The [new readiness inspection](V1_READINESS.md) qualifies older claims here:
the website evidence save path hashes cleaned content but does not retain that
text; the fetch timeout ends before body consumption; an existing edge test
accepts a mapped private IPv6 destination. Public URL safety is therefore not
fully established by the existing passing tests. X OAuth, five complete X posts,
X publication and X metrics are not demonstrated. No V1 story is Complete.

The implementation inventory below is historical context; follow the active V1
documents for work order and the readiness report for newly observed gaps.

Implementation updated: 2026-09-13. See `worklog.md` for verification evidence.

This document is the authority for claims about what the repository actually does today. Architecture and API documents may also describe target-state components; those are not proof of a runtime capability.

## Product thesis

The target product manages ongoing marketing, content operations and distribution for a solution through voice-led agents and connected specialist platforms. Its campaign objectives include awareness, qualified demand, adoption, retention and revenue. The current implementation remains an early website-to-mission slice with first-payment tracking. See [Platform Vision and Workflow](PLATFORM_VISION_AND_WORKFLOW.md) for the revised target and [Integration Feasibility](INTEGRATION_FEASIBILITY.md) for the 31-tool portfolio.

The domain hierarchy is:

`Organization → Workspace → Mission → Strategy version → Experiment → Action → Touchpoint → Evidence → Outcome`

The operating loop is:

`observe → decide → approve → act → measure → learn`

Three distinctions are non-negotiable:

1. Observed facts, model inferences, and provider-verified outcomes are different evidence states.
2. Preparing an action, approving its exact payload, executing it, and observing its result are different events.
3. Simulation, AI synthesis, and real external execution must never share a misleading status label.

## Verified in the current slice

### URL to durable mission graph

- Public URLs are validated against private-network and redirect abuse.
- Fetched HTML is sanitized and bounded before entering a model prompt.
- Live and simulation mission documents use the same strict schema.
- The server assigns mission identifiers; callers and model output cannot choose them.
- Mission creation writes the mission, lifecycle events, a completed synthesis run, website evidence, inferred assumptions, mission and strategy versions, experiments, content drafts, and one prepared action.
- Artifact persistence is compensating rather than fully transactional: if a downstream artifact write fails, the newly created mission graph is deleted and the request fails.

### Governed lifecycle

- The canonical six-stage lifecycle includes the explicit `approve` stage.
- Stage advancement uses server-side readiness queries.
- Approval requires an unexpired prepared action and records the approving identity.
- Approval, rejection, and expiry commit their action update and audit event in one D1 transaction. Stale decisions return a conflict without appending audit events.
- Both action and mission approval endpoints require the exact reviewed action hash. Approval also updates the mission flag and event in that transaction; mission-level approval cannot select an unseen queued action.
- Execution claims and submission retries recheck the exact approved payload and expiry at the database write boundary. Expiry preserves in-flight, ambiguous, and confirmed provider attempts for reconciliation.
- The `act` and `measure` boundaries require executed actions and measurement signals respectively.
- Compare-and-swap stage updates prevent two callers from silently applying the same transition.

### Tenant and execution safety

- Mission creation cannot reassign an existing mission identifier to another workspace.
- Workspace initialization no longer claims legacy rows with a null workspace owner.
- Mission event streams require identity and re-check workspace ownership while polling.
- Connector setup requests cannot self-declare a connector connected.
- Approved `send_email` actions can execute through the real Resend HTTPS API only when the requested connector, server credential, exact tenant, exact sender, and recipient sandbox allowlist all match.
- The Resend boundary re-checks the immutable payload hash, quiet hours, configured claims, budgets, and rolling 24-hour action limit before any network call.
- Execution attempts are persisted before submission with a database-unique idempotency key; the same key is sent to Resend. Confirmed, definitive-failure, and ambiguous outcomes remain distinct.
- A saved successful Resend receipt can complete action persistence after approval expiry or changes to sending configuration. Recovery validates tenant, mission, action, provider, and the exact payload before recording success, and makes no new provider request. Unconfirmed attempts still require an unexpired approval to submit.
- Signed Resend webhooks are verified from their raw bodies and deduplicated by `svix-id`. Events matching a persisted succeeded attempt are linked to the provider request, action, mission, touchpoint, and evidence ledger. Signed events arriving before that attempt are safely persisted as unmatched (`action_id` null) and reconciled when the successful attempt is persisted or the provider redelivers. Only `email.delivered` becomes verified delivery evidence.
- Every other outbound action type remains fail-closed with `501`.
- Data-deletion audit events are created only after the deletion batch succeeds.

### Revenue truth

- Only Stripe is accepted by the generic webhook route.
- Stripe signatures are verified before processing.
- Payment events require explicit workspace metadata; there is no shared “unattributed” tenant.
- Optional mission, action, and experiment references are validated against that workspace.
- Recognized payment events persist amounts, currency, status, attribution metadata, and update the mission’s succeeded-payment count.
- Persistence failures bubble to Stripe as a non-success response so delivery can be retried.

### Workspace UI and tooling

- Campaign Brief accepts a typed product, objective, audience, channel preferences, success measure and constraints without requiring website analysis. Saves create immutable workspace-scoped revisions and an audit event in one transaction; stale tabs receive a conflict. The latest 20 revisions can be downloaded for a human production handoff. Full data export and deletion include brief history.
- A saved brief can now be linked to a confirmed structured objective and a durable planning job. The objective includes metric, unit, direction, optional baseline, target, calendar window, source, guardrails and attribution limits. Confirmation is transactional with job creation and audit; identical retries return the same job.
- Planning supports an explicit deterministic checklist or an opt-in, workspace-bound AI strategy adapter. Results contain strategic production intent, measurement tasks, unknowns and the next decision; no final marketing copy, specialist job or publication is established. Failed AI calls do not silently become checklist results.
- Planning jobs retain attempts, bounded retries, two-minute claim leases, validated results and prompt/model/token provenance. Claim and completion writes are fenced against concurrent and expired attempts. Execution remains request-driven; there is no autonomous consumer. See [Campaign Planning Architecture](CAMPAIGN_PLANNING_ARCHITECTURE.md).
- New workspaces without a mission open Campaign Brief. Website-analysis failure no longer blocks authenticated campaign planning. The responsive brief/objective/plan flow provides exact readback, download, refresh and interrupted-attempt recovery.
- Valid briefs and objectives at the accepted length limits can produce a checklist. Plan downloads include every saved brief field and the exact objective. An unchanged brief can be saved as a new revision to change an objective or restart cancelled/exhausted planning while preserving earlier records.
- Mission Control leads with payment truth, external result counts, stage blockers, and one stage-specific review link with a reason and desired result. Simulation describes plan generation independently of external outcomes.
- Measurement readiness counts linked signed Resend delivery/engagement/failure events and successful Stripe payments. Internal assumptions, manually promoted evidence, API acceptance, unsuccessful payments and unmatched events cannot unlock learning. These counts are mission-wide, not experiment- or cycle-specific.
- Actions, evidence, experiments, content, revenue, contacts, run telemetry, and settings render from authenticated APIs.
- Mission and strategy version history now loads its two canonical tenant-scoped API projections instead of rendering a hard-coded empty collection.
- Landing and connector surfaces distinguish the provider roadmap from the only verified runtime boundaries: governed Resend sandbox execution and signed Stripe webhook intake.
- Preview and simulation are labelled as such; “running” and revenue states are not fabricated.
- Default build, lint, test, dev, and start commands use a cross-platform Node launcher.
- Docker onboarding uses an explicit local operator session, separate from hosted identity. The development-only middleware is opt-in outside Compose and is excluded from production. Website URLs survive the hosted sign-in redirect, and initial workspace loading avoids duplicate development-mode mission creation.

## Intentionally blocked or incomplete

These are product gaps, not hidden successes:

- Voice interaction, autonomous background campaign orchestration, delegated creative production, and the 20+ integration objective remain target capabilities. The new persisted planning job is a request-driven foundation. Existing internally generated content retains its original provenance.

- The deployed adapter is disabled until an operator supplies a sending-only Resend key, webhook secret, exact workspace id, exact sender, and sandbox recipient allowlist. No credential is committed to this repository.
- Resend is the only outbound adapter. Social, ad, CRM, batch email, HTML email, attachment, and publishing actions remain blocked.
- The 15-agent registry is a conceptual scheduling model. Mission synthesis is currently one validated model request represented as one recorded synthesis run, not 15 independently executing agents.
- There is no durable background job/lease runtime driving the lifecycle without a request.
- Connector catalog entries and setup records are not OAuth installations and do not prove account health.
- Action preparation deduplication is still checked in application code, but outbound execution now has a database-enforced unique idempotency key.
- Mission graph creation uses compensation, not one D1 transaction spanning every artifact.
- Stripe ingestion supports the selected event families, but full customer/touchpoint lineage, refund reconciliation to the original charge, and unit-economics reporting are incomplete.
- Delivery webhooks prove mail-server delivery, opens and clicks, but replies and conversion attribution still require a correlation design beyond the narrow adapter.

## Next best implementation wave

Use [Outcome-oriented delivery](OUTCOME_DELIVERY.md) for the reviewed philosophy, acceptance criteria, implementation evidence and ordered user outcomes. DOS-013 through DOS-015 remain partial; the new guidance is deterministic and stage-specific, not a ranked opportunity engine.

Follow phases F0-F2 in the revised platform plan: qualify provider access; build voice briefing, durable commands and connector controls; then demonstrate specialist-produced content, review and governed publication to two suitable channels. Reuse Resend recovery and Stripe evidence as infrastructure where relevant. The roadmap expands toward the six named social channels and 20+ qualified tools; a one-email flow no longer defines the product.

The text-briefing and objective/planning increments have migrations `0007_swift_chameleon.sql` and `0008_fine_vampiro.sql`, database-backed regression tests and a mocked AI contract suite. Next, qualify pilot providers and add supported background consumption, production budget reservations and voice correction against the same reviewed-objective boundary. V2-01 and V2-04 remain partial; model quality and real-user task completion are not established by contract tests.
