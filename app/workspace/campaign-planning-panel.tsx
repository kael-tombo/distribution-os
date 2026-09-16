"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Download, LoaderCircle, RefreshCw, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BriefRevision } from "@/lib/campaign-brief";
import { exportCampaignPlan, objectiveSchema, planningRecordSchema, planningSnapshotSchema, type Objective, type PlanningMode, type PlanningRecord } from "@/lib/campaign-planning-pure";

async function readResponse(response: Response) {
  const data: unknown = await response.json();
  if (!response.ok) throw new Error(data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "Planning could not be updated. Refresh its saved state.");
  return data;
}

export function ObjectiveReadback({ objective }: { objective: Objective }) {
  return <dl className="objective-readback">
    <div><dt>Measure</dt><dd>{objective.metric}</dd></div>
    <div><dt>Target</dt><dd>{objective.direction === "increase" ? "Increase" : "Decrease"} to {objective.target} {objective.unit}</dd></div>
    <div><dt>Owner-reported baseline</dt><dd>{objective.baseline === null ? "Unknown — collect before evaluating change" : `${objective.baseline} ${objective.unit}`}</dd></div>
    <div><dt>Evaluation window</dt><dd>{objective.start_date} → {objective.end_date} (calendar dates)</dd></div>
    <div><dt>Measurement source</dt><dd>{objective.source}</dd></div>
    <div><dt>Guardrails</dt><dd>{objective.guardrails}</dd></div>
    <div><dt>Attribution limits</dt><dd>{objective.attribution_limits}</dd></div>
  </dl>;
}

function ObjectiveForm({ brief, disabled, aiAvailable, onConfirm, busy }: {
  brief: BriefRevision; disabled: boolean; aiAvailable: boolean; busy: boolean;
  onConfirm: (objective: Objective, mode: PlanningMode) => Promise<void>;
}) {
  const [direction, setDirection] = useState<"increase" | "decrease">("increase");
  const [mode, setMode] = useState<PlanningMode>("checklist");
  const [review, setReview] = useState<Objective | null>(null);
  const [error, setError] = useState("");
  function reviewObjective(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) ?? "").trim();
    const parsed = objectiveSchema.safeParse({
      metric: value("metric"), unit: value("unit"), direction,
      baseline: value("baseline") === "" ? null : Number(value("baseline")), target: Number(value("target")),
      source: value("source"), start_date: value("start_date"), end_date: value("end_date"),
      guardrails: value("guardrails"), attribution_limits: value("attribution_limits"),
    });
    if (!parsed.success) { setError(parsed.error.issues.map(issue => issue.message).join(" ")); return; }
    setError(""); setReview(parsed.data);
  }
  return <section className="os-panel objective-form">
    <div className="planning-section-heading"><span className="planning-step">02</span><div><h2>Define a measurable outcome</h2><p>Make the success measure precise before asking for a plan.</p></div></div>
    <p className="brief-note">From brief revision {brief.revision}: {brief.brief.success_measure}</p>
    {disabled && <p role="status" className="brief-feedback">Save your brief changes before confirming an objective.</p>}
    {error && <p role="alert" className="brief-feedback">{error}</p>}
    <form onSubmit={reviewObjective} hidden={Boolean(review)}>
      <fieldset disabled={disabled || busy} className="brief-fields">
        <div className="objective-grid">
          <label>Metric <Input name="metric" required maxLength={200} placeholder="Qualified demo requests"/></label>
          <label>Unit <Input name="unit" required maxLength={80} placeholder="requests"/></label>
          <label>Direction <Select value={direction} onValueChange={value => setDirection(value as typeof direction)}><SelectTrigger aria-label="Target direction"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="increase">Increase</SelectItem><SelectItem value="decrease">Decrease</SelectItem></SelectContent></Select></label>
          <label>Target <Input name="target" type="number" required min={0} max={1e12} step="any" placeholder="10"/></label>
          <label>Baseline (optional) <Input name="baseline" type="number" min={0} max={1e12} step="any" placeholder="Leave blank if unknown"/></label>
          <label>Measurement source <Input name="source" required maxLength={500} placeholder="CRM report or analytics event"/></label>
          <label>Start date <Input name="start_date" type="date" required/></label>
          <label>End date <Input name="end_date" type="date" required/></label>
        </div>
        <p className="brief-note">A baseline is owner-reported until checked against its source. Dates define a measurement window, not a publishing schedule.</p>
        <label>Guardrails <Textarea name="guardrails" required maxLength={1500} placeholder="What must remain true? For example: count only opted-in, qualified leads."/></label>
        <label>Attribution limits <Textarea name="attribution_limits" required maxLength={1000} placeholder="What can this measurement establish, and what can it not establish?"/></label>
        <label>Planning method <Select value={mode} onValueChange={value => setMode(value as PlanningMode)}><SelectTrigger aria-label="Planning method"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="checklist">Preparation checklist — no AI request</SelectItem><SelectItem value="ai" disabled={!aiAvailable}>AI strategy proposal{!aiAvailable ? " — unavailable" : ""}</SelectItem></SelectContent></Select></label>
        <p className="brief-note">{mode === "ai" ? "Preparing this plan sends the saved brief and objective to the configured AI provider and uses its API allowance. Production and publication are separate." : "Organize the next preparation steps using your instructions. This mode does not call a model or predict results."}</p>
        <Button type="submit"><Target/>Review objective</Button>
      </fieldset>
    </form>
    {review && <div className="objective-confirmation">
      <h3>Confirm the exact objective</h3><p>{brief.brief.product} · Brief revision {brief.revision} · {mode === "ai" ? "AI strategy proposal" : "Preparation checklist"}</p>
      <ObjectiveReadback objective={review}/>
      <p className="brief-note">Confirmation saves this objective and a queued planning job. It does not run the planner, commission content, spend a production budget or authorize publication.</p>
      <div className="brief-actions"><Button disabled={busy || disabled} onClick={() => void onConfirm(review, mode)}>{busy ? <LoaderCircle className="animate-spin"/> : <CheckCircle2/>}Confirm objective</Button><Button variant="outline" disabled={busy} onClick={() => setReview(null)}>Edit objective</Button></div>
    </div>}
  </section>;
}

export function CampaignPlanCard({ record, busy, now, onAction }: {
  record: PlanningRecord; busy: boolean; now: number;
  onAction: (record: PlanningRecord, action: "run" | "retry" | "cancel") => void;
}) {
  const interrupted = record.status === "running" && record.lease_expires_at !== null && record.lease_expires_at <= now;
  const retryable = record.status === "failed" || interrupted;
  const status = interrupted ? "Interrupted — review before retrying" : ({ queued: "Ready to prepare", running: "Preparing your plan", completed: "Plan ready for review", failed: "Needs attention", cancelled: "Planning cancelled" })[record.status];
  function download() {
    const url = URL.createObjectURL(new Blob([exportCampaignPlan(record)], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `campaign-plan-brief-${record.brief_revision}.txt`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <article className="os-panel campaign-plan-card">
    <div className="planning-section-heading"><span className="planning-step">03</span><div><h2>{record.brief.product}</h2><p>Brief revision {record.brief_revision} · {record.mode === "ai" ? "AI proposal · unverified inference" : "Preparation checklist · no model used"}</p></div><span className={`planning-status planning-status-${record.status}`} role="status">{status}</span></div>
    <details className="objective-details"><summary>Confirmed objective: {record.objective.metric}</summary><ObjectiveReadback objective={record.objective}/></details>
    {record.error && <p className="brief-feedback" role="alert">{record.error}</p>}
    {interrupted && <p className="brief-feedback">The saved attempt stopped reporting before a result was recorded. An AI request may have incurred usage. A retry starts a new attempt; a late result from the old attempt will not replace it.</p>}
    {record.status === "queued" && <p>Your objective is saved. Prepare the plan when you are ready; there is no automatic background dispatch.</p>}
    {record.status === "cancelled" && <p>To plan again with these instructions, use “Save as new revision” in the brief editor, then confirm a new objective.</p>}
    {record.status === "running" && !interrupted && <p><LoaderCircle className="inline animate-spin" size={16}/> This request is in progress. You can refresh its saved status. If interrupted, recovery becomes available after two minutes.</p>}
    {record.result && <div className="campaign-plan-result">
      <p className="plan-summary">{record.result.plan.summary}</p>
      <div className="plan-hypothesis"><strong>Hypothesis to test</strong><p>{record.result.plan.hypothesis}</p></div>
      <div className="plan-channel-grid">{record.result.plan.channels.map(item => <section key={item.channel}><header><h3>{item.channel}</h3><span>Access not verified</span></header><p>{item.rationale}</p><h4>Production intent</h4><p>{item.production_brief}</p></section>)}</div>
      <div className="plan-evidence-grid"><section><h3>Measurement tasks</h3><ul>{record.result.plan.measurement_tasks.map((item, index) => <li key={index}>{item}</li>)}</ul></section><section><h3>Unknowns to resolve</h3><ul>{record.result.plan.unknowns.map((item, index) => <li key={index}>{item}</li>)}</ul></section></div>
      <div className="plan-next-decision"><ArrowRight/><div><h3>Next decision</h3><p>{record.result.plan.next_decision}</p></div></div>
      <p className="brief-note">Planning result only. No specialist job, account connection, production spend or publication is established by this plan.</p>
    </div>}
    <div className="brief-actions">
      {record.status === "queued" && <Button disabled={busy} onClick={() => onAction(record, "run")}>{busy ? <LoaderCircle className="animate-spin"/> : <ArrowRight/>}{record.mode === "ai" ? "Prepare AI strategy" : "Prepare checklist"}</Button>}
      {retryable && record.attempts < 3 && <Button disabled={busy} onClick={() => {
        if (record.mode !== "ai" || window.confirm("Start a new AI attempt? The previous request may already have incurred usage.")) onAction(record, "retry");
      }}>Retry planning</Button>}
      {(record.status === "queued" || retryable) && <Button disabled={busy} variant="outline" onClick={() => onAction(record, "cancel")}>Cancel planning</Button>}
      {record.result && <Button variant="outline" onClick={download}><Download/>Download reviewed inputs and plan</Button>}
    </div>
    <p className="brief-note">{record.attempts} of 3 attempts used · Updated {new Date(record.updated_at).toLocaleString()}{record.attempts >= 3 && retryable ? ". Attempt limit reached. Review the failure, then use “Save as new revision” in the brief editor before planning again." : ""}</p>
  </article>;
}

export function CampaignPlanningPanel({ brief, briefDirty }: { brief: BriefRevision | null; briefDirty: boolean }) {
  const [snapshot, setSnapshot] = useState<ReturnType<typeof planningSnapshotSchema.parse> | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setRefresh(value => value + 1), 3000);
    return () => clearInterval(timer);
  }, [busy]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      try {
        const data = planningSnapshotSchema.parse(await readResponse(await fetch("/api/campaign-plans", { signal: controller.signal })));
        if (controller.signal.aborted) return;
        setSnapshot(data); setNow(Date.now()); setError("");
        if (data.records.some(record => record.status === "running")) timer = setTimeout(load, 5000);
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Planning could not be loaded."); }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [refresh]);

  async function mutate(path: string, body: unknown) {
    setBusy(true); setError("");
    try {
      const response = await readResponse(await fetch(path, { method: "POST", signal: AbortSignal.timeout(75_000), headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
      const record = planningRecordSchema.parse((response as { record: unknown }).record);
      setSnapshot(previous => previous ? { ...previous, records: [record, ...previous.records.filter(item => item.id !== record.id)].sort((a, b) => b.created_at - a.created_at).slice(0, 20) } : previous);
      setNow(Date.now()); setRefresh(value => value + 1);
    } catch (error) { setError(error instanceof Error ? error.message : "Planning could not be updated. Refresh before retrying."); }
    finally { setBusy(false); }
  }
  const current = snapshot?.records.find(record => record.brief_revision === brief?.revision);
  return <section className="campaign-planning" aria-label="Campaign objective and plan">
    <div className="planning-toolbar"><div><h2>From brief to a reviewable plan</h2><p>Confirm the outcome. Prepare the strategy. Resolve the next decision.</p></div><Button variant="outline" disabled={busy} onClick={() => setRefresh(value => value + 1)}><RefreshCw/>Refresh plans</Button></div>
    {error && <p className="brief-feedback" role="alert">{error}</p>}
    {!snapshot && !error && <p role="status">Loading saved planning jobs…</p>}
    {snapshot && <>
      {snapshot.ai_blocker && <p className="brief-note">{snapshot.ai_blocker}</p>}
      {!brief && <div className="os-panel planning-empty"><Target/><h3>Start with a saved brief</h3><p>Your saved instructions become the source for an objective and a plan. No website or connected account is required.</p></div>}
      {brief && !current && <ObjectiveForm key={brief.revision} brief={brief} disabled={briefDirty || Boolean(error)} busy={busy} aiAvailable={snapshot.ai_available} onConfirm={(objective, mode) => mutate("/api/campaign-plans", { brief_revision: brief.revision, objective, mode })}/>}
      {snapshot.records.map(record => <CampaignPlanCard key={record.id} record={record} busy={busy || Boolean(error)} now={now} onAction={(record, action) => void mutate(`/api/campaign-plans/${encodeURIComponent(record.id)}`, { action, expected_attempts: record.attempts })}/>)}
    </>}
  </section>;
}
