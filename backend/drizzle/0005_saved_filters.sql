CREATE TABLE `saved_filters` (
	`user_id` text NOT NULL,
	`scope` text NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`values` text NOT NULL,
	PRIMARY KEY(`user_id`, `scope`, `name`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
