CREATE TABLE `account_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_user_id` text NOT NULL,
	`status` text NOT NULL,
	`code` text,
	`expires_at` integer,
	`claimed_at` integer,
	`claimed_email` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`claim_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_account_claim_magic_links` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`token` text NOT NULL,
	`url` text NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `account_claims`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_account_claim_magic_links`("id", "claim_id", "user_id", "email", "token", "url", "expires_at", "created_at") SELECT "id", "claim_id", "user_id", "email", "token", "url", "expires_at", "created_at" FROM `account_claim_magic_links`;--> statement-breakpoint
DROP TABLE `account_claim_magic_links`;--> statement-breakpoint
ALTER TABLE `__new_account_claim_magic_links` RENAME TO `account_claim_magic_links`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_waitlist` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`email` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`status` text DEFAULT 'WAITLIST' NOT NULL,
	`code` text,
	`expires_at` integer,
	`user_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_waitlist`("id", "name", "email", "created_at", "updated_at", "status", "code", "expires_at", "user_id") SELECT "id", "name", "email", "created_at", "updated_at", "status", "code", "expires_at", "user_id" FROM `waitlist`;--> statement-breakpoint
DROP TABLE `waitlist`;--> statement-breakpoint
ALTER TABLE `__new_waitlist` RENAME TO `waitlist`;