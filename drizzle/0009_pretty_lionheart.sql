CREATE TABLE `execution_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`attempt_id` text NOT NULL,
	`submission_number` integer NOT NULL,
	`request_count` integer DEFAULT 1 NOT NULL,
	`projected_cost_cents` integer NOT NULL,
	`started_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attempt_id`) REFERENCES `action_execution_attempts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `execution_submissions_attempt_number_unique` ON `execution_submissions` (`attempt_id`,`submission_number`);--> statement-breakpoint
CREATE INDEX `execution_submissions_workspace_started_idx` ON `execution_submissions` (`workspace_id`,`started_at`);
--> statement-breakpoint
-- Preserve legacy accepted/pending costs in their original submission period.
-- Claimed rows have not submitted yet; legacy request counts are conservative.
INSERT INTO execution_submissions (id, workspace_id, attempt_id, submission_number, request_count, projected_cost_cents, started_at)
SELECT 'legacy_' || a.id, a.workspace_id, a.id, a.attempt_count, a.attempt_count,
  CASE WHEN json_valid(q.payload_json) THEN COALESCE(json_extract(q.payload_json, '$.projected_cost_cents'), 0) ELSE 0 END,
  a.started_at
FROM action_execution_attempts a JOIN action_queue q ON q.id = a.action_id AND q.workspace_id = a.workspace_id
WHERE a.status != 'claimed';
