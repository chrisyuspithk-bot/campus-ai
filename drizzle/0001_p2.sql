CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_id` text,
	`actor_name` text DEFAULT '' NOT NULL,
	`actor_role` text DEFAULT '' NOT NULL,
	`action` text NOT NULL,
	`target` text DEFAULT '' NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_action_idx` ON `audit_logs` (`action`);--> statement-breakpoint
CREATE TABLE `create_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`kind` text DEFAULT 'poster' NOT NULL,
	`html` text DEFAULT '' NOT NULL,
	`messages` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `create_owner_idx` ON `create_projects` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `essay_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`essay_id` text NOT NULL,
	`version` integer NOT NULL,
	`content` text NOT NULL,
	`feedback` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`essay_id`) REFERENCES `essays`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `essay_versions_idx` ON `essay_versions` (`essay_id`,`version`);--> statement-breakpoint
CREATE TABLE `essays` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`title` text NOT NULL,
	`subject` text DEFAULT 'chinese' NOT NULL,
	`genre` text DEFAULT 'narrative' NOT NULL,
	`prompt` text DEFAULT '' NOT NULL,
	`word_target` integer DEFAULT 400 NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`teacher_id` text,
	`teacher_scores` text,
	`teacher_grade` text,
	`teacher_comment` text DEFAULT '' NOT NULL,
	`submitted_at` integer,
	`returned_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`teacher_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `essays_student_idx` ON `essays` (`student_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `essays_status_idx` ON `essays` (`status`);--> statement-breakpoint
CREATE TABLE `library_items` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`title` text NOT NULL,
	`folder` text DEFAULT '' NOT NULL,
	`data` text,
	`text` text DEFAULT '' NOT NULL,
	`ref_id` text,
	`filename` text,
	`mime` text,
	`size` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `library_owner_idx` ON `library_items` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `policy_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`pattern` text NOT NULL,
	`is_regex` integer DEFAULT false NOT NULL,
	`action` text DEFAULT 'flag' NOT NULL,
	`level` text DEFAULT 'medium' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `safety_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`level` text NOT NULL,
	`category` text NOT NULL,
	`source` text NOT NULL,
	`matched` text DEFAULT '' NOT NULL,
	`excerpt` text DEFAULT '' NOT NULL,
	`model_id` text,
	`blocked` integer DEFAULT false NOT NULL,
	`ref_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`handled_by` text,
	`handled_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `safety_status_idx` ON `safety_cases` (`status`,`created_at`);