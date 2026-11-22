CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`notes` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `loans` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`borrower_user_id` text,
	`borrower_contact_id` text,
	`status` text NOT NULL,
	`note` text,
	`requested_by` text,
	`created_at` integer NOT NULL,
	`decided_by` text,
	`decided_at` integer,
	`lent_by` text,
	`out_at` integer,
	`due_on` text,
	`returned_at` integer,
	`returned_by` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`borrower_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`borrower_contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`lent_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`returned_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "loans_status" CHECK(status IN ('requested','approved','out','returned','declined','cancelled'))
);
--> statement-breakpoint
CREATE INDEX `loans_item_idx` ON `loans` (`item_id`,`status`);--> statement-breakpoint
CREATE INDEX `loans_due_idx` ON `loans` (`status`,`due_on`);--> statement-breakpoint
CREATE INDEX `loans_borrower_idx` ON `loans` (`borrower_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `loans_contact_idx` ON `loans` (`borrower_contact_id`);