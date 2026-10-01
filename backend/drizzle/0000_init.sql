CREATE TABLE `authors` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `authors_name_unique` ON `authors` (`name`);--> statement-breakpoint
CREATE TABLE `book_authors` (
	`book_id` text NOT NULL,
	`author_id` text NOT NULL,
	PRIMARY KEY(`book_id`, `author_id`),
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `authors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `book_authors_author_idx` ON `book_authors` (`author_id`);--> statement-breakpoint
CREATE TABLE `book_languages` (
	`book_id` text NOT NULL,
	`language_id` text NOT NULL,
	PRIMARY KEY(`book_id`, `language_id`),
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`language_id`) REFERENCES `languages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `book_languages_language_idx` ON `book_languages` (`language_id`);--> statement-breakpoint
CREATE TABLE `book_reads` (
	`user_id` text NOT NULL,
	`book_id` text NOT NULL,
	`read_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `book_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `book_reads_book_idx` ON `book_reads` (`book_id`);--> statement-breakpoint
CREATE TABLE `book_tags` (
	`book_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`book_id`, `tag_id`),
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `book_tags_tag_idx` ON `book_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `books` (
	`id` text PRIMARY KEY NOT NULL,
	`isbn` text,
	`title` text NOT NULL,
	`subtitle` text,
	`publisher_id` text,
	`owner_id` text,
	`location_id` text,
	`print_year` integer,
	`languages` text DEFAULT '[]' NOT NULL,
	`cover_url` text,
	`pages` integer,
	`description` text,
	`dedications` text DEFAULT '[]' NOT NULL,
	`damages` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`publisher_id`) REFERENCES `publishers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `books_owner_idx` ON `books` (`owner_id`);--> statement-breakpoint
CREATE INDEX `books_location_idx` ON `books` (`location_id`);--> statement-breakpoint
CREATE TABLE `languages` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `languages_name_unique` ON `languages` (`name`);--> statement-breakpoint
CREATE TABLE `loans` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`borrower_name` text NOT NULL,
	`lent_at` integer NOT NULL,
	`due_at` integer,
	`returned_at` integer,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `loans_book_idx` ON `loans` (`book_id`);--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `locations_parent_idx` ON `locations` (`parent_id`);--> statement-breakpoint
CREATE TABLE `provenance_events` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`kind` text NOT NULL,
	`occurred_at` integer,
	`party` text,
	`price_cents` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `provenance_events_book_idx` ON `provenance_events` (`book_id`);--> statement-breakpoint
CREATE TABLE `publishers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publishers_name_unique` ON `publishers` (`name`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text,
	`password_hash` text NOT NULL,
	`is_admin` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);