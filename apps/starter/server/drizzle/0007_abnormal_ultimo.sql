ALTER TABLE `accounts` ADD `issuer` text DEFAULT 'local:credential' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_issuer_account_id_unique` ON `accounts` (`issuer`,`account_id`);