# V1 delivery governance

Effective 2026-09-17. Read [PRODUCT.md](../PRODUCT.md), the selected story, its
contract, relevant ADRs and implementation before any development task.

## Preparation contract for this change

- Mission: prepare US-001 and the governance needed to review it.
- Expected outcome: a repository-grounded MVP, ordered stories and bounded contract.
- Allowed: PRODUCT.md, BACKLOG.md, README.md, CURRENT_STATE.md and the five new
  V1 governance/story/readiness/contract/ADR documents in this change (nine files total).
- Forbidden: application code, dependencies, migrations, credentials and deployment configuration.
- Acceptance: explicit source evidence, proposed architecture, honest statuses,
  testable US-001 criteria and a human approval gate.
- Out of scope: feature implementation, provider calls, deployments and outreach.
- Required tests: relevant existing baseline tests plus document/link/diff checks.
- Required evidence: command results, inspected paths and final changed-file list.
- Risks: inherited documents overstate capabilities; deployment and external-user
  access have not been revalidated.

## Working rules

Work on one story at a time. Priority order: first functional journey, real user
blocker, user validation, reliability, then features requested by multiple users.
New ideas enter BACKLOG.md; they do not expand the current contract.

Before coding, write Mission, Expected outcome, Allowed files, Forbidden files,
Acceptance criteria, Out of scope, Required tests, Required evidence and Risks.
For this initial sequence, wait for the owner's explicit approval of US-001 and
the architecture proposal before major implementation. Routine reversible work
within an approved contract does not need repeated permission.

Per story: at most ten changed files, one new dependency and one migration.
Prefer zero dependencies and migrations when existing storage fits. Count tests,
documentation and generated migration metadata. If the budget cannot contain the
work, stop and propose a better decomposition before exceeding it. Major
dependencies and technology changes require an ADR and the relevant decision.

Do not perform unrelated refactoring or technology/directory migrations. The
historical 20-assignment workflow is not an acceptance criterion for this V1:
specialist review must serve the selected story, not an agent-count target.

## Story cycle and completion gate

Understand → restate → assumptions → acceptance → exclusions → smallest plan →
approval for important decisions → implement → add/run tests → fix failures →
security review → UX review → test deployment → real demonstration → record
results → mark complete.

Statuses: proposed, awaiting approval, implementing, implemented/unverified,
blocked, complete. Do not start the next story until the current one is
demonstrable. Complete additionally requires external-user access, passing tests,
handled errors, logs/audit, updated documentation, test deployment, a recorded
real demonstration and explicit known limitations. A local build, fixture test
or screenshot alone is insufficient. Keep blocked work visible; never substitute
simulation for real provider success.

For each result record commit/source identity, environment, commands, timestamp,
results, test URL, screenshots/recording, reproduction steps and limitations.
Report modified files, decisions, tests, risks and reproduction commands.

Use these response sections: Understanding, Decision, Scope, Plan, Relevant files,
Implementation, Tests, Results, Evidence, Risks, Next action.

## Agent module contracts

Logical modules run in the existing monolith. No new services are required.

| Module | Input | Output / boundary |
| --- | --- | --- |
| URL | Validated URL and server-derived workspace | Cleaned source and provenance; no inference or publishing |
| Research | Cleaned source reference | Product understanding and uncertainties; no invented research |
| Positioning | Reviewed product understanding | Positioning and one X strategy |
| Content | Reviewed strategy and source facts | Five distinct X drafts |
| Quality and Policy | Draft revision and supported claims | Findings and review readiness; cannot approve |
| Human Approval | Exact revision and authenticated actor | Durable approval/rejection; edits invalidate approval |
| Publishing | Approved revision and authorized connector reference | Provider receipt or structured failure/unknown outcome |
| Analytics | Confirmed publication and authorized connector reference | Available observations with provenance/time |

Every implemented module must validate its own minimal input/output schemas and
return status, confidence (0–1), result, assumptions, sources, warnings and
next_action. Failure also includes error.code, safe message, retryable and
request_id. Confidence is a declared assessment, not calibrated probability;
unknown confidence is 0 with a warning. Sources reference immutable versions.

Example envelope (illustrative, not a new implemented API):

```json
{
  "status": "success",
  "confidence": 0.8,
  "result": { "source_id": "example-source" },
  "assumptions": ["The submitted page represents the product."],
  "sources": [{ "url": "https://example.com/", "version": "example-hash" }],
  "warnings": ["Website claims have not been independently verified."],
  "next_action": "human_review"
}
```

Validate model responses, distinguish inference from observations, retain model
and prompt provenance, and never let page instructions become agent authority.
Tokens and raw private content must not enter logs. Publishing needs both exact
human approval and account authorization; ambiguity must not trigger blind retry.
