import { z } from "zod";
import { fetchWithRedirectLimit, validatePublicUrl, type FetchWithRedirectLimitResult } from "./url-safety";

export const EXTRACTION_VERSION = "product-source-v1";
export const SOURCE_TEXT_BYTES = 8_000;
const byteLength = (value: string) => new TextEncoder().encode(value).length;

export class IntakeError extends Error {
  constructor(public code: string, message: string, public httpStatus = 400, public retryable = false) {
    super(message);
  }
}

const publicUrl = z.string().max(2000).refine(value => {
  try { validatePublicUrl(value); return true; } catch { return false; }
});
export const productSourceSchema = z.object({
  original_url: publicUrl, final_url: publicUrl,
  title: z.string().min(1).max(300), description: z.string().max(2000),
  body: z.string().min(1).refine(value => byteLength(value) <= SOURCE_TEXT_BYTES),
  fetched_at: z.number().int().nonnegative(), parser_version: z.literal(EXTRACTION_VERSION),
  truncated: z.boolean(), method: z.enum(["main", "article", "body"]),
  warnings: z.array(z.string().max(300)).max(10),
}).strict();
export type ProductSource = z.infer<typeof productSourceSchema>;
export const extractionEnvelopeSchema = z.object({
  status: z.literal("success"), confidence: z.number().min(0).max(1),
  result: productSourceSchema,
  assumptions: z.array(z.string()), sources: z.array(z.object({ url: publicUrl })),
  warnings: z.array(z.string()), next_action: z.literal("human_review"),
}).strict();

function boundedText(value: string, maxBytes: number) {
  let result = "";
  let bytes = 0;
  for (const character of value) {
    bytes += byteLength(character);
    if (bytes > maxBytes) break;
    result += character;
  }
  return result;
}

function entities(value: string) {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", reg: "®", ndash: "–", mdash: "—", hellip: "…" };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (!entity.startsWith("#")) return named[entity.toLowerCase()] ?? whole;
    const n = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "�";
  });
}

function plainText(html: string) {
  return entities(html.replace(/<[^>]*>/g, " ")).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

export function extractProductSource(originalUrl: string, response: FetchWithRedirectLimitResult, now = Date.now()) {
  if (response.status < 200 || response.status >= 300) throw new IntakeError("UPSTREAM_HTTP", "The website could not be retrieved. Check the URL or try again.", 502, true);
  if (!/^text\/html(?:\s*;|\s*$)/i.test(response.contentType)) throw new IntakeError("NOT_HTML", "Use a public HTML product page.", 422);
  const clean = response.body.replace(/<!--[\s\S]*?(?:-->|$)/g, " ")
    .replace(/<(script|style|noscript|template|iframe|svg)(?=[\s/>])[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, " ");
  const title = plainText(clean.match(/<title(?=[\s/>])[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] ?? "").slice(0, 300) || new URL(response.url).hostname;
  let description = "";
  for (const meta of clean.match(/<meta(?=[\s/>])[^>]*>/gi) ?? []) {
    const attrs: Record<string, string> = {};
    for (const match of meta.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4];
    if (/^(?:description|og:description)$/i.test(attrs.name ?? attrs.property ?? "")) { description = plainText(attrs.content ?? "").slice(0, 2000); break; }
  }
  // Page headers can contain the product promise, including outside main/article.
  const readableText = (region: string) => plainText(region.replace(/<(nav|footer|aside)(?=[\s/>])[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, " "));
  let method: ProductSource["method"] = "body";
  let text = "";
  let skippedMain = false;
  for (const tag of ["main", "article"] as const) {
    const regions = clean.matchAll(new RegExp(`<${tag}(?=[\\s/>])[^>]*>([\\s\\S]*?)(?:<\\/${tag}\\s*>|$)`, "gi"));
    for (const region of regions) {
      const candidate = readableText(region[1]);
      if (candidate.length >= 40) {
        method = tag;
        text = candidate;
        break;
      }
      if (tag === "main") skippedMain = true;
    }
    if (text) break;
  }
  if (!text) {
    const region = clean.match(/<body(?=[\s/>])[^>]*>([\s\S]*?)(?:<\/body\s*>|$)/i)?.[1]
      ?? clean.replace(/<head(?=[\s/>])[^>]*>[\s\S]*?<\/head\s*>/gi, " ");
    text = readableText(region);
  }
  if (text.length < 40) throw new IntakeError("NO_CONTENT", "Not enough readable product content. Try a public page that works without JavaScript or sign-in.", 422);
  const truncated = response.truncated || byteLength(text) > SOURCE_TEXT_BYTES;
  const warnings = ["Website claims have not been independently verified."];
  if (skippedMain) warnings.push("A main region did not contain enough readable content; another region was used.");
  if (method === "body") warnings.push("No readable main/article region found; extracted page text may include navigation or other noise.");
  if (truncated) warnings.push("Only part of the page was captured because the content limit was reached.");
  const parsed = productSourceSchema.safeParse({ original_url: originalUrl, final_url: response.url, title, description,
    body: boundedText(text, SOURCE_TEXT_BYTES), fetched_at: now, parser_version: EXTRACTION_VERSION, truncated, method, warnings });
  if (!parsed.success) throw new IntakeError("INVALID_SOURCE", "The website returned unsupported source information. Try another product page.", 502);
  const result = parsed.data;
  return extractionEnvelopeSchema.parse({ status: "success", confidence: truncated ? 0.4 : method === "body" ? 0.5 : 0.8,
    result, assumptions: ["The submitted public page represents the product."], sources: [{ url: result.final_url }], warnings, next_action: "human_review" });
}

export async function inspectProduct(rawUrl: string) {
  try { validatePublicUrl(rawUrl); } catch { throw new IntakeError("INVALID_URL", "Enter a public HTTP or HTTPS URL without credentials."); }
  let response: FetchWithRedirectLimitResult;
  try { response = await fetchWithRedirectLimit(rawUrl, { headers: { "User-Agent": "DistributionOS/0.1 website-intelligence" } }); }
  catch (error) {
    const timedOut = error instanceof Error && /timed out/i.test(error.message);
    throw new IntakeError(timedOut ? "FETCH_TIMEOUT" : "FETCH_FAILED", timedOut ? "The website took too long. Try again or use another page." : "The website could not be fetched safely. Check the URL or use another page.", timedOut ? 504 : 422, timedOut);
  }
  return extractProductSource(rawUrl, response);
}

export async function readIntakeRequest(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 2048) throw new IntakeError("REQUEST_TOO_LARGE", "The URL request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new IntakeError("INVALID_REQUEST", "Enter a product URL.");
  let bytes = 0;
  let text = "";
  const decoder = new TextDecoder();
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new IntakeError("REQUEST_TIMEOUT", "The request took too long.", 408, true)), 5000); });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2048) throw new IntakeError("REQUEST_TOO_LARGE", "The URL request is too large.", 413);
      text += decoder.decode(value, { stream: true });
    }
    try { return JSON.parse(text + decoder.decode()) as unknown; }
    catch { throw new IntakeError("INVALID_REQUEST", "Enter a valid product URL request."); }
  } finally { clearTimeout(timer!); void reader.cancel().catch(() => {}); }
}
