CREATE TABLE `library_places` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'sight' NOT NULL,
	`address` text,
	`city` text,
	`country` text,
	`latitude` real,
	`longitude` real,
	`provider_id` text,
	`url` text,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_library_places_user` ON `library_places` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_library_places_provider` ON `library_places` (`user_id`,`provider_id`);--> statement-breakpoint
CREATE TABLE `section_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`day_count` integer NOT NULL,
	`cover_image_url` text,
	`payload` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_section_templates_user` ON `section_templates` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `trip_mutations` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`user_id` text NOT NULL,
	`version` integer NOT NULL,
	`source` text DEFAULT 'user' NOT NULL,
	`label` text,
	`operation_count` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_trip_mutations_trip` ON `trip_mutations` (`trip_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `accommodations` ADD `segment_id` text;--> statement-breakpoint
ALTER TABLE `accommodations` ADD `start_day_id` text;--> statement-breakpoint
ALTER TABLE `accommodations` ADD `nights` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `accommodations` ADD `place_name` text;--> statement-breakpoint
ALTER TABLE `accommodations` ADD `address` text;--> statement-breakpoint
ALTER TABLE `accommodations` ADD `latitude` real;--> statement-breakpoint
ALTER TABLE `accommodations` ADD `longitude` real;--> statement-breakpoint
ALTER TABLE `accommodations` ADD `place_provider_id` text;--> statement-breakpoint
ALTER TABLE `accommodations` ADD `check_in_time` text;--> statement-breakpoint
ALTER TABLE `accommodations` ADD `check_out_time` text;--> statement-breakpoint
ALTER TABLE `accommodations` ADD `phone` text;--> statement-breakpoint
ALTER TABLE `accommodations` ADD `email` text;--> statement-breakpoint
ALTER TABLE `accommodations` ADD `url` text;--> statement-breakpoint
ALTER TABLE `attachments` ADD `accommodation_id` text;--> statement-breakpoint
ALTER TABLE `attachments` ADD `uploaded_by` text;--> statement-breakpoint
ALTER TABLE `attachments` ADD `scan_status` text DEFAULT 'not_scanned' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `kind` text DEFAULT 'place' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `time_slot` text DEFAULT 'anytime' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `place_name` text;--> statement-breakpoint
ALTER TABLE `events` ADD `address` text;--> statement-breakpoint
ALTER TABLE `events` ADD `latitude` real;--> statement-breakpoint
ALTER TABLE `events` ADD `longitude` real;--> statement-breakpoint
ALTER TABLE `events` ADD `place_provider_id` text;--> statement-breakpoint
ALTER TABLE `events` ADD `url` text;--> statement-breakpoint
ALTER TABLE `events` ADD `image_url` text;--> statement-breakpoint
ALTER TABLE `events` ADD `origin_latitude` real;--> statement-breakpoint
ALTER TABLE `events` ADD `origin_longitude` real;--> statement-breakpoint
ALTER TABLE `events` ADD `destination_latitude` real;--> statement-breakpoint
ALTER TABLE `events` ADD `destination_longitude` real;--> statement-breakpoint
ALTER TABLE `events` ADD `arrival_day_offset` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `departure_timezone` text;--> statement-breakpoint
ALTER TABLE `events` ADD `arrival_timezone` text;--> statement-breakpoint
ALTER TABLE `expenses` ADD `day_id` text;--> statement-breakpoint
ALTER TABLE `expenses` ADD `accommodation_id` text;--> statement-breakpoint
ALTER TABLE `expenses` ADD `rate_source` text;--> statement-breakpoint
ALTER TABLE `trip_segments` ADD `country_code` text;--> statement-breakpoint
ALTER TABLE `trip_segments` ADD `timezone` text;--> statement-breakpoint
ALTER TABLE `trip_segments` ADD `description` text;--> statement-breakpoint
ALTER TABLE `trip_segments` ADD `image_credit` text;--> statement-breakpoint
ALTER TABLE `trip_segments` ADD `provider_id` text;--> statement-breakpoint
ALTER TABLE `trips` ADD `version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `trips` ADD `date_mode` text DEFAULT 'fixed' NOT NULL;--> statement-breakpoint
ALTER TABLE `trips` ADD `day_count` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `trips` ADD `travellers` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `trips` ADD `pace` text;--> statement-breakpoint
ALTER TABLE `trips` ADD `interests` text;--> statement-breakpoint
ALTER TABLE `trips` ADD `notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `trips` ADD `cover_credit` text;--> statement-breakpoint
ALTER TABLE `trips` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `trips` ADD `is_sample` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `trips` ADD `has_budget` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_trip_travellers_email` ON `trip_travellers` (`invited_email`);--> statement-breakpoint
-- Backfill: trips created before 0001 stored "no budget" as 0.
UPDATE `trips` SET `has_budget` = 1 WHERE `budget` > 0;
