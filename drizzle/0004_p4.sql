CREATE TABLE `grades` (
	`attempt_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`marks` text DEFAULT '{}' NOT NULL,
	`ai_total` integer,
	`ai_summary` text DEFAULT '' NOT NULL,
	`ai_mock` integer DEFAULT true NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`graded_by` text,
	`graded_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`graded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `grades_status_idx` ON `grades` (`status`);--> statement-breakpoint
CREATE TABLE `wrong_items` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`question_id` text,
	`assignment_id` text,
	`source` text DEFAULT 'assignment' NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`topic` text DEFAULT '' NOT NULL,
	`type` text NOT NULL,
	`stem` text NOT NULL,
	`options` text DEFAULT '[]' NOT NULL,
	`answer` text DEFAULT '' NOT NULL,
	`my_answer` text DEFAULT '' NOT NULL,
	`redo_count` integer DEFAULT 0 NOT NULL,
	`redo_correct` integer DEFAULT 0 NOT NULL,
	`mastered` integer DEFAULT false NOT NULL,
	`last_redo_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `wrong_items_student_idx` ON `wrong_items` (`student_id`,`mastered`);--> statement-breakpoint
CREATE INDEX `wrong_items_q_idx` ON `wrong_items` (`student_id`,`question_id`,`stem`);