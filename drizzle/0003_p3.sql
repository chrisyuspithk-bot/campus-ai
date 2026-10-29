CREATE TABLE `alert_dismissals` (
	`teacher_id` text NOT NULL,
	`key` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`teacher_id`, `key`),
	FOREIGN KEY (`teacher_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`teacher_id` text,
	`class_id` text NOT NULL,
	`paper_id` text,
	`title` text NOT NULL,
	`kind` text DEFAULT 'quiz' NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`file_id` text,
	`file_name` text,
	`due_at` integer NOT NULL,
	`duration_min` integer,
	`lock_ai` integer DEFAULT false NOT NULL,
	`shuffle` integer DEFAULT false NOT NULL,
	`allow_review` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`teacher_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paper_id`) REFERENCES `papers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `assignments_class_idx` ON `assignments` (`class_id`,`due_at`);--> statement-breakpoint
CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`assignment_id` text NOT NULL,
	`student_id` text NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`answers` text DEFAULT '{}' NOT NULL,
	`blur_count` integer DEFAULT 0 NOT NULL,
	`score` integer,
	`max_score` integer,
	`needs_marking` integer DEFAULT false NOT NULL,
	`auto_submitted` integer DEFAULT false NOT NULL,
	`started_at` integer NOT NULL,
	`saved_at` integer,
	`submitted_at` integer,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attempts_assignment_idx` ON `attempts` (`assignment_id`);--> statement-breakpoint
CREATE INDEX `attempts_student_idx` ON `attempts` (`student_id`,`status`);--> statement-breakpoint
CREATE TABLE `class_members` (
	`class_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`class_id`, `user_id`),
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `class_members_user_idx` ON `class_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `classes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`subject` text NOT NULL,
	`level` text DEFAULT '' NOT NULL,
	`teacher_id` text,
	`emoji` text DEFAULT '🏫' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`teacher_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `community_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text,
	`kind` text NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`ref_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`review_note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `community_status_idx` ON `community_posts` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `community_reactions` (
	`post_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	PRIMARY KEY(`post_id`, `user_id`, `kind`),
	FOREIGN KEY (`post_id`) REFERENCES `community_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `papers` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`duration_min` integer DEFAULT 45 NOT NULL,
	`shuffle` integer DEFAULT false NOT NULL,
	`lock_ai` integer DEFAULT true NOT NULL,
	`sections` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`owner_id` text,
	`scope` text DEFAULT 'mine' NOT NULL,
	`subject` text NOT NULL,
	`topic` text DEFAULT '' NOT NULL,
	`level` text DEFAULT '' NOT NULL,
	`difficulty` integer DEFAULT 2 NOT NULL,
	`type` text NOT NULL,
	`stem` text NOT NULL,
	`options` text DEFAULT '[]' NOT NULL,
	`answer` text DEFAULT '' NOT NULL,
	`marks` integer DEFAULT 1 NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`parent_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `questions_subject_idx` ON `questions` (`subject`,`topic`);