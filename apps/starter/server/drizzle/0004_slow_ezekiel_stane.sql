DROP TABLE `teammembers`;--> statement-breakpoint
DROP TABLE `teams`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ai_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`member_id` text,
	`team_id` text,
	`organization_id` text,
	`feature` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`total_tokens` integer,
	`cost` real,
	`trace_id` text,
	`created_at` integer NOT NULL,
	`metadata` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_ai_usage`("id", "user_id", "member_id", "team_id", "organization_id", "feature", "provider", "model", "input_tokens", "output_tokens", "total_tokens", "cost", "trace_id", "created_at", "metadata") SELECT "id", "user_id", "member_id", "team_id", "organization_id", "feature", "provider", "model", "input_tokens", "output_tokens", "total_tokens", "cost", "trace_id", "created_at", "metadata" FROM `ai_usage`;--> statement-breakpoint
DROP TABLE `ai_usage`;--> statement-breakpoint
ALTER TABLE `__new_ai_usage` RENAME TO `ai_usage`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_files` (
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
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_files`("id", "created_at", "updated_at", "deleted_at", "user_id", "member_id", "organization_id", "team_id", "bucket", "key", "original_name", "original_extension", "content_type", "size_bytes", "etag", "checksum_sha256", "metadata", "status", "uploaded_at") SELECT "id", "created_at", "updated_at", "deleted_at", "user_id", "member_id", "organization_id", "team_id", "bucket", "key", "original_name", "original_extension", "content_type", "size_bytes", "etag", "checksum_sha256", "metadata", "status", "uploaded_at" FROM `files`;--> statement-breakpoint
DROP TABLE `files`;--> statement-breakpoint
ALTER TABLE `__new_files` RENAME TO `files`;--> statement-breakpoint
CREATE UNIQUE INDEX `files_bucket_key_unique` ON `files` (`bucket`,`key`);--> statement-breakpoint
CREATE TABLE `__new_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`member_id` text,
	`email` text NOT NULL,
	`role` text,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`inviter_id` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`inviter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_invitations`("id", "organization_id", "member_id", "email", "role", "status", "created_at", "expires_at", "inviter_id") SELECT "id", "organization_id", "member_id", "email", "role", "status", "created_at", "expires_at", "inviter_id" FROM `invitations`;--> statement-breakpoint
DROP TABLE `invitations`;--> statement-breakpoint
ALTER TABLE `__new_invitations` RENAME TO `invitations`;--> statement-breakpoint
CREATE TABLE `__new_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`author_user_id` text,
	`member_id` text,
	`organization_id` text,
	`team_id` text,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`excerpt` text,
	`content` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_posts`("id", "author_user_id", "member_id", "organization_id", "team_id", "title", "slug", "excerpt", "content", "status", "published_at", "created_at", "updated_at", "deleted_at") SELECT "id", "author_user_id", "member_id", "organization_id", "team_id", "title", "slug", "excerpt", "content", "status", "published_at", "created_at", "updated_at", "deleted_at" FROM `posts`;--> statement-breakpoint
DROP TABLE `posts`;--> statement-breakpoint
ALTER TABLE `__new_posts` RENAME TO `posts`;--> statement-breakpoint
CREATE UNIQUE INDEX `posts_slug_unique` ON `posts` (`slug`);