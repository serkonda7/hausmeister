CREATE TABLE `transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`from_owner_kind` text NOT NULL,
	`from_owner_id` text,
	`to_owner_kind` text NOT NULL,
	`to_owner_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`note` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`resolved_by` text,
	`resolved_at` integer,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "transfers_status" CHECK(status IN ('pending','accepted','declined','forced','cancelled')),
	CONSTRAINT "transfers_to_kind" CHECK(to_owner_kind IN ('user','group')),
	CONSTRAINT "transfers_from_kind" CHECK(from_owner_kind IN ('household','user','group'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transfers_pending_idx` ON `transfers` (`item_id`) WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX `transfers_to_idx` ON `transfers` (`to_owner_kind`,`to_owner_id`,`status`);