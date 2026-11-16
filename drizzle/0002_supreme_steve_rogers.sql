ALTER TABLE `items` ADD `name_sort` text;--> statement-breakpoint
CREATE INDEX `items_name_sort_idx` ON `items` (`name_sort`,`id`);--> statement-breakpoint
CREATE INDEX `items_updated_idx` ON `items` (`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `items_status_idx` ON `items` (`status`);