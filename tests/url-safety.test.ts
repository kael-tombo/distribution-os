import { test } from "node:test";
import assert from "node:assert/strict";

import {
  validatePublicUrl,
  fetchWithRedirectLimit,
  MAX_BODY_BYTES,
  ALLOWED_PORTS,
  type FetchImpl,
} from "../lib/url-safety";

test("validatePublicUrl accepts a valid https URL", () => {
  const url = validatePublicUrl("https://example.com/path?q=1");
  assert.equal(url.hostname, "example.com");
  assert.equal(url.protocol, "https:");
});

test("validatePublicUrl rejects the ftp:// scheme", () => {
  assert.throws(
    () => validatePublicUrl("ftp://example.com/file"),
    /non-http/i,
  );
});

test("validatePublicUrl rejects the file:// scheme", () => {
  assert.throws(
    () => validatePublicUrl("file:///etc/passwd"),
    /non-http/i,
  );
});

test("validatePublicUrl rejects embedded credentials", () => {
  assert.throws(
    () => validatePublicUrl("https://user:pass@example.com/"),
    /credential/i,
  );
});

test("validatePublicUrl rejects a non-standard port", () => {
  assert.throws(
    () => validatePublicUrl("https://example.com:22/"),
    /port/i,
  );
});

test("validatePublicUrl rejects localhost", () => {
  assert.throws(
    () => validatePublicUrl("https://localhost/"),
    /localhost/i,
  );
});

test("validatePublicUrl rejects 127.0.0.1", () => {
  assert.throws(
    () => validatePublicUrl("https://127.0.0.1/"),
    /private|reserved|loopback/i,
  );
});

test("validatePublicUrl rejects 10.0.0.1", () => {
  assert.throws(
    () => validatePublicUrl("https://10.0.0.1/"),
    /private|reserved/i,
  );
});

test("validatePublicUrl rejects 192.168.1.1", () => {
  assert.throws(
    () => validatePublicUrl("https://192.168.1.1/"),
    /private|reserved/i,
  );
});

test("validatePublicUrl rejects a .local hostname", () => {
  assert.throws(
    () => validatePublicUrl("https://myhost.local/"),
    /local/i,
  );
});

test("validatePublicUrl rejects multicast 224.0.0.1", () => {
  assert.throws(
    () => validatePublicUrl("https://224.0.0.1/"),
    /multicast|private|reserved/i,
  );
});

test("validatePublicUrl rejects IPv6 ULA fc00::1", () => {
  assert.throws(
    () => validatePublicUrl("https://[fc00::1]/"),
    /private|reserved|ipv6/i,
  );
});

test("fetchWithRedirectLimit follows a single redirect", async () => {
  const calls: string[] = [];
  const fetchImpl: FetchImpl = async (input) => {
    const href =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    calls.push(href);
    if (calls.length === 1) {
      return new Response(null, {
        status: 302,
        headers: { location: "https://example.com/final" },
      });
    }
    return new Response("hello world", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  };
  const result = await fetchWithRedirectLimit("https://example.com/start", {
    fetchImpl,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body, "hello world");
  assert.equal(result.redirectCount, 1);
  assert.equal(result.truncated, false);
  assert.equal(result.url, "https://example.com/final");
});

test("fetchWithRedirectLimit throws when the redirect cap is exceeded", async () => {
  const fetchImpl: FetchImpl = async () =>
    new Response(null, {
      status: 302,
      headers: { location: "https://example.com/loop" },
    });
  await assert.rejects(
    () => fetchWithRedirectLimit("https://example.com/start", { fetchImpl }),
    /redirect/i,
  );
});

test("fetchWithRedirectLimit truncates a body larger than MAX_BODY_BYTES", async () => {
  assert.ok(
    ALLOWED_PORTS.includes(443),
    "sanity check: 443 is in ALLOWED_PORTS",
  );
  const bigBody = "A".repeat(MAX_BODY_BYTES + 5_000);
  const fetchImpl: FetchImpl = async () =>
    new Response(bigBody, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  const result = await fetchWithRedirectLimit("https://example.com/", {
    fetchImpl,
  });
  assert.equal(result.truncated, true);
  assert.equal(result.bytes, MAX_BODY_BYTES);
  assert.equal(result.body.length, MAX_BODY_BYTES);
});

test("deadline includes a stalled response body and cancels it", async () => {
  let cancelled = false;
  await assert.rejects(fetchWithRedirectLimit("https://example.com", { timeoutMs: 25,
    fetchImpl: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } })),
  }), /timed out/);
  assert.equal(cancelled, true);
});

test("deadline covers headers even when a fetch implementation ignores abort", async () => {
  await assert.rejects(fetchWithRedirectLimit("https://example.com", { timeoutMs: 25,
    fetchImpl: () => new Promise(() => {}),
  }), /timed out/);
});

test("redirects share one deadline and their bodies are cancelled", async () => {
  let calls = 0;
  let cancelled = 0;
  await assert.rejects(fetchWithRedirectLimit("https://example.com", { timeoutMs: 35,
    fetchImpl: async () => {
      calls++;
      if (calls > 1) return new Promise(() => {});
      await new Promise(resolve => setTimeout(resolve, 10));
      return new Response(new ReadableStream({ cancel() { cancelled++; } }), { status: 302, headers: { location: "/next" } });
    },
  }), /timed out/);
  assert.equal(calls, 2);
  assert.equal(cancelled, 1);
});

test("redirect to mapped private address is rejected before a second fetch", async () => {
  let calls = 0;
  await assert.rejects(fetchWithRedirectLimit("https://example.com", { fetchImpl: async () => {
    calls++;
    return new Response(null, { status: 302, headers: { location: "http://[::ffff:127.0.0.1]/" } });
  } }));
  assert.equal(calls, 1);
});

test("overflow cleanup cannot hang and chunked content stays bounded", async () => {
  const body = new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode("abcdef"));
  }, cancel() { return new Promise(() => {}); } });
  const result = await fetchWithRedirectLimit("https://example.com", { maxBodyBytes: 4, timeoutMs: 100, fetchImpl: async () => new Response(body) });
  assert.equal(result.body, "abcd");
  assert.equal(result.truncated, true);
});

test("UTF-8 truncation does not introduce a replacement character or exceed the byte cap", async () => {
  for (const split of [false, true]) {
    const encoded = new TextEncoder().encode("abc🚀def");
    const body = new ReadableStream({ start(controller) {
      if (split) {
        controller.enqueue(encoded.subarray(0, 5));
        controller.enqueue(encoded.subarray(5));
      } else controller.enqueue(encoded);
      controller.close();
    } });
    const result = await fetchWithRedirectLimit("https://example.com", { maxBodyBytes: 5, fetchImpl: async () => new Response(body) });
    assert.equal(result.body, "abc");
    assert.equal(result.bytes, 5);
    assert.equal(result.truncated, true);
  }
});
