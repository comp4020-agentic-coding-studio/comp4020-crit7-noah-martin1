CREATE TABLE `announcements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`level` text NOT NULL,
	`published_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `charges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`term` text NOT NULL,
	`kind` text NOT NULL,
	`description` text NOT NULL,
	`course_code` text,
	`amount_cents` integer NOT NULL,
	`due_date` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `class_allocations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slot_id` integer NOT NULL,
	`course_code` text NOT NULL,
	`term` text NOT NULL,
	`activity` text NOT NULL,
	`allocated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`slot_id`) REFERENCES `class_slots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `allocation_per_activity` ON `class_allocations` (`course_code`,`term`,`activity`);--> statement-breakpoint
CREATE TABLE `class_slots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_code` text NOT NULL,
	`term` text NOT NULL,
	`activity` text NOT NULL,
	`label` text NOT NULL,
	`day` integer NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`location` text NOT NULL,
	`capacity` integer NOT NULL,
	`taken` integer NOT NULL,
	FOREIGN KEY (`course_code`) REFERENCES `courses`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `courses` (
	`code` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`units` integer NOT NULL,
	`level` integer NOT NULL,
	`area` text NOT NULL,
	`band` integer NOT NULL,
	`description` text NOT NULL,
	`convener` text NOT NULL,
	`offered_s1` integer NOT NULL,
	`offered_s2` integer NOT NULL,
	`prerequisites` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `enrolments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_code` text NOT NULL,
	`term` text NOT NULL,
	`status` text NOT NULL,
	`mark` integer,
	`grade` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`course_code`) REFERENCES `courses`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `enrolments_course_term` ON `enrolments` (`course_code`,`term`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`course_code` text,
	`location` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `favourites` (
	`path` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sender` text NOT NULL,
	`category` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`sent_at` text NOT NULL,
	`read` integer DEFAULT false NOT NULL,
	`starred` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`charge_id` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`method` text NOT NULL,
	`reference` text NOT NULL,
	`paid_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`charge_id`) REFERENCES `charges`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`subject` text NOT NULL,
	`details` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `requirement_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`units` integer NOT NULL,
	`codes` text DEFAULT '' NOT NULL,
	`min_level` integer DEFAULT 1000 NOT NULL,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `requirement_groups_key_unique` ON `requirement_groups` (`key`);--> statement-breakpoint
CREATE TABLE `students` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uid` text NOT NULL,
	`legal_given` text NOT NULL,
	`legal_family` text NOT NULL,
	`preferred_name` text NOT NULL,
	`pronouns` text DEFAULT '' NOT NULL,
	`date_of_birth` text NOT NULL,
	`email` text NOT NULL,
	`personal_email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`home_address` text DEFAULT '' NOT NULL,
	`term_address` text DEFAULT '' NOT NULL,
	`emergency_name` text DEFAULT '' NOT NULL,
	`emergency_relation` text DEFAULT '' NOT NULL,
	`emergency_phone` text DEFAULT '' NOT NULL,
	`emergency_updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`citizenship` text NOT NULL,
	`program_code` text NOT NULL,
	`program_name` text NOT NULL,
	`program_units` integer NOT NULL,
	`major_name` text NOT NULL,
	`admit_term` text NOT NULL,
	`payment_option` text DEFAULT 'help' NOT NULL,
	`caf_submitted_for` text DEFAULT '' NOT NULL,
	`tfn_provided` integer DEFAULT false NOT NULL,
	`bank_name` text DEFAULT '' NOT NULL,
	`bank_bsb` text DEFAULT '' NOT NULL,
	`bank_account` text DEFAULT '' NOT NULL,
	`password_changed_at` text,
	`graduation_ceremony` text,
	`graduation_applied_at` text,
	`testamur_name` text DEFAULT '' NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`motion` text DEFAULT 'full' NOT NULL,
	`text_size` text DEFAULT 'standard' NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `task_states` (
	`key` text PRIMARY KEY NOT NULL,
	`done` integer NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `visits` (
	`path` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`visited_at` text DEFAULT (datetime('now')) NOT NULL
);
