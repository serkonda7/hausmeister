CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`item_id` text,
	`payload` text NOT NULL,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_item_idx` ON `notifications` (`item_id`,`kind`);--> statement-breakpoint
CREATE TABLE `stock_moves` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`delta` real NOT NULL,
	`quantity_after` real NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`user_id` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "stock_moves_reason" CHECK(reason IN ('used','restocked','counted','edited','other'))
);
--> statement-breakpoint
CREATE INDEX `stock_moves_item_idx` ON `stock_moves` (`item_id`,`at`);