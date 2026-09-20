# Distribution OS — active V1 product contract

Effective: 2026-09-17. Source: the owner's user-story-oriented development brief.

## Promise and customer

For a solo SaaS founder or indie hacker with a public product website: in less
than ten minutes, submit a URL, review a distribution strategy, generate five X
text posts, edit and approve them, and publish at least one. Small agencies and
product owners may participate only when they have this same single-product job.
This is a target, not a claim about the current application.

The long-term direction remains URL → understanding → positioning → strategy →
content → approval → publishing → measurement → improvement. V1 proves one path.

## Exact MVP

1. Sign in and enter an isolated workspace; retain the URL through onboarding.
2. Fetch one public HTML page, clean and store its main content with provenance.
3. Show the problem, audience, value proposition, features, differentiation,
   call to action and uncertainties. Website assertions are not verified facts.
4. Propose one X strategy: objective, audience, angle, message, frequency, five
   content ideas and success indicators.
5. Produce exactly five distinct text posts, each with hook, angle, body, CTA,
   product link and appropriate tone; prevent unsupported factual claims.
6. Edit and save versions; reject or approve each exact revision. Editing an
   approved revision invalidates its approval.
7. Connect one X account per workspace using OAuth with server-side encrypted
   tokens; disconnect and handle revoked access safely.
8. Explicitly publish one approved revision. Preserve publication time, external
   ID, status, errors and a link to the resulting post. No scheduled publishing.
9. Show publication history and the first metrics actually available to the
   connected account, with source and retrieval time. Unavailable is not zero.
10. Provide a truthful landing page and qualified waitlist; paid checkout is not
    required. Include onboarding, structured errors/logs, audit and basic security.

An X developer application, authorized account, supported provider permissions,
credentials and a reachable test deployment are release prerequisites. Provider
access, pricing, scopes and metrics must be verified against official current
documentation before integration; none are assumed available today.

## Scope boundary

No additional social channels, video, voice, autonomous publication, account
automation, large-scale scraping, CRM, marketplace, advanced analytics,
predictions, microservices or integration expansion. Existing unrelated features
are frozen, not removed in this preparation task. New ideas go to [BACKLOG.md](BACKLOG.md).

## Delivery authority

- This document controls V1 scope; [governance](docs/V1_GOVERNANCE.md) controls execution.
- [V1 stories](docs/V1_USER_STORIES.md) control order and acceptance gates.
- [US-001 contract](docs/US-001_AGENT_CONTRACT.md) is the only selected implementation.
- [Readiness](docs/V1_READINESS.md) records inspection evidence, not deployment proof.
- [ADR-001](docs/adr/ADR-001-v1-runtime.md) proposes retaining the existing runtime;
  it is pending human approval.
- Earlier DOS-* and V2-* roadmaps are historical reference, not additional V1
  obligations. Preserve their identifiers and generated catalog.
- Current State remains a runtime inventory; its older roadmap is superseded here.

## Validation and measurement

Recruit 5–10 consenting founders after the first stories can be demonstrated;
start with five. Observe unassisted use and record blockers, repeat-use intent,
payment intent and objections. Fix recurring problems before expanding scope.
Do not contact people or publish on their behalf without authorization.

Pilot targets: five test users, five campaigns, 25 generated posts, five real
publications and one user willing to pay. These are targets, not achieved counts.

| Metric | Definition |
| --- | --- |
| Time to first value | URL submission to five reviewable posts; separately time submission to provider-confirmed publication; under ten minutes is the full-journey target |
| Workspace creation | Successful workspace creations / authenticated onboarding starts |
| URL success | Durably saved valid extractions / submitted analysis attempts |
| Content acceptance | Drafts users retain (including edits) / generated drafts |
| Approval | Approved post revisions / reviewable post revisions |
| Publication | Provider-confirmed publications / explicit publish attempts; separately users publishing / activated users |
| Generated clicks | Provider-reported attributable clicks when available; otherwise unavailable |
| Seven-day retention | Activated users returning on day seven / users whose seven-day window has elapsed |
| Willingness to pay | Pilot users explicitly accepting a stated price and offer; separate from actual payment |

Use workspace-scoped events and UTC timestamps. Exclude fixtures and simulations;
document cohort windows and denominators. Never log tokens or full extracted text.
