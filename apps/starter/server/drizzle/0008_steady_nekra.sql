PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_oauth_access_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text,
	`client_id` text NOT NULL,
	`session_id` text,
	`user_id` text,
	`reference_id` text,
	`authorization_code_id` text,
	`resources` text,
	`requested_user_info_claims` text,
	`refresh_id` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`revoked` integer,
	`confirmation` text,
	`scopes` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`client_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`refresh_id`) REFERENCES `oauth_refresh_tokens`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_oauth_access_tokens`("id", "token", "client_id", "session_id", "user_id", "reference_id", "authorization_code_id", "resources", "requested_user_info_claims", "refresh_id", "expires_at", "created_at", "revoked", "confirmation", "scopes") SELECT "id", "token", "client_id", "session_id", "user_id", "reference_id", "authorization_code_id", "resources", "requested_user_info_claims", "refresh_id", "expires_at", "created_at", "revoked", "confirmation", "scopes" FROM `oauth_access_tokens`;--> statement-breakpoint
DROP TABLE `oauth_access_tokens`;--> statement-breakpoint
ALTER TABLE `__new_oauth_access_tokens` RENAME TO `oauth_access_tokens`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_access_tokens_token_unique` ON `oauth_access_tokens` (`token`);--> statement-breakpoint
CREATE TABLE `__new_oauth_client_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`resource_id` text NOT NULL,
	`metadata` text,
	`created_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resource_id`) REFERENCES `oauth_resources`(`identifier`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_oauth_client_resources`("id", "client_id", "resource_id", "metadata", "created_at") SELECT "id", "client_id", "resource_id", "metadata", "created_at" FROM `oauth_client_resources`;--> statement-breakpoint
DROP TABLE `oauth_client_resources`;--> statement-breakpoint
ALTER TABLE `__new_oauth_client_resources` RENAME TO `oauth_client_resources`;--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_client_resources_client_resource_unique` ON `oauth_client_resources` (`client_id`,`resource_id`);--> statement-breakpoint
CREATE TABLE `__new_oauth_consents` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`user_id` text,
	`reference_id` text,
	`resources` text,
	`requested_user_info_claims` text,
	`scopes` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`client_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_oauth_consents`("id", "client_id", "user_id", "reference_id", "resources", "requested_user_info_claims", "scopes", "created_at", "updated_at") SELECT "id", "client_id", "user_id", "reference_id", "resources", "requested_user_info_claims", "scopes", "created_at", "updated_at" FROM `oauth_consents`;--> statement-breakpoint
DROP TABLE `oauth_consents`;--> statement-breakpoint
ALTER TABLE `__new_oauth_consents` RENAME TO `oauth_consents`;--> statement-breakpoint
CREATE TABLE `__new_oauth_refresh_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`client_id` text NOT NULL,
	`session_id` text,
	`user_id` text NOT NULL,
	`reference_id` text,
	`authorization_code_id` text,
	`resources` text,
	`requested_user_info_claims` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`revoked` integer,
	`rotated_at` integer,
	`rotation_replay_response` text,
	`rotation_replay_expires_at` integer,
	`auth_time` integer,
	`confirmation` text,
	`scopes` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`client_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_oauth_refresh_tokens`("id", "token", "client_id", "session_id", "user_id", "reference_id", "authorization_code_id", "resources", "requested_user_info_claims", "expires_at", "created_at", "revoked", "rotated_at", "rotation_replay_response", "rotation_replay_expires_at", "auth_time", "confirmation", "scopes") SELECT "id", "token", "client_id", "session_id", "user_id", "reference_id", "authorization_code_id", "resources", "requested_user_info_claims", "expires_at", "created_at", "revoked", "rotated_at", "rotation_replay_response", "rotation_replay_expires_at", "auth_time", "confirmation", "scopes" FROM `oauth_refresh_tokens`;--> statement-breakpoint
DROP TABLE `oauth_refresh_tokens`;--> statement-breakpoint
ALTER TABLE `__new_oauth_refresh_tokens` RENAME TO `oauth_refresh_tokens`;--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_refresh_tokens_token_unique` ON `oauth_refresh_tokens` (`token`);