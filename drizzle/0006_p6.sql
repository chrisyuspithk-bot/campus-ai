CREATE TABLE `app_listings` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text,
	`title` text NOT NULL,
	`emoji` text DEFAULT '🧩' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`audience` text DEFAULT 'all' NOT NULL,
	`html` text DEFAULT '' NOT NULL,
	`published_html` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`review_note` text DEFAULT '' NOT NULL,
	`submitted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `apps_status_idx` ON `app_listings` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `apps_owner_idx` ON `app_listings` (`owner_id`);--> statement-breakpoint
CREATE TABLE `practice_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`subject` text NOT NULL,
	`topic` text DEFAULT '' NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`start_level` integer DEFAULT 1 NOT NULL,
	`current_qid` text,
	`steps` text DEFAULT '[]' NOT NULL,
	`target` integer DEFAULT 8 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `practice_student_idx` ON `practice_sessions` (`student_id`,`subject`,`topic`,`updated_at`);--> statement-breakpoint
CREATE TABLE `video_views` (
	`video_id` text NOT NULL,
	`user_id` text NOT NULL,
	`viewed_at` integer NOT NULL,
	PRIMARY KEY(`video_id`, `user_id`),
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `videos` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text,
	`subject` text NOT NULL,
	`topic` text DEFAULT '' NOT NULL,
	`level` text DEFAULT '' NOT NULL,
	`title` text NOT NULL,
	`script` text DEFAULT '' NOT NULL,
	`scenes` text DEFAULT '[]' NOT NULL,
	`key_points` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'script' NOT NULL,
	`render_info` text DEFAULT '' NOT NULL,
	`rendered_at` integer,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `videos_owner_idx` ON `videos` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `videos_status_idx` ON `videos` (`status`,`subject`);