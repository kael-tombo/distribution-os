CREATE TABLE `campaign_objectives` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`brief_id` text NOT NULL,
	`objective_json` text NOT NULL,
	`mode` text NOT NULL,
	`confirmed_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`brief_id`) REFERENCES `campaign_brief_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_objective_brief_idx` ON `campaign_objectives` (`brief_id`);--> statement-breakpoint
CREATE INDEX `campaign_objective_workspace_idx` ON `campaign_objectives` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `campaign_planning_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`job_id` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`result_json` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `campaign_planning_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_planning_attempt_idx` ON `campaign_planning_attempts` (`job_id`,`attempt_number`);--> statement-breakpoint
CREATE INDEX `campaign_planning_attempt_workspace_idx` ON `campaign_planning_attempts` (`workspace_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `campaign_planning_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`objective_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`claim_token` text,
	`lease_expires_at` integer,
	`error` text,
	`result_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`objective_id`) REFERENCES `campaign_objectives`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_planning_objective_idx` ON `campaign_planning_jobs` (`objective_id`);--> statement-breakpoint
CREATE INDEX `campaign_planning_workspace_idx` ON `campaign_planning_jobs` (`workspace_id`,`created_at`);