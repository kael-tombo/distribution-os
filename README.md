# Distribution OS

Distribution OS is a voice-first, agentic platform for managing the marketing, content operations and distribution of a solution across connected MCP tools and APIs. It owns strategy, campaign coordination, approvals, distribution and learning; specialized platforms produce the actual content. The target is a qualified ecosystem of 20+ tools, with campaign-specific goals spanning awareness, demand, adoption, retention and revenue.

The product is intentionally governed:

- evidence is separated into observed, inferred, and verified states;
- plans, experiments, content, and actions become durable records;
- external actions require approval of an exact queued payload;
- execution fails closed until a provider adapter can return a real receipt;
- revenue counts come from signed Stripe webhook events, not UI simulation;
- every query and stream is scoped to the authenticated workspace.

The current implementation is a hardened first slice, not a claim that the full autonomous operating system already exists. See [Current State](docs/CURRENT_STATE.md) for the verified boundary and next implementation wave.

## Product direction

The [Platform Vision and Workflow](docs/PLATFORM_VISION_AND_WORKFLOW.md) defines the complete target, voice interaction, agent roles, delegated production, user stories and phased delivery. The [31-tool Integration Portfolio](docs/INTEGRATION_FEASIBILITY.md) separates documented MCP/API options from unverified access. These plans supersede the earlier email-first ordering; they do not claim that voice or social integrations already work.

## Current implemented path

For campaign planning, open **Campaign Brief** in the workspace. Save your product, audience and campaign instructions, then review a measurable objective with baseline, target, source, dates and guardrails. Confirm it and prepare a checklist or an enabled AI strategy proposal. Saved jobs retain attempts and results, detect conflicts, and support explicit recovery after interruption. Download the brief and plan for your production partner. Checklist mode works without a website or provider credentials. Voice, specialist production and public distribution remain separate planned capabilities. See [Campaign Planning Architecture](docs/CAMPAIGN_PLANNING_ARCHITECTURE.md).

Development follows [Outcome-oriented delivery](docs/OUTCOME_DELIVERY.md): define the user's desired result, implement the complete path to its evidence, and distinguish shipped behavior from outcomes demonstrated with real customers.

1. An authenticated operator submits a public URL to `POST /api/mission`.
2. The server validates the URL against SSRF and redirect abuse, fetches it, and sanitizes the page as untrusted content.
3. OpenAI synthesis is used when configured; otherwise the same contract is populated in explicit simulation mode. Both paths are schema-validated.
4. The server creates a mission plus website evidence, inferred assumptions, experiments, content drafts, a prepared action, versions, lifecycle events, and run telemetry. A failed artifact write is compensated by deleting the new mission graph.
5. The lifecycle follows `observe → decide → approve → act → measure → learn`. Server-side readiness checks prevent skipping exact-action approval, provider-confirmed execution, or measurement evidence.
6. One exact approved plain-text email can be submitted through a tenant-bound Resend sandbox; the attempt, idempotency key, provider receipt, touchpoint, and evidence are durable.
7. Signed Resend delivery events prove delivery separately from API acceptance. Signed Stripe events with valid workspace metadata record attributable payments and update the mission’s verified-payment counter.

Resend email execution requires operator-supplied credentials and an exact workspace, sender, and recipient allowlist. Unsupported action types return `501` and preserve the approved action instead of manufacturing success.

## Stack

- Next.js App Router on Vinext/Vite and Cloudflare Workers
- Cloudflare D1 / SQLite
- TypeScript, React, Zod, Drizzle
- OpenAI Responses API for optional live synthesis
- ChatGPT-hosted identity headers supplied by the control plane

## Local commands

Node 22.13 or newer is required. The default commands are portable across Windows and Linux.

```sh
npm run install:ci
npm run db:migrate:local
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
```

`npm run install:ci:sites` retains the Linux-only, lock-and-preflight Sites installer for the hosted build image. Standard local and CI installations use `npm ci`.

Hosted routes require the hosting identity headers. For a standalone local workspace, set `DISTRIBUTION_LOCAL_WORKSPACE=1` before `npm run dev`; Docker Compose enables this local development mode automatically. It requires an explicit browser session and is excluded from production builds.

## Local Docker

Docker Compose runs the same Vinext/Vite and Cloudflare D1 development runtime
as `npm run dev`. Docker Desktop (or Docker Engine with Compose) is the only
host prerequisite.

```sh
# Optional: enables provider integrations; blank values keep simulation mode.
cp .env.example .dev.vars

docker compose up --build
```

Open `http://localhost:5173`. The port is bound to loopback only. Set `APP_PORT` to change the host-side port, for
example `APP_PORT=8080 docker compose up --build`. The D1 and runtime state are
kept in named Docker volumes. Rebuild the image after source or dependency
changes with `docker compose up --build`. To stop the app without deleting local
data, run `docker compose down`. Startup applies pending D1 migrations before
serving requests and stops if a migration fails. This requires Docker Compose
2.24.0 or later for the optional environment file.

Compose loads `.dev.vars` at runtime; it is excluded from Git and image builds.
The Worker reads these values using [Cloudflare's process-environment option](https://developers.cloudflare.com/workers/local-development/environment-variables/).
After entering your website, choose **Open local workspace** to continue. This
creates a browser session for one persistent local operator, separate from your
hosted ChatGPT account. Anyone with access to this computer's loopback app can
open that workspace. Its identity and session key stay in the runtime volume;
workspace APIs return `401` before the session is opened. Local mode strips
client-supplied identity headers, rejects non-loopback hosts, and checks origins
on authenticated writes. Hosted ChatGPT sign-in remains platform-managed.

The container intentionally uses the development server: `vinext start` is a
Node production server and does not provide the Cloudflare D1 binding required
by this application. Production remains a Cloudflare Worker deployment as
described in [Deployment](docs/DEPLOYMENT.md).

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `DB` | yes in hosted runtime | Cloudflare D1 binding |
| `OPENAI_API_KEY` | no | Enables live mission synthesis; omission is labelled simulation |
| `OPENAI_MODEL` | no | Overrides the configured Responses API model |
| `CAMPAIGN_AI_PLANNING_ENABLED` | for AI campaign planning | Must be `1`; defaults disabled, checklist remains available |
| `CAMPAIGN_AI_WORKSPACE_ID` | for AI campaign planning | Exact workspace authorized to use the shared AI key for strategy planning |
| `STRIPE_WEBHOOK_SECRET` | for Stripe ingestion | Verifies signed Stripe webhook payloads |
| `RESEND_API_KEY` | for email execution | Sending-only Resend credential; never sent to the browser |
| `RESEND_WEBHOOK_SECRET` | for delivery evidence | Verifies raw signed Resend webhook payloads |
| `RESEND_WORKSPACE_ID` | for email execution | Restricts the site-level credential to one exact workspace |
| `RESEND_FROM_EMAIL` | for email execution | Exact sender that an approved payload must match |
| `RESEND_ALLOWED_RECIPIENTS` | for email execution | Comma-separated sandbox allowlist; empty blocks every recipient |

Connector records are setup declarations only. Their status cannot be promoted to connected by a client request.

## Repository map

- `app/api/` — authenticated HTTP boundaries and webhooks
- `app/workspace/` — API-backed operator workspace
- `db/` — tenant-scoped persistence and domain operations
- `lib/` — validation, lifecycle, safety, and pure domain logic
- `drizzle/` — forward-only schema migrations
- `tests/` — TypeScript and module tests
- `docs/` — API, security, architecture, and current-state documentation
- `docs/GOD_MODE_ASSESSMENT_AND_EXECUTION_PLAN.md` — repository-grounded product assessment and ordered delivery plan
- `docs/USER_STORIES.md` — generated 84-story engineering catalog in the required ticket contract
- `scripts/` — cross-platform command runner plus hosted Linux installer

## Security boundary

- Workspace ownership is derived from trusted identity headers, never request JSON.
- Mission, action, payment-attribution, and SSE queries verify workspace ownership.
- Website content is untrusted input and is sanitized before model use.
- Action approval does not imply connector authorization, spend authorization, or execution success.
- Webhook persistence errors return failure so Stripe can retry.
- Data deletion is audited only after its deletion batch succeeds.

See [Security](docs/SECURITY.md), [API Reference](docs/API_REFERENCE.md), and [Database](docs/DATABASE.md) for deeper reference material. Where older design notes describe planned behavior, [Current State](docs/CURRENT_STATE.md) is authoritative for runtime claims.
