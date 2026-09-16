export type MissionDestination = "evidence" | "experiments" | "actions" | "revenue";

export type MissionNextStep = {
  title: string;
  reason: string;
  result: string;
  label: string;
  destination: MissionDestination;
};

/** Navigation guidance, never authorization to execute or a revenue forecast. */
export function getMissionNextStep(summary: {
  current_stage: string;
  payment_count: number;
  open_experiment_count: number;
  can_advance: boolean;
}): MissionNextStep {
  if (summary.payment_count > 0) return {
    title: "Inspect the payment and its attribution",
    reason: "A successful Stripe payment is recorded for this mission. Association alone does not prove the experiment caused it.",
    result: "Confirm the payment source and review the available attribution before repeating the experiment.",
    label: "Review payment evidence", destination: "revenue",
  };
  switch (summary.current_stage) {
    case "observe": return {
      title: "Check the evidence behind your offer",
      reason: "Website observations and generated assumptions need different levels of trust.",
      result: "Identify which claim needs customer evidence before choosing an experiment.",
      label: "Review mission evidence", destination: "evidence",
    };
    case "decide": return {
      title: "Choose a test with a clear success signal",
      reason: "A draft plan is useful when its hypothesis can be disproved.",
      result: "Review the experiment's success metric and kill rule before preparing outreach.",
      label: "Review experiments", destination: "experiments",
    };
    case "approve": return {
      title: summary.can_advance ? "Review the approved action before execution" : "Review one exact action for approval",
      reason: "Approval applies to one payload and expiry. It does not prove the provider is configured or that an email was sent.",
      result: "Inspect the recipient, message and sending constraints in the action queue.",
      label: "Open action queue", destination: "actions",
    };
    case "act": return {
      title: summary.can_advance ? "Inspect the provider receipt" : "Resolve the next email execution",
      reason: "A provider receipt proves submission. Delivery and customer response require separate evidence.",
      result: "Review the exact action, any blocker, and its saved execution attempt before proceeding.",
      label: "Review execution", destination: "actions",
    };
    case "measure": return summary.open_experiment_count === 0 ? {
      title: "Open an experiment to interpret the result",
      reason: "A signal needs a hypothesis and a success criterion to support a decision.",
      result: "Review or create an experiment, then compare its metric with external evidence.",
      label: "Review experiments", destination: "experiments",
    } : {
      title: summary.can_advance ? "Compare the observed signal with your hypothesis" : "Wait for an external result",
      reason: "Signed delivery, engagement or failure events can inform learning. Drafts, assumptions and submission receipts cannot.",
      result: "Inspect the signal; delivery is not a reply, and a click is not a payment.",
      label: "Review result evidence", destination: "evidence",
    };
    case "learn": return {
      title: "Decide whether to continue, change or stop",
      reason: "A completed cycle is learning activity; the first payment remains unproven.",
      result: "Compare the result with the success metric and kill rule before starting another cycle.",
      label: "Review experiment results", destination: "experiments",
    };
    default: return {
      title: "Review the mission state",
      reason: "The current stage is unavailable. No next-stage readiness can be inferred.",
      result: "Refresh the mission and inspect its evidence before continuing.",
      label: "Review evidence", destination: "evidence",
    };
  }
}
