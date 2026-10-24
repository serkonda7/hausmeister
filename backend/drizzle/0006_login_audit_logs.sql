CREATE TABLE `login_audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`occurred_at` integer NOT NULL,
	`username` text,
	`source_ip` text,
	`outcome` text NOT NULL,
	`status` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_audit_logs_occurred_idx` ON `login_audit_logs` (`occurred_at`,`id`);
