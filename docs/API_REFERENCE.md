# Distribution OS — API Reference

> Runtime-status note: [CURRENT_STATE.md](CURRENT_STATE.md) is authoritative
> where this historical reference describes target-state or preview behavior.

This document is the canonical reference for every HTTP endpoint exposed by
Distribution OS. All routes live under `/api/*` and run on the Cloudflare
Workers runtime. Routes that mutate state require a signed-in ChatGPT user;
the platform injects identity headers (`oai-authenticated-user-id`,
`oai-authenticated-user-email`, optional `oai-authenticated-user-full-name`
with `oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`)
which the routes consume through `requireRequestIdentity` in
`db/workspaces.ts`.

## Mission outcome projection

`GET /api/missions/:mission_id/summary` requires workspace identity and returns `404` outside the caller's workspace. Its `summary` includes `synthesis_mode`, `measurement_signal_count` and `next_step` (`title`, `reason`, `result`, `label`, `destination`) alongside stage, counts and blockers. Destinations are workspace views, not execution commands. Guidance is deterministic by stage; it is not a ranked opportunity or revenue forecast.

Measurement signals are mission-linked signed Resend delivery/engagement/failure events plus successful Stripe payments. Internal evidence, API acceptance and unmatched events do not count. The same query feeds the `measure` advancement gate. Counts cover the whole mission, not a particular experiment or cycle. `readiness_score` remains for compatibility; the main overview uses gate states instead.

## Campaign brief

`GET /api/campaign-brief` and `PUT /api/campaign-brief` require identity and derive the workspace from it. Both successful responses use `Cache-Control: no-store`.

GET returns `{ current: BriefRevision | null, revisions: BriefRevision[] }`, newest first, limited to 20 revisions. A revision contains `revision`, `brief` and `created_at` (epoch milliseconds). No saved brief returns `current: null` and an empty history.

PUT accepts the exact shape below and returns `200` with `{ current: BriefRevision }`:

```json
{
  "expected_revision": 0,
  "brief": {
    "product": "Team planning",
    "objective": "Launch the team plan",
    "audience": "Small marketing teams",
    "channels": ["LinkedIn", "YouTube"],
    "success_measure": "10 qualified demo requests in 30 days",
    "constraints": "Use approved claims; human production handoff."
  }
}
```

Use `expected_revision: 0` for the first save and the last reviewed revision thereafter. A stale revision returns `409`; load the latest and reconcile edits before resubmitting. Revision and audit writes commit together. A retry after a lost successful response returns a conflict instead of creating a duplicate revision; GET reveals the saved result. This route uses revision matching rather than the generic `Idempotency-Key` header.

Product, objective, audience and success measure are required nonblank strings with limits of 160, 2000, 2000 and 1000 characters. Constraints is required but may be empty (maximum 3000). Channels must be unique, with at least one of Website, Email, LinkedIn, X, Instagram, TikTok, YouTube or Reddit. Unknown fields are rejected. Invalid JSON or input returns `400`, missing identity `401`, a UTF-8 body over 40,000 bytes `413`, and persistence errors `500`.

Channel preferences do not establish account access. Saving creates no mission, production request, spending authorization or publication. Full workspace data export includes all `campaign_brief_versions`, and workspace data deletion removes them.

## Campaign objectives and planning jobs

All `/api/campaign-plans` routes require identity, derive the workspace from it,
and return `Cache-Control: no-store`. POST bodies are bounded to 40,000 bytes.

- `GET /api/campaign-plans` returns `{ records, ai_available, ai_blocker }`.
  Records are the latest 20 jobs, newest first, including their exact brief,
  objective, mode, status, attempt count, lease expiry and validated result.
- `POST /api/campaign-plans` confirms an objective and creates a queued job.
  It does not run the planner. Success is `200 { record }`, including replay
  of an identical confirmation. One objective is allowed per brief revision;
  changed inputs require a new saved brief revision.
- `GET /api/campaign-plans/:plan_id` returns `200 { record }` or `404` outside
  the authenticated workspace.
- `POST /api/campaign-plans/:plan_id` takes
  `{ "action": "run" | "retry" | "cancel", "expected_attempts": number }`.
  Run uses attempt zero; retry uses the current nonzero count. A successful
  run returns the persisted `completed` or `failed` record, not a fabricated
  provider success. Clients must inspect `record.status`.

Confirmation body:

```json
{
  "brief_revision": 1,
  "mode": "checklist",
  "objective": {
    "metric": "Qualified demos",
    "unit": "requests",
    "direction": "increase",
    "baseline": null,
    "target": 10,
    "source": "CRM qualified demos report",
    "start_date": "2026-09-08",
    "end_date": "2026-10-08",
    "guardrails": "Count opted-in, qualified leads only",
    "attribution_limits": "Association does not establish causal lift"
  }
}
```

Direction is `increase` or `decrease`. Baseline is nullable, never implicitly
zero; target and any baseline must be finite, nonnegative and at most 1e12.
A known baseline must improve in the chosen direction. Calendar dates must
exist and the end cannot precede the start. Unknown fields are rejected.

AI mode requires explicit server opt-in and an exact authorized workspace.
Unavailable configuration returns `503` before claim/submission. Failed model
calls do not switch modes. Claims enforce three attempts per job and ten per
workspace in a rolling 24-hour window. Conflicts, active leases and exhausted
limits return `409`. Two-minute expired leases require explicit retry or
cancellation; no automatic dispatch occurs on GET. Cancellation of a currently
active request is rejected. A retry after an ambiguous AI request may incur
additional usage. Result writes require the matching unexpired claim token.

Results retain mode, model, prompt version, provider response ID and reported
token counts. No bill amount or verified marketing outcome is inferred.
Objective, job and attempt tables participate in full workspace export/deletion.

## Conventions

| Property            | Value                                                                 |
| ------------------- | --------------------------------------------------------------------- |
| Base URL            | Same origin as the workspace UI (e.g. `https://app.distribution.os`)  |
| Request body        | JSON (`Content-Type: application/json`) for `POST` endpoints          |
| Auth                | ChatGPT identity headers, injected by the hosting control plane        |
| Errors              | `{ "error": string }` with the appropriate HTTP status code           |
| Success responses   | Resource JSON, with `201 Created` for resource creation               |
| Time fields         | Epoch milliseconds (UTC)                                              |
| Currency fields     | Integer cents (e.g. `1999` → $19.99)                                  |
| Rate limits         | Enforced via `lib/rate-limit-pure.ts` at the edge adapter layer       |
| Idempotency         | `Idempotency-Key` accepted on mutating endpoints (see `lib/idempotency-pure.ts`) |

### Standard error envelope

```json
{
  "error": "Sign in to launch a mission."
}
```

| Status | Meaning                                                                  |
| ------ | ----------------------------------------------------------------------- |
| 400    | Body failed validation (Zod) or did not match the expected shape.       |
| 401    | Missing or invalid identity headers (`AUTH_REQUIRED`).                  |
| 404    | Resource was not found in the caller's workspace.                       |
| 409    | Conflict (duplicate, idempotency replay with different payload, etc.). |
| 422    | Validation passed but business rules rejected the operation.            |
| 429    | Rate limited.                                                            |
| 500    | Unexpected server error (DB binding missing, internal failure).         |
| 502    | Upstream provider (OpenAI, Stripe, etc.) returned no usable payload.    |

---

## Workspaces

### `GET /api/workspace`

Returns the caller's workspace snapshot, creating the workspace on first
access if necessary.

**Auth:** required.

**Response 200:**

```jsonc
{
  "workspace": {
    "id": "ws_3f9c…",
    "display_name": "Ada Lovelace",
    "owner_email": "ada@example.com",
    "plan": "founder"
  },
  "connections": [
    {
      "id": "ws_3f9c:youtube",
      "provider": "YouTube",
      "category": "Video",
      "status": "setup_required",
      "scopes_json": "[]",
      "last_sync_at": null,
      "updated_at": 1730000000000
    }
  ],
  "mission_count": 2
}
```

**Errors:** `401` if identity headers are missing.

---

## Missions

### `POST /api/mission`

Analyzes a public website URL, builds a distribution mission (six agent
passes) and persists it as the workspace's latest mission. The body is
sanitized with `lib/content-sanitize-pure.ts` before being sent to the
model, and the destination URL is validated with
`lib/url-safety.ts#validatePublicUrl` to prevent SSRF.

**Auth:** required.

**Body:**

```json
{ "website_url": "https://yourproduct.com" }
```

**Behavior:**

1. `website_url` is validated with Zod (`url().max(500)`).
2. `validatePublicUrl` rejects private/loopback/multicast hosts and non-HTTP
   schemes.
3. `fetchWithRedirectLimit` fetches the page, capping redirects, timeouts
   (`REQUEST_TIMEOUT_MS = 10_000`) and body size (`MAX_BODY_BYTES = 120_000`).
4. The visible text is stripped of HTML, sanitized against twelve prompt
   injection patterns and truncated to 8 000 bytes via
   `prepareExternalContent`.
5. If `OPENAI_API_KEY` is configured, the OpenAI Responses API is called
   with a strict JSON schema (`mode: "live"`). Otherwise a deterministic
   demo mission is generated (`mode: "simulation"`).
6. The mission is persisted with `saveMission`, which also writes the first
   two mission events (`observation`, `decision`).
7. Best-effort (try/catch):
   - An `evidence` row is created from the sanitized website content with
     `source_type = "website"` and `state = "observed"`.
   - An `audit_events` row is created with `event_category = "action"` and
     `event_type = "mission.created.live` / `mission.created.simulation`.

**Response 200:**

```jsonc
{
  "mission": { /* full mission payload */ },
  "mode": "live",
  "inspected": { "title": "Your Product", "description": "…", "final_url": "https://yourproduct.com/" },
  "state": {
    "mission_id": "MISSION-3f9c…",
    "status": "learning",
    "current_stage": "observe",
    "cycle_number": 1,
    "payment_count": 0,
    "approved": false,
    "created_at": 1730000000000,
    "updated_at": 1730000000000
  },
  "events": [ /* latest 24 mission_events */ ]
}
```

**Errors:**

| Status | Cause                                                                 |
| ------ | -------------------------------------------------------------------- |
| 400    | `website_url` is missing, malformed, or longer than 500 characters. |
| 401    | Identity headers missing.                                            |
| 500    | Fetch failed, model returned no structured output, or DB write failed. |
| 502    | OpenAI returned a non-2xx response or no `output_text`.              |

### `GET /api/mission`

Returns the workspace's latest mission (most recently updated).

**Auth:** required.

**Response 200:** Same shape as `POST /api/mission`, or `{ "mission": null }`
when no mission exists yet.

### `POST /api/mission/action`

Advances or approves the current mission.

**Auth:** required.

**Body:**

```json
{ "mission_id": "MISSION-3f9c…", "action": "advance" }
```

| `action`   | Effect                                                                                |
| ---------- | ------------------------------------------------------------------------------------- |
| `advance`  | Attempts the next governed stage (`observe → decide → approve → act → measure → learn → observe`). Server-side readiness checks can return `409` until exact-action approval, provider-confirmed execution, or measurement evidence exists. |
| `approve`  | Requires `action_id` and the exact reviewed 64-character SHA-256 `payload_hash`. The action must belong to this mission and workspace and remain prepared and unexpired. Its approval, audit, mission flag, and mission event commit together; it does not execute the provider action. |

**Response 200:** Same shape as `POST /api/mission`.

**Errors:**

| Status | Cause                                                                  |
| ------ | --------------------------------------------------------------------- |
| 400    | Body failed Zod validation (`mission_id` empty, unknown `action`).   |
| 401    | Identity headers missing.                                             |
| 404    | Mission does not exist in the caller's workspace.                     |
| 409    | A lifecycle readiness gate or concurrent transition blocked advancement. |

---

## Connectors

### `POST /api/connectors`

Records a workspace-scoped connector request. Credentials are never stored
in this call; an OAuth/API adapter must be configured separately before
the connector is usable.

**Auth:** required.

**Body:**

```json
{ "provider": "Stripe" }
```

`provider` must match a `name` from `lib/connector-catalog.ts`.

**Response 201:**

```jsonc
{
  "connection": {
    "id": "ws_3f9c:stripe",
    "provider": "Stripe",
    "category": "Payments",
    "status": "setup_required",
    "scopes_json": "[]",
    "last_sync_at": null,
    "updated_at": 1730000000000
  }
}
```

**Errors:** `400` if the provider is unknown or the body fails Zod
validation; `401` if identity headers are missing.

---

## Data deletion

### `POST /api/data-deletion`

Permanently deletes all workspace-scoped data for the caller.

**Auth:** required.

**Body:**

```json
{ "confirm": "DELETE" }
```

`confirm` must be the literal string `"DELETE"`. Any other value (or a
missing field) yields `400`.

**Behavior:**

1. Identity is captured via `requireRequestIdentity`.
2. Workspace is loaded (and created on first access if necessary) with
   `ensureWorkspace`.
3. The following tables are cleared in an FK-safe batch (children first):
   - `agent_steps`
   - `agent_runs`
   - `mission_events`
   - `mission_versions`
   - `strategy_versions`
   - `evidence`
   - `payments`
   - `touchpoints`
   - `content_assets`
   - `experiments`
   - `provider_webhook_events`
   - `action_execution_attempts`
   - `action_queue`
   - `contacts`
   - `workspace_settings`
   - `workspace_connections`
   - `connector_installations`
   - `missions`
4. An `audit_events` row with `event_category = "deletion"` and
   `event_type = "workspace.data_deleted"` is written only after that batch
   succeeds, so the audit trail never reports a failed deletion as complete.
5. The `workspaces` row itself is preserved so the user can still sign in
   afterward; deletion is intended to wipe mission/connector/evidence
   state, not the account.

**Response 200:**

```jsonc
{
  "deleted": true,
  "workspace_id": "ws_3f9c…",
  "tables": [ "agent_steps", "agent_runs", "mission_events", "…", "missions" ]
}
```

**Errors:**

| Status | Cause                                                                                       |
| ------ | ------------------------------------------------------------------------------------------ |
| 400    | `confirm` field is missing or not the literal `"DELETE"`.                                  |
| 401    | Identity headers missing.                                                                  |
| 500    | D1 binding missing or batch deletion failed.                                              |

---

## Identity headers

The hosting control plane injects the following request headers, which the
API consumes via `requireRequestIdentity`:

| Header                                          | Purpose                                              |
| ---------------------------------------------- | --------------------------------------------------- |
| `oai-authenticated-user-id`                    | Stable user identifier. Required.                    |
| `oai-authenticated-user-email`                 | Verified email. Required.                            |
| `oai-authenticated-user-full-name`             | Optional display name.                               |
| `oai-authenticated-user-full-name-encoding`    | `percent-encoded-utf-8` when the name is non-ASCII.  |

`requireRequestIdentity` returns:

```ts
type RequestIdentity = {
  userId: string;
  email: string;
  displayName: string;
};
```

The same identity is also surfaced to React Server Components through
`getChatGPTUser()` / `requireChatGPTUser(returnTo)` in
`app/chatgpt-auth.ts`, which now expose `userId` alongside `email` and
`displayName`.

---

## Audit categories

`audit_events.event_category` is one of:

`auth`, `role`, `approval`, `connector`, `action`, `payment`, `export`,
`deletion`, `security`, `config`.

The mission routes write the following events today:

| Route                       | `event_category` | `event_type`                    |
| --------------------------- | ---------------- | ------------------------------- |
| `POST /api/mission`         | `action`         | `mission.created.live`          |
| `POST /api/mission`         | `action`         | `mission.created.simulation`    |
| `POST /api/mission/action`  | `action`         | `mission.advanced`              |
| `POST /api/mission/action`  | `approval`       | `mission.approved`              |
| `POST /api/data-deletion`   | `deletion`       | `workspace.data_deleted`        |

---

## Versioning

Every mutating action that materially changes the mission payload should
write a `mission_versions` row. The action route does this after
`advanceMission`:

```ts
{
  id: "mission_version_<time>_<rand>_<seed>",
  workspace_id: string,
  mission_id: string,
  version_number: 1, // bumped from the latest known version
  mission_json: string,
  change_reason: "Advanced to decide (cycle 1).",
  created_by: string, // identity.userId
  created_at: number,
}
```

`mission_versions` is append-only; rows are never updated or deleted (only
cascade-removed with the parent mission).

---

## Evidence lifecycle

`evidence.state` transitions follow the state machine in
`db/evidence-pure.ts`:

```
observed → inferred | verified | contradicted | stale | rejected
inferred → verified | contradicted | rejected | stale
needed → observed | rejected
verified → stale | contradicted
contradicted → verified | stale
stale → observed | rejected
rejected → (terminal)
```

`POST /api/mission` creates an `observed` evidence row from the website
HTML. Later cycles are expected to refine it (e.g. to `verified` after a
Stripe payment, or `contradicted` after a failed concierge test).

---

## URL safety

`lib/url-safety.ts` exports:

| Export                  | Purpose                                                                |
| ----------------------- | --------------------------------------------------------------------- |
| `validatePublicUrl`     | Validates a URL is public HTTP(S) (no private IPs, localhost, `.local`, credentials, non-standard ports). |
| `fetchWithRedirectLimit` | Fetches with manual redirect handling, re-validating each `Location`. Enforces `MAX_REDIRECTS = 5`, `REQUEST_TIMEOUT_MS = 10_000`, `MAX_BODY_BYTES = 120_000`. |
| `ALLOWED_PORTS`         | `[80, 443, 8080, 8443, 3000, 5173]`.                                  |
| `MAX_REDIRECTS`         | `5`.                                                                   |
| `REQUEST_TIMEOUT_MS`    | `10_000`.                                                              |
| `MAX_BODY_BYTES`        | `120_000`.                                                             |

---

## Content sanitization

`lib/content-sanitize-pure.ts` exports:

| Export                    | Purpose                                                            |
| ------------------------- | ----------------------------------------------------------------- |
| `prepareExternalContent`  | `stripHtml → sanitizeForModel → truncateForModel → wrapAsDataSection`. Returns `{ text, bytes, truncated, wrapped, label }`. |
| `stripHtml`               | Drops tags, script/style/iframe content, comments; decodes entities. |
| `sanitizeForModel`        | Neutralises the twelve known prompt-injection / smuggling patterns. |
| `wrapAsDataSection`       | Wraps content in `<data:label>…</data:label>` for model clarity.   |
| `truncateForModel`        | Byte-accurate UTF-8 truncation.                                    |
| `INJECTION_PATTERNS`      | The twelve neutralised patterns.                                   |

`POST /api/mission` runs `prepareExternalContent` over the visible website
text before it is fed to OpenAI, so prompt-injection smuggled in scraped
HTML is neutralised at the boundary.

---

## Workspace client

The workspace UI (`app/workspace/workspace-client.tsx`) is a single-page
sidebar application that drives the routes above. It accepts `userId`,
`displayName`, `email` and an optional `initialUrl` from
`app/workspace/page.tsx`. The sidebar exposes 14 views:

| View           | Panel              | Source of data                          |
| -------------- | ------------------ | -------------------------------------- |
| `overview`     | (composite + `ActionQueuePanel`) | `GET /api/mission`, `GET /api/workspace` |
| `strategy`     | `StrategyPanel`    | `GET /api/mission`                      |
| `content`      | `ContentPanel`     | `GET /api/mission`                      |
| `experiments`  | `ExperimentsPanel` | `GET /api/mission`                      |
| `connectors`   | `ConnectorsPanel`  | `GET /api/workspace`, `POST /api/connectors` |
| `revenue`      | `RevenuePanel`     | `GET /api/mission`                      |
| `memory`       | `MemoryPanel`      | `GET /api/mission`                      |
| `actions`      | `ActionQueuePanel` | `GET /api/mission`                      |
| `evidence`     | `EvidencePanel`    | `GET /api/mission` (preview data)       |
| `versions`     | `VersionsPanel`    | `GET /api/mission` (preview data)       |
| `budget`       | `BudgetPanel`      | `GET /api/workspace`                    |
| `attribution`  | `AttributionPanel` | `GET /api/mission`                      |
| `contacts`     | `ContactsPanel`    | `GET /api/mission` (preview data)       |
| `settings`     | (inline)           | `GET /api/workspace`                    |

`ActionQueuePanel` is also embedded in the `overview` view so the operator
sees pending external actions alongside mission KPIs.
