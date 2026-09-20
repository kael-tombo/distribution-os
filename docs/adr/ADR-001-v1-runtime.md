# ADR-001 — retain the current modular monolith for the V1 proof

Date: 2026-09-17. Status: PROPOSED — awaiting owner approval.

## Context

The repository is TypeScript/React using Next.js App Router conventions on
Vinext/Vite, Cloudflare Workers, D1/SQLite, Drizzle and Zod. Identity comes from
Sites-managed headers; a separate development-only local session exists.
Docker Compose runs a loopback development server with persistent local D1 state.
It is not a production FastAPI/PostgreSQL deployment.

The owner's recommended Python/FastAPI/PostgreSQL stack is reasonable for a new
standalone deployment. Adopting it here would require persistence, identity,
API and deployment migration before validating the first user journey.

## Proposed decision

Keep the existing runtime and directory structure for US-001 and the initial V1
proof. Organize agent responsibilities as typed logical modules within app/api,
lib and db. Do not create a second backend, Redis, a worker fleet or S3 storage
without a measured requirement. Keep provider adapters behind typed interfaces;
broader model-provider support is incremental, not a prerequisite for URL intake.

Use the existing Docker Compose environment for local test reproduction. A
reachable authenticated test environment is separately required before a story
is complete. Preserve Sites configuration while its access is checked. If Sites
cannot support the pilot, stop for a hosting/authentication ADR; do not expose
the development-only local identity mode to external users.

## Alternatives

- Rewrite now in FastAPI/PostgreSQL: matches the suggested greenfield stack but
  consumes the 30-day budget and replaces proven boundaries. Not recommended.
- Add a parallel Python service: duplicates ownership and introduces distributed
  failure cases without an established need. Not recommended.
- Retain runtime: fastest path to testing user value; accepts current hosting
  constraints and may require a later explicit migration.

## Consequences and open decisions

Production Docker Compose portability is not achieved by this proposal. Owner
approval must explicitly accept deferring that architecture target. If production
Compose is mandatory now, revise the plan before US-001 implementation.

An internet-facing fetch must have enforceable DNS/private-network controls,
including redirects and rebinding. String URL validation or a DNS preflight by
itself is insufficient. Verify the runtime's actual egress boundary and stop
external release if that guarantee cannot be established within the contract.

X app access, costs, OAuth permissions, encryption/key rotation and available
metrics remain integration gates. No provider contract is asserted in this ADR.

## Acceptance record

Pending. No technology migration, dependency installation or deployment is
authorized by the existence of this proposal.
