import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { localWorkspaceMiddleware } from "../build/local-workspace-plugin";

test("local onboarding preserves the website, persists its session, and enforces the local boundary", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "distribution-onboarding-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let middleware = localWorkspaceMiddleware(root);
  const server = createServer((req, res) => middleware(req, res, () => {
    // Match Cloudflare's adapter, which consumes rawHeaders rather than headers.
    const index = req.rawHeaders.findIndex(name => name.toLowerCase() === "oai-authenticated-user-id");
    const userId = index >= 0 ? req.rawHeaders[index + 1] : null;
    assert.equal(userId, req.headers["oai-authenticated-user-id"] ?? null);
    res.writeHead(userId ? 200 : 401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ userId }));
  }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const destination = "/workspace?website_url=https%3A%2F%2Fexample.com%2F%3Fx%3D1%26y%3D2";
  const start = await fetch(`${origin}/signin-with-chatgpt?return_to=${encodeURIComponent(destination)}`, { redirect: "manual" });
  assert.equal(start.status, 303);
  const setupPath = start.headers.get("location")!;
  assert.equal(new URL(setupPath, origin).searchParams.get("return_to"), destination);
  const setup = await fetch(origin + setupPath);
  assert.match(await setup.text(), /Open local workspace/);
  assert.equal(setup.headers.get("set-cookie"), null);

  const spoofed = await fetch(origin + "/api/workspace", { headers: { "oai-authenticated-user-id": "victim", "oai-authenticated-user-email": "victim@example.com" } });
  assert.equal(spoofed.status, 401);
  const rejectedOrigins: Record<string, string>[] = [{}, { Origin: "https://attacker.example" }];
  for (const headers of rejectedOrigins) {
    assert.equal((await fetch(origin + setupPath, { method: "POST", headers, redirect: "manual" })).status, 403);
  }
  const login = await fetch(origin + setupPath, { method: "POST", headers: { Origin: origin }, redirect: "manual" });
  assert.equal(login.status, 303);
  assert.equal(login.headers.get("location"), destination);
  const setCookie = login.headers.get("set-cookie")!;
  assert.match(setCookie, /HttpOnly; SameSite=Lax/);
  const cookie = setCookie.split(";")[0];
  const session = await fetch(origin + "/api/workspace", { headers: { Cookie: cookie } });
  assert.equal(session.status, 200);
  const identity = await session.json() as { userId: string };
  assert.match(identity.userId, /^local_/);
  assert.equal((await fetch(origin + "/api/mission", { method: "POST", headers: { Cookie: cookie, Origin: "https://attacker.example" } })).status, 403);
  assert.equal((await fetch(origin + "/api/mission", { method: "POST", headers: { Cookie: cookie, Origin: origin } })).status, 200);
  assert.equal((await fetch(origin + "/api/workspace", { headers: { Cookie: "distribution_local_session=" + "z".repeat(64) } })).status, 401);
  const foreignHostStatus = await new Promise<number | undefined>((resolve, reject) => {
    const request = httpRequest(origin, { headers: { Host: "attacker.example" } }, response => {
      response.resume(); resolve(response.statusCode);
    });
    request.on("error", reject); request.end();
  });
  assert.equal(foreignHostStatus, 403);

  middleware = localWorkspaceMiddleware(root);
  const restored = await fetch(origin + "/api/workspace", { headers: { Cookie: cookie } });
  assert.deepEqual(await restored.json(), identity);
  const unsafeRedirect = await fetch(origin + "/signin-with-chatgpt?return_to=" + encodeURIComponent("//attacker.example"), { redirect: "manual" });
  assert.equal(new URL(unsafeRedirect.headers.get("location")!, origin).searchParams.get("return_to"), "/workspace");
  const logout = await fetch(origin + "/signout-with-chatgpt", { headers: { Cookie: cookie }, redirect: "manual" });
  assert.match(logout.headers.get("set-cookie")!, /Max-Age=0/);
});
