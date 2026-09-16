CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`serial` text,
	`status` text DEFAULT 'stored' NOT NULL,
	`location_id` text,
	`purchase_date` text,
	`purchase_price_cents` integer,
	`warranty_until` text,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `inventory_locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_assets_status` ON `assets` (`status`);--> statement-breakpoint
CREATE INDEX `idx_assets_location` ON `assets` (`location_id`);--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sku` text,
	`category` text,
	`quantity` integer DEFAULT 0 NOT NULL,
	`unit` text,
	`location_id` text,
	`low_stock_at` integer,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `inventory_locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_items_sku_unique` ON `inventory_items` (`sku`);--> statement-breakpoint
CREATE INDEX `idx_inventory_items_location` ON `inventory_items` (`location_id`);--> statement-breakpoint
CREATE TABLE `inventory_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_locations_name_unique` ON `inventory_locations` (`name`);