"use client";

import { useEffect, useState } from "react";
import { ArrowRight, RefreshCw, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MissionNextStep, MissionDestination } from "@/lib/mission-next-step";

export type MissionOutcomeSnapshot = {
  mission_id: string;
  current_stage: string;
  payment_count: number;
  measurement_signal_count: number;
  synthesis_mode: "simulation" | "live";
  can_advance: boolean;
  blocking_reasons: string[];
  next_step: MissionNextStep;
};

export function MissionOutcomeCard({ summary, onNavigate }: {
  summary: MissionOutcomeSnapshot;
  onNavigate: (destination: MissionDestination) => void;
}) {
  return <>
    <div className="mission-outcome-heading">
      <div><p className="section-label"><Target /> First customer outcome</p>
        <h2>{summary.payment_count > 0 ? "A successful payment is recorded" : "First payment not yet verified"}</h2>
      </div>
      <span className="mission-outcome-mode">{summary.synthesis_mode === "simulation" ? "Plan generated in simulation" : "AI-generated plan"}</span>
    </div>
    <p className="ws-panel-lede">{summary.payment_count} successful Stripe payment(s) · {summary.measurement_signal_count} external result(s). These are separate from drafts, approvals and agent activity.</p>
    <div className="mission-outcome-next">
      <div><small>Your next step</small><h3>{summary.next_step.title}</h3>
        <p>{summary.next_step.reason}</p>
        <p><strong>Result to look for:</strong> {summary.next_step.result}</p>
      </div>
      <Button onClick={() => onNavigate(summary.next_step.destination)}>{summary.next_step.label}<ArrowRight /></Button>
    </div>
    <div className="mission-outcome-gate">
      <strong>{summary.can_advance ? "Stage gate satisfied" : "Stage advancement blocked"}</strong>
      {summary.blocking_reasons.length > 0
        ? <ul>{summary.blocking_reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
        : <p>This describes lifecycle readiness, not a probability of earning revenue.</p>}
    </div>
  </>;
}

export function MissionOutcome({ missionId, refreshKey, onNavigate }: {
  missionId: string;
  refreshKey: number;
  onNavigate: (destination: MissionDestination) => void;
}) {
  const [result, setResult] = useState<{ missionId: string; summary: MissionOutcomeSnapshot } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/missions/${encodeURIComponent(missionId)}/summary`, {
          signal: controller.signal, cache: "no-store",
        });
        const data = await response.json() as { summary?: MissionOutcomeSnapshot };
        if (!response.ok || !data.summary?.next_step || data.summary.mission_id !== missionId) {
          throw new Error("The latest mission outcome could not be loaded. Refresh to try again.");
        }
        if (!controller.signal.aborted) setResult({ missionId, summary: data.summary });
      } catch {
        if (!controller.signal.aborted) {
          setResult(null);
          setError("The latest mission outcome could not be loaded. Refresh to try again.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [missionId, refreshKey, revision]);

  const summary = result?.missionId === missionId ? result.summary : null;
  return <section className="os-panel mission-outcome" aria-label="Mission outcome and next step" aria-live="polite" aria-busy={loading}>
    <div className="mission-outcome-refresh"><Button variant="outline" size="sm" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw />Refresh outcome</Button></div>
    {loading || (!summary && !error) ? <p>Checking payment evidence and your next step…</p>
      : error ? <p role="alert">{error}</p>
      : summary ? <MissionOutcomeCard summary={summary} onNavigate={onNavigate} /> : null}
  </section>;
}
