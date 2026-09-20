import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import type { Connect, Plugin } from "vite";

const COOKIE = "distribution_local_session";
const SETUP = "/__local/workspace";
type LocalOwner = { userId: string; token: string };

function localOwner(root: string): LocalOwner {
  const directory = join(root, ".sites-runtime");
  mkdirSync(directory, { recursive: true });
  const file = join(directory, "local-workspace.json");
  try {
    writeFileSync(file, JSON.stringify({ userId: `local_${randomUUID()}`, token: randomBytes(32).toString("hex") }), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const owner = JSON.parse(readFileSync(file, "utf8")) as LocalOwner;
  if (!owner.userId?.startsWith("local_") || !/^[a-f0-9]{64}$/.test(owner.token)) throw new Error("Invalid local workspace session configuration.");
  return owner;
}

function returnPath(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/workspace";
  const url = new URL(value, "http://localhost");
  if (url.origin !== "http://localhost" || url.pathname !== "/workspace") return "/workspace";
  return `${url.pathname}${url.search}`;
}

function redirect(response: ServerResponse, location: string) {
  response.writeHead(303, { Location: location, "Cache-Control": "no-store" });
  response.end();
}

/** Explicit local development session; never registered in a production build. */
export function localWorkspaceMiddleware(root: string): Connect.NextHandleFunction {
  const owner = localOwner(root);
  return (request, response, next) => {
    void handle(request, response, next).catch(() => {
      response.writeHead(500, { "Content-Type": "text/plain" });
      response.end("The local workspace could not start. Please retry.");
    });
  };

  async function handle(request: IncomingMessage, response: ServerResponse, next: Connect.NextFunction) {
    // A local browser can supply arbitrary headers; only our session may supply identity.
    for (const name of Object.keys(request.headers)) {
      if (name.startsWith("oai-authenticated-")) delete request.headers[name];
    }
    // Cloudflare's Node adapter reconstructs its Request from rawHeaders.
    // Sanitize both views so supplied identities cannot bypass the session.
    for (let index = request.rawHeaders.length - 2; index >= 0; index -= 2) {
      if (request.rawHeaders[index].toLowerCase().startsWith("oai-authenticated-")) request.rawHeaders.splice(index, 2);
    }
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "invalid"}`);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
      response.writeHead(403); response.end("Local workspace access requires localhost."); return;
    }
    const token = request.headers.cookie?.split(";").map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? "";
    const authenticated = /^[a-f0-9]{64}$/.test(token) && timingSafeEqual(Buffer.from(token), Buffer.from(owner.token));
    const mutation = !["GET", "HEAD", "OPTIONS"].includes(request.method ?? "GET");
    if ((authenticated && mutation || url.pathname === SETUP && request.method === "POST") && request.headers.origin !== url.origin) {
      response.writeHead(403); response.end("Open the local workspace from this app to continue."); return;
    }
    if (url.pathname === "/signin-with-chatgpt") {
      redirect(response, `${SETUP}?return_to=${encodeURIComponent(returnPath(url.searchParams.get("return_to")))}`); return;
    }
    if (url.pathname === "/signout-with-chatgpt") {
      response.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
      redirect(response, "/"); return;
    }
    if (url.pathname === SETUP) {
      const destination = returnPath(url.searchParams.get("return_to"));
      if (request.method === "POST") {
        response.setHeader("Set-Cookie", `${COOKIE}=${owner.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`);
        redirect(response, destination); return;
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD, POST" }); response.end(); return;
      }
      if (authenticated) { redirect(response, destination); return; }
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'self'", "X-Content-Type-Options": "nosniff" });
      response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Open your local workspace — Distribution OS</title><style>body{margin:0;background:#080d12;color:#eff5f7;font-family:system-ui,sans-serif;display:grid;min-height:100vh;place-items:center}main{max-width:480px;margin:24px;padding:36px;border:1px solid #24323b;border-radius:20px;background:#111a21}small{color:#82d8bd}h1{font-size:32px;line-height:1.15}p{color:#b4c3cc;line-height:1.6}button{width:100%;padding:15px;border:0;border-radius:10px;background:#b3f477;color:#14210b;font:600 16px system-ui;cursor:pointer}a{color:#b4c3cc;display:inline-block;margin-top:20px}</style></head><body><main><small>Distribution OS · Local workspace</small><h1>Start your first mission.</h1><p>Open the workspace on this computer to analyze your website and save your mission. Your entered website will carry through.</p><p>This local workspace is separate from your hosted ChatGPT account. Anyone using this computer's local app can open it.</p><form method="post"><button type="submit">Open local workspace</button></form><a href="/">Back to home</a></main></body></html>`);
      return;
    }
    if (authenticated) {
      request.headers["oai-authenticated-user-id"] = owner.userId;
      request.headers["oai-authenticated-user-email"] = "operator@localhost.invalid";
      request.headers["oai-authenticated-user-full-name"] = "Local%20operator";
      request.headers["oai-authenticated-user-full-name-encoding"] = "percent-encoded-utf-8";
      for (const [name, value] of Object.entries(request.headers)) {
        if (name.startsWith("oai-authenticated-") && typeof value === "string") request.rawHeaders.push(name, value);
      }
    }
    next();
  }
}

export function localWorkspace(): Plugin {
  return {
    name: "distribution-local-workspace",
    apply: "serve",
    enforce: "pre",
    config(config) {
      return { server: { fs: { deny: [
        ...(config.server?.fs?.deny ?? [".env", ".env.*", "*.{crt,pem}", "**/.git/**"]),
        "**/local-workspace.json",
      ] } } };
    },
    configureServer(server) {
      if (process.env.DISTRIBUTION_LOCAL_WORKSPACE !== "1") return;
      server.middlewares.use(localWorkspaceMiddleware(server.config.root));
    },
  };
}
