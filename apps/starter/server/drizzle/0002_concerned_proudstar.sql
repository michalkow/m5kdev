ALTER TABLE `members` ADD `name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `image` text;--> statement-breakpoint
ALTER TABLE `members` ADD `deleted_at` integer;