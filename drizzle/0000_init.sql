CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`tutor_id` text,
	`draft_id` text,
	`model_id` text,
	`pinned` integer DEFAULT false NOT NULL,
	`preview` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`tools` text DEFAULT '{"rag":false,"search":false,"image":false,"tts":false}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tutor_id`) REFERENCES `tutors`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `conversations_user_idx` ON `conversations` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`user_id` text,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_type_idx` ON `events` (`type`,`created_at`);--> statement-breakpoint
CREATE TABLE `features` (
	`key` text PRIMARY KEY NOT NULL,
	`student_enabled` integer NOT NULL,
	`teacher_enabled` integer NOT NULL,
	`phase` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`model_id` text,
	`tokens` integer DEFAULT 0 NOT NULL,
	`feedback` integer,
	`flag` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_conv_idx` ON `messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `models` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`openrouter_id` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`roles` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `quota_overrides` (
	`user_id` text PRIMARY KEY NOT NULL,
	`daily_tokens` integer NOT NULL,
	`monthly_tokens` integer NOT NULL,
	`images_per_day` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `quotas` (
	`role` text PRIMARY KEY NOT NULL,
	`daily_tokens` integer NOT NULL,
	`monthly_tokens` integer NOT NULL,
	`images_per_day` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tutor_chunks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_id` text NOT NULL,
	`tutor_id` text NOT NULL,
	`content` text NOT NULL,
	FOREIGN KEY (`file_id`) REFERENCES `tutor_files`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tutor_id`) REFERENCES `tutors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tutor_chunks_tutor_idx` ON `tutor_chunks` (`tutor_id`);--> statement-breakpoint
CREATE TABLE `tutor_files` (
	`id` text PRIMARY KEY NOT NULL,
	`tutor_id` text NOT NULL,
	`filename` text NOT NULL,
	`size` integer NOT NULL,
	`status` text NOT NULL,
	`chunk_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tutor_id`) REFERENCES `tutors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tutors` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`name_en` text DEFAULT '' NOT NULL,
	`subject` text NOT NULL,
	`emoji` text DEFAULT '📘' NOT NULL,
	`levels` text NOT NULL,
	`strategy` text DEFAULT 'strict' NOT NULL,
	`tagline` text DEFAULT '' NOT NULL,
	`blurb` text DEFAULT '' NOT NULL,
	`will` text DEFAULT '' NOT NULL,
	`wont` text DEFAULT '' NOT NULL,
	`topics` text DEFAULT '' NOT NULL,
	`system_prompt` text DEFAULT '' NOT NULL,
	`model_whitelist` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`owner_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tutors_slug_unique` ON `tutors` (`slug`);--> statement-breakpoint
CREATE TABLE `usage` (
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`tokens` integer DEFAULT 0 NOT NULL,
	`requests` integer DEFAULT 0 NOT NULL,
	`images` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `day`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`email` text,
	`role` text NOT NULL,
	`group_name` text,
	`status` text DEFAULT 'active' NOT NULL,
	`language` text DEFAULT 'zh-Hant' NOT NULL,
	`avatar` text DEFAULT '🙂' NOT NULL,
	`default_model_id` text,
	`token_version` integer DEFAULT 0 NOT NULL,
	`last_login_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);