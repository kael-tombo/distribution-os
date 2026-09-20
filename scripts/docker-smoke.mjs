import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Run inside the app container; no provider calls or changes to user content.
const origin = "http://127.0.0.1:5173";
const mode = process.argv[2] ?? "check";
assert.ok(["check", "record", "verify"].includes(mode), "Use check, record or verify.");
const recordPath = new URL("../.sites-runtime/docker-smoke.json", import.meta.url);
const previous = mode === "verify" ? JSON.parse(await readFile(recordPath, "utf8")) : null;

async function request(path, init = {}) {
  return fetch(new URL(path, origin), { ...init, redirect: "manual", signal: AbortSignal.timeout(30_000) });
}

assert.equal((await request("/")).status, 200, "Landing page must respond.");
assert.equal((await request("/api/workspace")).status, 401, "Anonymous API access must be rejected.");
// Supply every required identity field: an incomplete identity would be rejected
// by the route even if the middleware failed to strip client-supplied headers.
const forgedIdentity = {
  "oai-authenticated-user-id": "spoofed-user",
  "oai-authenticated-user-email": "spoofed@example.invalid",
  "oai-authenticated-user-full-name": "Spoofed%20User",
  "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
};
assert.equal((await request("/api/workspace", { headers: forgedIdentity })).status, 401,
  "Client-provided identity must not authorize a request.");
assert.equal((await request("/__local/workspace", { method: "POST", headers: { Origin: "https://untrusted.example" } })).status, 403,
  "Cross-origin local sign-in must be rejected.");

const signIn = await request("/__local/workspace?return_to=%2Fworkspace", { method: "POST", headers: { Origin: origin } });
assert.equal(signIn.status, 303, "Local sign-in must redirect.");
assert.equal(signIn.headers.get("location"), "/workspace");
const setCookie = signIn.headers.get("set-cookie") ?? "";
assert.match(setCookie, /HttpOnly/i);
assert.match(setCookie, /SameSite=Lax/i);
const cookie = setCookie.split(";")[0];
assert.match(cookie, /^distribution_local_session=[a-f0-9]{64}$/);
const authenticated = await request("/api/workspace", { headers: { Cookie: cookie } });
assert.equal(authenticated.status, 200, "Signed-in API access requires working migrations and D1.");
const snapshot = await authenticated.json();
assert.match(snapshot.workspace?.id ?? "", /^ws_/);
const spoofed = await request("/api/workspace", { headers: { ...forgedIdentity, Cookie: cookie } });
assert.equal(spoofed.status, 200);
assert.equal((await spoofed.json()).workspace?.id, snapshot.workspace.id,
  "A valid session must retain its own workspace when client identity headers are supplied.");
assert.equal((await request("/api/mission", { method: "POST", headers: { Cookie: cookie, Origin: "https://untrusted.example" }, body: "{}" })).status, 403,
  "Cross-origin authenticated writes must be rejected before reaching the mission route.");

// Hash rather than store the session credential. Comparing a new sign-in proves
// the persistent local identity/session, while workspace ID checks persisted D1.
const record = { workspace_id: snapshot.workspace.id, session_hash: createHash("sha256").update(cookie).digest("hex") };
if (previous) assert.deepEqual(record, previous, "Workspace and local session must survive restart.");
if (mode === "record") {
  await mkdir(fileURLToPath(new URL("../.sites-runtime/", import.meta.url)), { recursive: true });
  await writeFile(recordPath, `${JSON.stringify(record)}\n`, { mode: 0o600 });
}
console.log(`Docker smoke passed: authentication, D1, identity stripping, origin checks${previous ? ", restart persistence" : ""}.`);
