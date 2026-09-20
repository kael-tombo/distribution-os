/** Only signed provider observations or successful payments unlock learning.
 * Internal notes, inferred evidence and API acceptance are not market feedback.
 * Both the command gate and the read projection use this exact query.
 */
export const MISSION_MEASUREMENT_SIGNALS_SQL = `SELECT
  (SELECT COUNT(*) FROM provider_webhook_events AS event
    JOIN action_queue AS action ON action.id = event.action_id
      AND action.workspace_id = event.workspace_id
    WHERE event.workspace_id = ? AND action.mission_id = ?
      AND event.provider = 'resend'
      AND event.event_type IN ('email.delivered', 'email.bounced', 'email.failed',
        'email.opened', 'email.clicked', 'email.complained', 'email.suppressed'))
  + (SELECT COUNT(*) FROM payments
    WHERE workspace_id = ? AND mission_id = ? AND provider = 'stripe'
      AND status = 'succeeded') AS count`;
