CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `accounts_user_idx` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`kind` text NOT NULL,
	`sha256` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`original_name` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "attachments_kind" CHECK(kind IN ('photo','receipt','manual','other'))
);
--> statement-breakpoint
CREATE INDEX `attachments_item_idx` ON `attachments` (`item_id`,`sort`);--> statement-breakpoint
CREATE INDEX `attachments_sha_idx` ON `attachments` (`sha256`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `boots` (
	`id` integer PRIMARY KEY NOT NULL,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text,
	`actor_id` text,
	`action` text NOT NULL,
	`diff` text,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_item_idx` ON `events` (`item_id`,`at`);--> statement-breakpoint
CREATE INDEX `events_at_idx` ON `events` (`at`);--> statement-breakpoint
CREATE TABLE `group_members` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`),
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `group_members_user_idx` ON `group_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `groups_name_unique` ON `groups` (`name`);--> statement-breakpoint
CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`accepted_at` integer,
	`accepted_by` text,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`accepted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "invites_role" CHECK(role IN ('admin','member','guest'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invites_token_hash_unique` ON `invites` (`token_hash`);--> statement-breakpoint
CREATE TABLE `item_grants` (
	`item_id` text NOT NULL,
	`principal_kind` text NOT NULL,
	`principal_id` text NOT NULL,
	`level` text NOT NULL,
	PRIMARY KEY(`item_id`, `principal_kind`, `principal_id`),
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "item_grants_principal_kind" CHECK(principal_kind IN ('user','group')),
	CONSTRAINT "item_grants_level" CHECK(level IN ('view','use','edit','manage'))
);
--> statement-breakpoint
CREATE INDEX `item_grants_principal_idx` ON `item_grants` (`principal_kind`,`principal_id`);--> statement-breakpoint
CREATE TABLE `item_tags` (
	`item_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`item_id`, `tag_id`),
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `item_tags_tag_idx` ON `item_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `item_types` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`tracking` text DEFAULT 'individual' NOT NULL,
	`fields` text DEFAULT '[]' NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`parent_id`) REFERENCES `item_types`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "item_types_tracking" CHECK(tracking IN ('individual','stock'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `item_types_key_unique` ON `item_types` (`key`);--> statement-breakpoint
CREATE INDEX `item_types_parent_idx` ON `item_types` (`parent_id`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`type_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`owner_kind` text DEFAULT 'household' NOT NULL,
	`owner_id` text,
	`visibility` text DEFAULT 'household' NOT NULL,
	`location_id` text,
	`container_item_id` text,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit` text,
	`min_quantity` real,
	`status` text DEFAULT 'available' NOT NULL,
	`condition` text,
	`acquired_on` text,
	`price_cents` integer,
	`currency` text,
	`barcode` text,
	`short_code` text,
	`attributes` text DEFAULT '{}' NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`type_id`) REFERENCES `item_types`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`container_item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "items_owner_kind" CHECK(owner_kind IN ('household','user','group')),
	CONSTRAINT "items_visibility" CHECK(visibility IN ('household','private')),
	CONSTRAINT "items_status" CHECK(status IN ('available','in_use','on_loan','needs_repair','lost','outgrown','archived','given_away','sold','disposed')),
	CONSTRAINT "items_owner_id" CHECK((owner_kind = 'household' AND owner_id IS NULL) OR (owner_kind <> 'household' AND owner_id IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_short_code_unique` ON `items` (`short_code`);--> statement-breakpoint
CREATE INDEX `items_owner_idx` ON `items` (`owner_kind`,`owner_id`);--> statement-breakpoint
CREATE INDEX `items_type_idx` ON `items` (`type_id`);--> statement-breakpoint
CREATE INDEX `items_location_idx` ON `items` (`location_id`);--> statement-breakpoint
CREATE INDEX `items_container_idx` ON `items` (`container_item_id`);--> statement-breakpoint
CREATE INDEX `items_barcode_idx` ON `items` (`barcode`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`run_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`done_at` integer,
	`last_error` text
);
--> statement-breakpoint
CREATE INDEX `jobs_due_idx` ON `jobs` (`done_at`,`run_at`);--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`kind` text,
	`short_code` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `locations_short_code_unique` ON `locations` (`short_code`);--> statement-breakpoint
CREATE INDEX `locations_parent_idx` ON `locations` (`parent_id`);--> statement-breakpoint
CREATE TABLE `passkeys` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`public_key` text NOT NULL,
	`user_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`counter` integer NOT NULL,
	`device_type` text NOT NULL,
	`backed_up` integer NOT NULL,
	`transports` text,
	`created_at` integer,
	`aaguid` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `passkeys_user_idx` ON `passkeys` (`user_id`);--> statement-breakpoint
CREATE INDEX `passkeys_credential_idx` ON `passkeys` (`credential_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`household_name` text DEFAULT 'Unser Haushalt' NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`locale` text DEFAULT 'de-DE' NOT NULL,
	CONSTRAINT "settings_singleton" CHECK(id = 1)
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_username` text,
	`display_name` text NOT NULL,
	`auth_email` text NOT NULL,
	`email` text,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'member' NOT NULL,
	`locale` text DEFAULT 'de-DE' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`disabled_at` integer,
	CONSTRAINT "users_role" CHECK(role IN ('admin','member','guest'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_auth_email_unique` ON `users` (`auth_email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verifications_identifier_idx` ON `verifications` (`identifier`);