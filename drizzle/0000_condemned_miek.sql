CREATE TABLE `accommodations` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`event_id` text,
	`location_id` text,
	`property_name` text NOT NULL,
	`property_type` text NOT NULL,
	`check_in` text NOT NULL,
	`check_out` text NOT NULL,
	`room_type` text,
	`meal_plan` text,
	`booking_provider` text,
	`booking_reference` text,
	`estimated_cost` real,
	`actual_cost` real,
	`currency` text,
	`payment_status` text DEFAULT 'not_paid' NOT NULL,
	`booking_status` text DEFAULT 'researching' NOT NULL,
	`cancellation_deadline` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_accommodations_trip_dates` ON `accommodations` (`trip_id`,`check_in`,`check_out`);--> statement-breakpoint
CREATE TABLE `ai_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`requested_by` text,
	`prompt` text NOT NULL,
	`reason` text NOT NULL,
	`proposed_changes` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_ai_suggestions_trip_status` ON `ai_suggestions` (`trip_id`,`status`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`event_id` text,
	`booking_id` text,
	`category` text NOT NULL,
	`file_name` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_attachments_trip_category` ON `attachments` (`trip_id`,`category`);--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`event_id` text,
	`accommodation_id` text,
	`booking_type` text NOT NULL,
	`title` text NOT NULL,
	`provider` text,
	`reference` text,
	`status` text DEFAULT 'researching' NOT NULL,
	`payment_status` text DEFAULT 'not_paid' NOT NULL,
	`booked_at` text,
	`booking_open_date` text,
	`booking_deadline` text,
	`cancellation_deadline` text,
	`cost` real,
	`currency` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`accommodation_id`) REFERENCES `accommodations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_bookings_trip_status` ON `bookings` (`trip_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_bookings_deadlines` ON `bookings` (`booking_deadline`,`cancellation_deadline`);--> statement-breakpoint
CREATE TABLE `currency_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`from_currency` text NOT NULL,
	`to_currency` text NOT NULL,
	`rate` real NOT NULL,
	`effective_at` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_currency_rates_trip_pair` ON `currency_rates` (`trip_id`,`from_currency`,`to_currency`,`effective_at`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`day_id` text,
	`segment_id` text,
	`location_id` text,
	`title` text NOT NULL,
	`description` text,
	`category` text NOT NULL,
	`subcategory` text,
	`date` text,
	`start_time` text,
	`end_time` text,
	`time_precision` text DEFAULT 'unscheduled' NOT NULL,
	`origin` text,
	`destination` text,
	`transport_mode` text,
	`provider` text,
	`service_number` text,
	`terminal` text,
	`platform` text,
	`gate` text,
	`duration_minutes` integer,
	`estimated_cost` real,
	`actual_cost` real,
	`currency` text,
	`booking_status` text DEFAULT 'not_required' NOT NULL,
	`payment_status` text DEFAULT 'not_paid' NOT NULL,
	`confirmation_number` text,
	`notes` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`metadata` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`day_id`) REFERENCES `trip_days`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`segment_id`) REFERENCES `trip_segments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_events_trip_day_sort` ON `events` (`trip_id`,`day_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_events_trip_category` ON `events` (`trip_id`,`category`);--> statement-breakpoint
CREATE INDEX `idx_events_booking_status` ON `events` (`trip_id`,`booking_status`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`event_id` text,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text NOT NULL,
	`converted_amount` real NOT NULL,
	`base_currency` text NOT NULL,
	`rate_used` real NOT NULL,
	`rate_timestamp` text NOT NULL,
	`expense_date` text NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_expenses_trip_date` ON `expenses` (`trip_id`,`expense_date`);--> statement-breakpoint
CREATE INDEX `idx_expenses_trip_category` ON `expenses` (`trip_id`,`category`);--> statement-breakpoint
CREATE TABLE `links` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`event_id` text,
	`segment_id` text,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`description` text,
	`provider` text,
	`link_type` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`segment_id`) REFERENCES `trip_segments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_links_trip_event` ON `links` (`trip_id`,`event_id`);--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`city` text,
	`country` text,
	`latitude` real,
	`longitude` real,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_locations_city_country` ON `locations` (`city`,`country`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`event_id` text,
	`segment_id` text,
	`object_key` text,
	`source_url` text,
	`caption` text,
	`taken_at` text,
	`sort_order` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`segment_id`) REFERENCES `trip_segments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_photos_trip_segment_sort` ON `photos` (`trip_id`,`segment_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `route_legs` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`day_id` text,
	`origin_location_id` text,
	`destination_location_id` text,
	`origin_event_id` text,
	`destination_event_id` text,
	`transport_mode` text NOT NULL,
	`provider` text,
	`service_number` text,
	`departure_time` text,
	`arrival_time` text,
	`duration_minutes` integer,
	`distance_km` real,
	`estimated_cost` real,
	`actual_cost` real,
	`currency` text,
	`booking_status` text DEFAULT 'not_required' NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`day_id`) REFERENCES `trip_days`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`origin_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`destination_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`origin_event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`destination_event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_route_legs_trip_sort` ON `route_legs` (`trip_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_route_legs_day_sort` ON `route_legs` (`day_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `saved_places` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`segment_id` text,
	`location_id` text,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`notes` text,
	`sort_order` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`segment_id`) REFERENCES `trip_segments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_saved_places_trip_sort` ON `saved_places` (`trip_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `trip_days` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`day_number` integer NOT NULL,
	`date` text NOT NULL,
	`title` text,
	`destination_segment_id` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`destination_segment_id`) REFERENCES `trip_segments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_trip_days_trip_day` ON `trip_days` (`trip_id`,`day_number`);--> statement-breakpoint
CREATE INDEX `idx_trip_days_segment` ON `trip_days` (`destination_segment_id`);--> statement-breakpoint
CREATE TABLE `trip_segments` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`destination_name` text NOT NULL,
	`country` text NOT NULL,
	`start_day` integer NOT NULL,
	`end_day` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`latitude` real,
	`longitude` real,
	`colour` text NOT NULL,
	`cover_photo_url` text,
	`sort_order` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_trip_segments_trip_sort` ON `trip_segments` (`trip_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `trip_travellers` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`user_id` text,
	`invited_email` text,
	`role` text DEFAULT 'viewer' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_trip_travellers_trip` ON `trip_travellers` (`trip_id`);--> statement-breakpoint
CREATE INDEX `idx_trip_travellers_user` ON `trip_travellers` (`user_id`);--> statement-breakpoint
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`base_currency` text DEFAULT 'AUD' NOT NULL,
	`budget` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'idea' NOT NULL,
	`cover_photo_url` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_trips_owner_status` ON `trips` (`owner_id`,`status`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);
