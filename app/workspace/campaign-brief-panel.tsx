"use client";

import { useEffect, useState } from "react";
import { Download, LoaderCircle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { CampaignPlanningPanel } from "./campaign-planning-panel";
import { briefChannels, briefHistorySchema, briefSavedSchema, campaignBriefSchema, exportCampaignBrief, type BriefRevision, type CampaignBrief } from "@/lib/campaign-brief";

function responseError(data: unknown, fallback: string) {
  return data && typeof data === "object" && "error" in data && typeof data.error === "string"
    ? data.error : fallback;
}

const emptyBrief: CampaignBrief = { product: "", objective: "", audience: "", channels: [], success_measure: "", constraints: "" };

export function CampaignBriefPanel() {
  const [draft, setDraft] = useState<CampaignBrief>(emptyBrief);
  const [current, setCurrent] = useState<BriefRevision | null>(null);
  const [revisions, setRevisions] = useState<BriefRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [retry, setRetry] = useState(0);
  const dirty = JSON.stringify(draft) !== JSON.stringify(current?.brief ?? emptyBrief);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/campaign-brief", { signal: controller.signal }).then(async response => {
      const body: unknown = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(responseError(body, "Your brief could not be loaded."));
      const data = briefHistorySchema.parse(body);
      setCurrent(data.current); setRevisions(data.revisions); setDraft(data.current?.brief ?? emptyBrief);
      setLoaded(true); setConflict(false); setError("");
    }).catch(error => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Your brief could not be loaded.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save(event: React.FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    const parsed = campaignBriefSchema.safeParse(draft);
    if (!parsed.success) { setError("Complete the required fields and choose at least one channel."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/campaign-brief", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_revision: current?.revision ?? 0, brief: parsed.data }),
      });
      const data: unknown = await response.json();
      if (response.status === 409) setConflict(true);
      if (!response.ok) throw new Error(responseError(data, "Your brief could not be saved."));
      const saved = briefSavedSchema.parse(data).current;
      setCurrent(saved); setDraft(saved.brief); setRevisions(previous => [saved, ...previous].slice(0, 20));
      setNotice(`Revision ${saved.revision} saved. Your brief is ready for a human handoff.`);
    } catch (error) { setError(error instanceof Error ? error.message : "Your brief could not be saved."); }
    finally { setSaving(false); }
  }

  function download(record: BriefRevision) {
    const url = URL.createObjectURL(new Blob([exportCampaignBrief(record)], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `campaign-brief-v${record.revision}.txt`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="page-frame">
    <header><p>Campaign planning</p><h1>Turn your brief into the next decision</h1><span>Describe the campaign, confirm a measurable objective, and prepare a plan for review. Start with what you know.</span></header>
    <ol className="campaign-flow" aria-label="Campaign planning steps"><li><span>01</span>Save your brief</li><li><span>02</span>Confirm the outcome</li><li><span>03</span>Review the plan</li></ol>
    {loading ? <p role="status"><LoaderCircle className="inline animate-spin"/> Loading your brief…</p> : <>
      {error && <div role="alert" className="brief-feedback">{error}</div>}
      {(!loaded || conflict) && <Button variant="outline" onClick={() => {
        if (!dirty || window.confirm("Replace your unsaved edits with the latest saved brief?")) { setLoading(true); setNotice(""); setRetry(value => value + 1); }
      }}>{conflict ? "Load latest saved brief" : "Retry loading"}</Button>}
      {loaded && <div className="brief-layout">
        <form className="os-panel brief-form" onSubmit={save}>
          <div className="brief-status"><strong>{current ? `Saved revision ${current.revision}` : "Your first campaign brief"}</strong><span>{dirty ? "Unsaved changes" : current ? "All changes saved" : "Not saved yet"}</span></div>
          <fieldset disabled={saving} className="brief-fields">
            <label htmlFor="brief-product">Product or solution <Input id="brief-product" required maxLength={160} value={draft.product} onChange={event => setDraft({ ...draft, product: event.target.value })} placeholder="What are you marketing?"/></label>
            <label htmlFor="brief-objective">Objective <Textarea id="brief-objective" required maxLength={2000} value={draft.objective} onChange={event => setDraft({ ...draft, objective: event.target.value })} placeholder="What should this campaign achieve?"/></label>
            <label htmlFor="brief-audience">Audience <Textarea id="brief-audience" required maxLength={2000} value={draft.audience} onChange={event => setDraft({ ...draft, audience: event.target.value })} placeholder="Who needs this, and what problem do they face?"/></label>
            <fieldset className="brief-channels"><legend>Preferred channels (choose at least one)</legend><div>{briefChannels.map(channel => <label key={channel}><Checkbox checked={draft.channels.includes(channel)} onCheckedChange={checked => setDraft({ ...draft, channels: checked === true ? [...draft.channels, channel] : draft.channels.filter(item => item !== channel) })}/>{channel}</label>)}</div><p>Preferences only. Account access and publication approval are separate.</p></fieldset>
            <label htmlFor="brief-measure">Success measure <Input id="brief-measure" required maxLength={1000} value={draft.success_measure} onChange={event => setDraft({ ...draft, success_measure: event.target.value })} placeholder="For example: 10 qualified demo requests in 30 days"/></label>
            <label htmlFor="brief-constraints">Constraints and production notes <Textarea id="brief-constraints" maxLength={3000} value={draft.constraints} onChange={event => setDraft({ ...draft, constraints: event.target.value })} placeholder="Brand voice, exclusions, timing, or instructions for a specialist. Leave out passwords and API keys."/></label>
          </fieldset>
          <div className="brief-actions"><Button type="submit" disabled={saving || (!dirty && !current) || conflict}>{saving ? <LoaderCircle className="animate-spin"/> : <Save/>}{saving ? "Saving…" : current && !dirty ? "Save as new revision" : "Save brief"}</Button><Button type="button" variant="outline" disabled={!current || dirty || saving} onClick={() => current && download(current)}><Download/>Download saved brief</Button></div>
          {current && !dirty && <p className="brief-note">To change a confirmed objective or start again after cancellation, save the same brief as a new revision. Earlier objectives and plans stay in your history.</p>}
          <p role="status" className="brief-note">{notice || "Saving records your instructions. It does not start production, spend money, or publish content."}</p>
        </form>
        <aside className="os-panel brief-history"><h2>Saved revisions</h2><p>The latest 20 revisions. Download any saved version to review its original instructions.</p>{revisions.length ? <ol>{revisions.map(record => <li key={record.revision}><strong>Revision {record.revision}</strong><time dateTime={new Date(record.created_at).toISOString()}>{new Date(record.created_at).toLocaleString()}</time><p>{record.brief.objective}</p><Button type="button" variant="outline" size="sm" onClick={() => download(record)}>Download revision {record.revision}</Button></li>)}</ol> : <p>Your first saved brief will appear here.</p>}</aside>
      </div>}
      {loaded && <CampaignPlanningPanel brief={current} briefDirty={dirty}/>}
    </>}
  </section>;
}
