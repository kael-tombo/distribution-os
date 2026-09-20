"use client";

import { useEffect, useState } from "react";
import {
  CircleAlert,
  Database,
  Globe2,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "./empty-state";
import type { ProductSource } from "../../lib/product-extraction";

type SavedSource = ProductSource & { id: string; content_hash: string };

export function SavedProductSourceCard({ source }: { source: SavedSource }) {
  return <article className="ws-card" aria-label="Saved product source">
    <h3>Saved website content</h3>
    <p>This is text captured from the website, separate from generated or simulated analysis.</p>
    <h4>{source.title}</h4>
    <dl style={{ overflowWrap: "anywhere" }}>
      <dt>Submitted URL</dt><dd>{source.original_url}</dd>
      <dt>Retrieved URL</dt><dd>{source.final_url}</dd>
      <dt>Captured</dt><dd><time dateTime={new Date(source.fetched_at).toISOString()}>{new Date(source.fetched_at).toISOString()}</time></dd>
    </dl>
    <ul>{source.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
    <details open>
      <summary>Read saved product text</summary>
      <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{source.body}</p>
    </details>
    <details><summary>Source provenance</summary>
      <p style={{ overflowWrap: "anywhere" }}>SHA-256: {source.content_hash}</p>
      <p>Extractor: {source.parser_version}. Region: {source.method}.</p>
    </details>
  </article>;
}

function SavedProductSource({ missionId }: { missionId: string }) {
  const [state, setState] = useState<{ source?: SavedSource | null; error?: string }>({});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/mission?source=1&mission_id=${encodeURIComponent(missionId)}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Saved website content could not be loaded.");
        return await response.json() as { source: SavedSource | null };
      }).then(data => { if (!controller.signal.aborted) setState(data); })
      .catch(() => { if (!controller.signal.aborted) setState({ error: "Saved website content could not be loaded." }); });
    return () => controller.abort();
  }, [missionId, retry]);
  if (state.error) return <div role="alert" className="ws-error">{state.error} <Button variant="outline" onClick={() => { setState({}); setRetry(value => value + 1); }}>Retry source</Button></div>;
  if (state.source === undefined) return <p role="status">Loading saved website content…</p>;
  if (!state.source) return <p>No saved product text is available for this mission. Submit the product URL again to capture its current content.</p>;
  return <SavedProductSourceCard source={state.source} />;
}

type EvidenceState =
  | "observed"
  | "inferred"
  | "needed"
  | "verified"
  | "contradicted"
  | "stale"
  | "rejected";

type EvidenceSource =
  | "website"
  | "email"
  | "social"
  | "crm"
  | "analytics"
  | "payment"
  | "document"
  | "manual";

type EvidenceRow = {
  id: string;
  mission_id: string;
  source_url: string | null;
  source_type: EvidenceSource;
  content_hash: string;
  title: string;
  summary: string;
  state: EvidenceState;
  contradiction_of_id: string | null;
  created_at: number;
  updated_at: number;
};

type EvidenceResponse = { evidence?: EvidenceRow[]; error?: string };
type EvidenceMutationResponse = { evidence?: EvidenceRow; error?: string };

const stateLabel: Record<EvidenceState, string> = {
  observed: "Observed",
  inferred: "Inferred",
  needed: "Needed",
  verified: "Verified",
  contradicted: "Contradicted",
  stale: "Stale",
  rejected: "Rejected",
};

const sourceLabel: Record<EvidenceSource, string> = {
  website: "Website",
  email: "Email",
  social: "Social",
  crm: "CRM",
  analytics: "Analytics",
  payment: "Payment",
  document: "Document",
  manual: "Manual",
};

export function EvidencePanel({ missionId }: { missionId: string }) {
  const [items, setItems] = useState<EvidenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [sourceType, setSourceType] = useState<EvidenceSource>("manual");
  const [sourceUrl, setSourceUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/missions/${missionId}/evidence`);
        const data = (await response.json()) as EvidenceResponse;
        if (cancelled) return;
        if (response.ok && data.evidence) {
          setItems(data.evidence);
        } else {
          setError(data.error || "Failed to load evidence");
        }
      } catch {
        if (!cancelled) setError("Network error while loading evidence");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [missionId]);

  async function reload(): Promise<void> {
    try {
      const response = await fetch(`/api/missions/${missionId}/evidence`);
      const data = (await response.json()) as EvidenceResponse;
      if (response.ok && data.evidence) setItems(data.evidence);
    } catch {
      // background reloads are non-fatal
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !summary.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/missions/${missionId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          summary: summary.trim(),
          source_type: sourceType,
          source_url: sourceUrl.trim() || null,
        }),
      });
      const data = (await response.json()) as EvidenceMutationResponse;
      if (!response.ok || !data.evidence) {
        throw new Error(data.error || "Evidence creation failed");
      }
      setTitle("");
      setSummary("");
      setSourceUrl("");
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Evidence creation failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="ws-panel workspace-evidence-panel">
      <header className="ws-panel-head">
        <div>
          <p className="section-label">
            <Database /> Evidence ledger
          </p>
          <h2>Durable proof for every claim</h2>
          <p className="ws-panel-lede">
            Evidence moves through seven states, from <em>observed</em> to{" "}
            <em>verified</em>. Contradictions stay linked to the original record.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void reload()}>
          <RefreshCw /> Refresh
        </Button>
      </header>

      <SavedProductSource key={missionId} missionId={missionId} />

      <form className="ws-form" onSubmit={submit}>
        <Input
          aria-label="Evidence title"
          placeholder="What did the agent observe?"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
        <Input
          aria-label="Evidence summary"
          placeholder="One-line summary that supports the claim"
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          required
        />
        <div className="ws-form-row">
          <select
            aria-label="Source type"
            value={sourceType}
            onChange={(event) => setSourceType(event.target.value as EvidenceSource)}
          >
            {(Object.keys(sourceLabel) as EvidenceSource[]).map((key) => (
              <option key={key} value={key}>
                {sourceLabel[key]}
              </option>
            ))}
          </select>
          <Input
            aria-label="Source URL"
            type="url"
            placeholder="https://source-url (optional)"
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
          />
          <Button type="submit" disabled={submitting}>
            {submitting ? <LoaderCircle className="animate-spin" /> : <Plus />}
            Record evidence
          </Button>
        </div>
      </form>

      {error && (
        <div className="ws-error">
          <CircleAlert /> {error}
        </div>
      )}

      {loading ? (
        <div className="ws-empty">
          <LoaderCircle className="animate-spin" /> Loading evidence…
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Database}
          title="No evidence recorded yet"
          description="Capture the first observation above — every claim flows through the seven-state evidence ledger."
        />
      ) : (
        <div className="ws-cards">
          {items.map((item) => (
            <article key={item.id} className="ws-card evidence-card">
              <header>
                <span
                  className={`evidence-state-pill evidence-state-${item.state}`}
                >
                  {stateLabel[item.state]}
                </span>
                <span className={`evidence-source-pill evidence-source-${item.source_type}`}>
                  {sourceLabel[item.source_type]}
                </span>
              </header>
              <h3>{item.title}</h3>
              <p>{item.summary}</p>
              <footer className="ws-card-foot">
                <small>
                  <Globe2 /> {item.source_url || "no source url"}
                </small>
                <small>{new Date(item.created_at).toLocaleString()}</small>
              </footer>
              {item.contradiction_of_id && (
                <p className="ws-contradiction">
                  <Search /> Contradicts {item.contradiction_of_id}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
