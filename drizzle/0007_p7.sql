CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`href` text DEFAULT '' NOT NULL,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`,`read_at`);--> statement-breakpoint
CREATE TABLE `photo_practice` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`subject` text DEFAULT '數學' NOT NULL,
	`topic` text DEFAULT '' NOT NULL,
	`image_file` text DEFAULT '' NOT NULL,
	`ocr_text` text DEFAULT '' NOT NULL,
	`reply` text DEFAULT '' NOT NULL,
	`conversation_id` text,
	`mock` integer DEFAULT false NOT NULL,
	`in_wrongbook` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `photo_practice_student_idx` ON `photo_practice` (`student_id`,`created_at`);