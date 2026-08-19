CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	`user_id` text,
	`member_id` text,
	`organization_id` text,
	`team_id` text,
	`bucket` text NOT NULL,
	`key` text NOT NULL,
	`original_name` text NOT NULL,
	`original_extension` text,
	`content_type` text NOT NULL,
	`size_bytes` integer,
	`etag` text,
	`checksum_sha256` text,
	`metadata` text,
	`status` text NOT NULL,
	`uploaded_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_bucket_key_unique` ON `files` (`bucket`,`key`);