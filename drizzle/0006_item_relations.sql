CREATE TABLE `item_relations` (
	`from_item_id` text NOT NULL,
	`to_item_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`from_item_id`, `to_item_id`, `kind`),
	FOREIGN KEY (`from_item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "item_relations_kind" CHECK(kind IN ('fits','accessory_of','part_of','replaces')),
	CONSTRAINT "item_relations_not_self" CHECK(from_item_id <> to_item_id)
);
--> statement-breakpoint
CREATE INDEX `item_relations_to_idx` ON `item_relations` (`to_item_id`,`kind`);