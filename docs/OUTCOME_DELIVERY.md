# Outcome-oriented delivery

Reviewed: 2026-09-07. Runtime claims remain governed by [Current State](CURRENT_STATE.md).

## Revised target direction

The owner clarified that Distribution OS manages ongoing marketing, content operations and distribution through voice-led agents across 20+ connected tools. Creative production, including final text, belongs to specialist platforms. [Platform Vision and Workflow](PLATFORM_VISION_AND_WORKFLOW.md) now governs product scope and delivery order. The implemented story below remains valid historical evidence; its first-payment framing is one objective, and the old ordered outcomes are superseded by phases F0-F4 in the new plan.

## Product promise and philosophy

Help a solution owner turn business goals into coordinated campaigns, specialist-produced content, governed distribution and evidence-backed decisions. The selected objective determines the result: awareness, qualified demand, adoption, retention or revenue. First attributable payment remains useful for early-stage solutions. Payment association is not proof of causation, and activity alone does not guarantee success.

The product should answer three questions before exposing operational detail: **What is proven? What is blocking me? What should I do next, and what result should I look for?**

- Express work as a user's changed ability, with an observable result.
- Distinguish website observations, generated assumptions, provider acceptance, delivery, engagement and successful payment.
- Treat negative external results as useful learning. A bounce can change a decision without being a commercial success.
- Show the evidence boundary and a recovery path whenever an outcome cannot be verified.
- Earn autonomy one demonstrated capability at a time. Recommendations navigate to review; they never grant execution permission.
- Deliver one complete user journey before adding more channels, roles or dashboards.

## Review findings and implemented slice

| Finding | User consequence | Change |
| --- | --- | --- |
| The overview emphasized stages, counts and a percentage below the main controls | A founder had to interpret activity to decide what to do | An outcome card immediately after the URL form shows payment truth, external results, blockers and one next-step link |
| Measurement counted every non-website evidence row, every touchpoint and every payment status | An internal assumption or API acceptance could unlock learning without external feedback | One shared query now gates learning and feeds the summary using signed linked Resend result events and successful Stripe payments |
| Simulation copy implied no external execution anywhere in the mission | A simulated plan followed by an explicitly approved real send could be misread | Simulation now describes plan generation separately from external results |
| The large backlog specified outcomes without recording a bounded implemented increment | Ticket presence could be mistaken for delivered user value | This delivery record names acceptance evidence and the limits of the slice |

### Story: understand the result and the next decision

**As a founder reviewing a mission, I want to see what has been proven, what blocks progress, and the next review I should perform, so that I can make a concrete customer-acquisition decision without interpreting agent activity.**

This is a bounded increment of DOS-013, DOS-014 and DOS-015 in [the story catalog](USER_STORIES.md). Those broader stories remain partial: no ranked opportunities, durable jobs, owner assignment or impact estimates are claimed.

Acceptance criteria:

1. With no successful payment, the overview says the first payment is not yet verified, regardless of stage, cycles, drafts or approvals.
2. A successful payment directs the founder to revenue evidence and explicitly distinguishes association from causation.
3. Every lifecycle stage supplies a review destination, reason and result to look for. No recommendation sends, approves or advances an action.
4. A blocked measurement stage stays blocked with only inferred evidence, manually promoted evidence, submission receipts, failed/refunded payments or unmatched webhooks.
5. A signed, mission-linked delivery, engagement or failure event can unlock learning when an open experiment exists. Delivery is never labelled a reply or payment.
6. Another workspace's or mission's events do not count toward the result.
7. Loading and failed refreshes do not display invented zero results or stale actionable guidance. Requests are cancelled when the mission changes. Returning from another workspace panel reloads the outcome; stage updates and the refresh button also reload it.
8. The card uses existing controls and responsive layout, with status announcements and explicit text labels.

Implementation evidence: `db/mission-signals.ts`, `lib/mission-next-step.ts`, `app/workspace/mission-outcome.tsx`, `tests/mission-outcome.test.ts` and the outcome case in `tests/rendered-html.test.mjs`.

Verification on 2026-09-07: production build, TypeScript check, lint and the full test suite passed. The full run exposed a missing required settings ID in the existing receipt-recovery test fixture; correcting that fixture allowed all six recovery cases to run and pass. No external email or payment was initiated during verification. Browser interaction and pilot usability targets were not tested.

**Product validation remains unmeasured:** ask five pilot founders to identify the proven result, blocker and next action within 30 seconds, and then reach the relevant review in one click. Record task completion, wrong interpretations and time; passing automated tests does not establish this usability target or prove revenue impact.

## 2026-09-07: text campaign brief and human handoff

**As a founder preparing a campaign before connecting production tools, I can save and revise my instructions and download an exact saved version so that a production partner can review the intended result.** This is a supporting increment of V2-01, not completion of voice briefing or the F1 control foundation.

Acceptance criteria and implementation:

1. Campaign Brief is available without a mission or website analysis and accepts product, objective, audience, channel preferences, success measure and constraints.
2. An authenticated save creates an immutable revision and actor-attributed audit event together. Invalid input writes nothing; audit failure rolls back the save.
3. A stale expected revision returns `409` without overwriting instructions or adding an audit event. The editor preserves edits and asks before replacing them with the latest saved version.
4. Reload restores the latest saved brief; the most recent 20 revisions remain available for exact text downloads. Full workspace data export retains all revisions, and data deletion includes them.
5. Histories and revision sequences are scoped to the authenticated workspace. No request field can select another workspace or confer approval.
6. Saving and downloading state the human handoff boundary. They create no production job, outbound action, payment or publication.

Implementation evidence: `app/workspace/campaign-brief-panel.tsx`, `app/api/campaign-brief/route.ts`, `lib/campaign-brief.ts`, `db/campaign-briefs.ts`, migration `0007_swift_chameleon.sql`, and `tests/campaign-brief.test.ts`. The regression tests execute production SQL against a fresh SQLite database with all repository migrations and transactional D1 batch semantics.

Limits: typed input only; one current brief per workspace; no mission/solution link, durable command, structured budget/date contract or provider dispatch. Drafts survive panel navigation but are not persisted until saved. Browser usability and real production-partner handoffs remain unmeasured.

Verification on 2026-09-07: all nine brief regressions and the full test suite passed; TypeScript checking, lint and the final production build passed. The generated migration applied to the local database, and the Docker image was rebuilt for the existing local app. Sites deployment was unavailable because the configured project returned `project_not_found`; no hosted release is claimed.

## 2026-09-07: reviewed objective to durable planning result

**As a founder with a saved brief, I can confirm the measurable outcome, prepare
a strategy proposal or checklist, and recover an interrupted attempt so that I
can review a concrete next decision without mistaking planning for execution.**

Acceptance criteria:

1. The UI shows exact metric, unit, baseline/unknown, target, date window,
   measurement source, guardrails and attribution limits before confirmation.
2. Objective, queued command and audit persist atomically against the reviewed
   brief revision. Duplicate confirmation does not duplicate the job.
3. Checklist and AI modes are explicit. AI requires an enabled exact workspace;
   failure does not silently select another mode or produce final content.
4. Competing requests cannot share a claim; expired and replaced attempts cannot
   complete. Retries and rolling workspace limits are enforced in the database.
5. Reload can inspect persisted status. Failed/interrupted jobs offer bounded
   explicit recovery, and the UI never reports an active request as cancelled.
6. Completed plans show their provenance, unverified assumptions, measurement
   tasks, account-access limits and next decision, and can be downloaded.
7. Another workspace cannot read or mutate the job. Full export/deletion covers
   objective, job and attempt lineage.

Implementation and limits are recorded in
[Campaign Planning Architecture](CAMPAIGN_PLANNING_ARCHITECTURE.md).
The 20 new domain/database/provider contract cases use actual migrations and
mocked model responses; the rendered card test checks baseline and outcome
labels. No live model-quality, voice, background-runtime or provider-production
claim follows from these tests. V2-01 and V2-04 remain partial.

Verification on 2026-09-07: TypeScript, lint, production build and the complete
test suite passed. The disposable Docker HTTP smoke passed against real local
D1, including brief save, exact objective confirmation, one completed checklist,
duplicate/conflict handling, mode gating and reload. No live model/provider call
was made. Ship Studio browser interaction could not be exercised because no
project was focused; hosted publishing still returns `project_not_found`.

## Earlier ordered outcomes (superseded)

| Order | User story / result | Evidence needed to call it delivered |
| --- | --- | --- |
| 1 | As an operator, I can resolve missing sending configuration and complete one allowed sandbox send | Exact payload review, provider receipt, signed delivery or failure, actionable setup errors |
| 2 | As an operator, I can resume an interrupted send without creating a duplicate | Durable job and lease, retry/reconciliation history, one provider submission across process failure |
| 3 | As a founder, I can identify which consented lead replied and paid | Lead/action/experiment/customer lineage, signed payment, explicit attribution limits |
| 4 | As a founder, I can accept or reject a lesson that changes my next experiment | Evidence-linked proposed change, recorded decision, subsequent experiment using that version |

## Development contract

For each increment, write the persona, triggering situation, desired result, evidence source, failure/recovery behavior and measurable acceptance criteria before implementation. Trace the visible control through the API, persisted state and returned evidence. Test the failure that would mislead or harm the user, including tenant boundaries where relevant. Record what shipped separately from what was demonstrated with real users or providers. Update this record and Current State as behavior changes; do not mark an entire catalog story complete for one supporting component.

Current limits: result counts are mission-wide, not per experiment or cycle; signed open/click events are provider observations, not verified human intent; full reply/customer/refund lineage is incomplete; lifecycle readiness does not establish connector health or exact-action execution eligibility. Those checks remain enforced at approval/execution boundaries.
