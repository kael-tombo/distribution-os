/**
 * URL safety utilities for fetching external content.
 *
 * These helpers harden outbound HTTP requests against SSRF and resource
 * exhaustion by validating the destination URL, capping redirects/timeouts,
 * and enforcing a maximum response body size.
 */

/** Network ports that callers are permitted to target. */
export const ALLOWED_PORTS = [80, 443, 8080, 8443, 3000, 5173] as const;

/** Maximum number of HTTP redirects that will be followed. */
export const MAX_REDIRECTS = 5;

/** Total redirect-chain and response-body timeout in milliseconds. */
export const REQUEST_TIMEOUT_MS = 10_000;

/** Maximum response body size in bytes. */
export const MAX_BODY_BYTES = 120_000;

/** Generic fetch implementation signature compatible with global fetch. */
export type FetchImpl = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/** Options accepted by {@link fetchWithRedirectLimit}. */
export interface FetchWithRedirectLimitOptions {
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit;
  /** Inject a custom fetch implementation (useful for tests). */
  fetchImpl?: FetchImpl;
  /** Override {@link REQUEST_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** Override {@link MAX_REDIRECTS}. */
  maxRedirects?: number;
  /** Override {@link MAX_BODY_BYTES}. */
  maxBodyBytes?: number;
}

/** Normalized result returned by {@link fetchWithRedirectLimit}. */
export interface FetchWithRedirectLimitResult {
  url: string;
  status: number;
  body: string;
  contentType: string;
  bytes: number;
  truncated: boolean;
  redirectCount: number;
}

interface Ipv4Rule {
  name: string;
  test: (a: number, b: number, c: number, d: number) => boolean;
}

const IPV4_BLOCKED_RANGES: Ipv4Rule[] = [
  { name: "loopback", test: (a) => a === 127 },
  { name: "private-10", test: (a) => a === 10 },
  { name: "private-172", test: (a, b) => a === 172 && b >= 16 && b <= 31 },
  { name: "private-192", test: (a, b) => a === 192 && b === 168 },
  { name: "link-local", test: (a, b) => a === 169 && b === 254 },
  { name: "reserved-0", test: (a) => a === 0 },
  { name: "cgnat", test: (a, b) => a === 100 && b >= 64 && b <= 127 },
  { name: "reserved", test: (a, b) => a >= 240 || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) },
  {
    name: "test-net",
    test: (a, b, c) =>
      (a === 192 && b === 0 && c === 2) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113),
  },
  { name: "multicast", test: (a) => a >= 224 && a <= 239 },
  {
    name: "broadcast",
    test: (a, b, c, d) => a === 255 && b === 255 && c === 255 && d === 255,
  },
];

function parseIpv4(ip: string): [number, number, number, number] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n < 0 || n > 255) return null;
    nums.push(n);
  }
  return [nums[0], nums[1], nums[2], nums[3]];
}

function isBlockedIpv4(ip: string): boolean {
  const parts = parseIpv4(ip);
  if (!parts) return false;
  const [a, b, c, d] = parts;
  return IPV4_BLOCKED_RANGES.some((rule) => rule.test(a, b, c, d));
}

function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
  // URL normalizes dotted mapped addresses into hexadecimal words. Restrict
  // literals to global unicast; exclude translation/transition and special ranges.
  if (!/^[23][0-9a-f]{3}:/.test(lower)) return true;
  const [first, second] = lower.split(":");
  const secondWord = parseInt(second || "0", 16);
  // Include compressed 2001:: forms in the special-purpose 2001::/23 block.
  if (first === "2001" && (secondWord < 0x200 || secondWord === 0xdb8)) return true;
  if (first === "2002" || first === "3fff") return true;
  return false;
}

/**
 * Validate that a URL points at a public, reachable HTTP(S) endpoint.
 *
 * @throws {Error} when the URL is unsafe (non-HTTP scheme, credentials,
 *   non-standard port, localhost, private/reserved/multicast IP, or a
 *   `.local`/`.internal` hostname).
 */
export function validatePublicUrl(raw: string): URL {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error("URL must be a non-empty string");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Non-HTTP protocol not allowed: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new Error("Credentials in URL are not allowed");
  }
  const portStr = url.port;
  if (portStr !== "") {
    const port = Number(portStr);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new Error(`Invalid port: ${portStr}`);
    }
    if (!(ALLOWED_PORTS as readonly number[]).includes(port)) {
      throw new Error(`Non-standard port not allowed: ${portStr}`);
    }
  }
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (host === "") {
    throw new Error("URL must have a hostname");
  }
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new Error("Localhost is not allowed");
  }
  if (host === "local" || host.endsWith(".local")) {
    throw new Error(".local TLD is not allowed");
  }
  if (host === "internal" || host.endsWith(".internal")) {
    throw new Error(".internal TLD is not allowed");
  }
  if (!host.includes(".") && !host.includes(":")) {
    throw new Error("A public hostname is required");
  }
  // IPv4 literal
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
    if (isBlockedIpv4(host)) {
      throw new Error(`Private/reserved IPv4 address not allowed: ${host}`);
    }
  }
  // IPv6 literal (URL hostname keeps surrounding brackets)
  const bareHost = host.startsWith("[") && host.endsWith("]")
    ? host.slice(1, -1)
    : host;
  if (bareHost.includes(":")) {
    if (isBlockedIpv6(bareHost)) {
      throw new Error(`Private/reserved IPv6 address not allowed: ${host}`);
    }
  }
  return url;
}

/**
 * Fetch a URL while enforcing redirect, timeout, and body-size limits.
 *
 * Each redirect target is re-validated with {@link validatePublicUrl}.
 * Hostname checks do not validate DNS resolution; the deployment must also
 * enforce private-network isolation at the actual outbound connection.
 */
export async function fetchWithRedirectLimit(
  rawUrl: string,
  options: FetchWithRedirectLimitOptions = {},
): Promise<FetchWithRedirectLimitResult> {
  const fetchImpl: FetchImpl =
    options.fetchImpl ??
    ((input, init) => fetch(input as RequestInfo | URL, init));
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  const maxBodyBytes = options.maxBodyBytes ?? MAX_BODY_BYTES;

  let currentUrl = validatePublicUrl(rawUrl);
  let redirectCount = 0;
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("Website fetch timed out"));
      controller.abort();
      void reader?.cancel().catch(() => {});
    }, timeoutMs);
  });
  try {
    for (;;) {
    if (redirectCount > maxRedirects) {
      throw new Error(`Too many redirects (max ${maxRedirects})`);
    }
    const response = await Promise.race([fetchImpl(currentUrl.href, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
        redirect: "manual",
      }), deadline]);

    if (response.status >= 300 && response.status < 400) {
      void response.body?.cancel().catch(() => {});
      const location = response.headers.get("location");
      if (!location) {
        throw new Error(
          `Redirect ${response.status} without Location header`,
        );
      }
      let nextUrl: URL;
      try {
        nextUrl = new URL(location, currentUrl);
      } catch {
        throw new Error("Invalid redirect Location");
      }
      currentUrl = validatePublicUrl(nextUrl.href);
      redirectCount++;
      continue;
    }

    const contentType = response.headers.get("content-type") ?? "";
    let body = "";
    let bytes = 0;
    let truncated = false;

    if (response.body) {
      reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: false });
      for (;;) {
        const { done, value } = await Promise.race([reader.read(), deadline]);
        if (done) break;
        if (!value) continue;
        bytes += value.byteLength;
        if (bytes > maxBodyBytes) {
          truncated = true;
          const overflow = bytes - maxBodyBytes;
          const allowedInChunk = value.byteLength - overflow;
          if (allowedInChunk > 0) {
            body += decoder.decode(value.subarray(0, allowedInChunk), {
              stream: true,
            });
          }
          void reader.cancel().catch(() => {});
          bytes = maxBodyBytes;
          break;
        }
        body += decoder.decode(value, { stream: true });
      }
      // Drop an incomplete trailing code point when the byte cap cuts UTF-8.
      if (!truncated) body += decoder.decode();
    } else {
      body = await Promise.race([response.text(), deadline]);
      const encoded = new TextEncoder().encode(body);
      bytes = encoded.length;
      if (bytes > maxBodyBytes) {
        truncated = true;
        body = new TextDecoder("utf-8", { fatal: false }).decode(
          encoded.subarray(0, maxBodyBytes),
        );
        bytes = new TextEncoder().encode(body).length;
      }
    }

    return {
      url: currentUrl.href,
      status: response.status,
      body,
      contentType,
      bytes,
      truncated,
      redirectCount,
    };
    }
  } finally {
    clearTimeout(timer!);
    // Never await untrusted stream cleanup beyond the deadline.
    void reader?.cancel().catch(() => {});
    controller.abort();
  }
}
