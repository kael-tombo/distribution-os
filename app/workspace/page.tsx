import { requireChatGPTUser } from "../chatgpt-auth";
import WorkspaceClient from "./workspace-client";

export const dynamic = "force-dynamic";

function publicWebsiteUrl(value: string | string[] | undefined) {
  if (typeof value !== "string" || value.length > 500) return "";
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ website_url?: string | string[] }> }) {
  const params = await searchParams;
  const initialUrl = publicWebsiteUrl(params.website_url);
  const returnTo = initialUrl ? `/workspace?website_url=${encodeURIComponent(initialUrl)}` : "/workspace";
  return <AuthenticatedWorkspace initialUrl={initialUrl} returnTo={returnTo} />;
}

// Vinext probes page components before supplying their real search params.
// Keep redirects in a child so the submitted website survives that probe.
async function AuthenticatedWorkspace({ initialUrl, returnTo }: { initialUrl: string; returnTo: string }) {
  const user = await requireChatGPTUser(returnTo);
  return <WorkspaceClient userId={user.userId} displayName={user.displayName} email={user.email} initialUrl={initialUrl} />;
}
