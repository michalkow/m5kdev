PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_members` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text,
	`email` text,
	`name` text DEFAULT '' NOT NULL,
	`image` text,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	`preferences` text DEFAULT '{}',
	`metadata` text DEFAULT '{}',
	`onboarding` integer,
	`flags` text DEFAULT '[]',
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_members`("id", "organization_id", "user_id", "email", "name", "image", "role", "created_at", "deleted_at", "preferences", "metadata", "onboarding", "flags") SELECT "id", "organization_id", "user_id", "email", "name", "image", "role", "created_at", "deleted_at", "preferences", "metadata", "onboarding", "flags" FROM `members`;--> statement-breakpoint
DROP TABLE `members`;--> statement-breakpoint
ALTER TABLE `__new_members` RENAME TO `members`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `members_attached_user_organization_unique` ON `members` (`user_id`,`organization_id`) WHERE "members"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `members_live_pending_email_organization_unique` ON `members` (`email`,`organization_id`) WHERE "members"."user_id" is null and "members"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE `invitations` ADD `member_id` text REFERENCES members(id);