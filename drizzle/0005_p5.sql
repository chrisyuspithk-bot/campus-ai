CREATE TABLE `scan_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`teacher_id` text,
	`assignment_id` text,
	`title` text NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`pages_per_student` integer DEFAULT 2 NOT NULL,
	`ocr_started_at` integer,
	`ocr_done_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`teacher_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `scan_batches_teacher_idx` ON `scan_batches` (`teacher_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `scan_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`seq` integer NOT NULL,
	`filename` text DEFAULT '' NOT NULL,
	`mime` text DEFAULT 'image/png' NOT NULL,
	`width` integer DEFAULT 0 NOT NULL,
	`height` integer DEFAULT 0 NOT NULL,
	`qr` text,
	`student_id` text,
	`page_no` integer DEFAULT 1 NOT NULL,
	`match` text DEFAULT 'failed' NOT NULL,
	`ocr_text` text DEFAULT '' NOT NULL,
	`ocr_done` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `scan_batches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `scan_pages_batch_idx` ON `scan_pages` (`batch_id`,`seq`);--> statement-breakpoint
CREATE INDEX `scan_pages_student_idx` ON `scan_pages` (`student_id`);--> statement-breakpoint
ALTER TABLE `grades` ADD `ink` text DEFAULT '{}' NOT NULL;