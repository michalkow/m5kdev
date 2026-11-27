CREATE TABLE "app"."taggings" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"tag_id" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."tags" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"user_id" text,
	"member_id" text,
	"organization_id" text,
	"team_id" text,
	"scope" text DEFAULT 'personal' NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"type" text,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"parent_id" text,
	"assignable_to" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."support_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"file_id" text NOT NULL,
	"user_id" text,
	"message_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"purged_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app"."support_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"initiator_user_id" text,
	"organization_id" text,
	"subject" text NOT NULL,
	"ui_locale" text DEFAULT 'en' NOT NULL,
	"support_locale" text,
	"detected_locale" text,
	"experience_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"waiting_on" text DEFAULT 'support' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"assigned_user_id" text,
	"handling" text DEFAULT 'human' NOT NULL,
	"handling_epoch" integer DEFAULT 0 NOT NULL,
	"cycle" integer DEFAULT 1 NOT NULL,
	"snoozed_until" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"purging_at" timestamp with time zone,
	"origin" text NOT NULL,
	"client_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"last_sequence" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."support_corpora" (
	"id" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"application_version" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone NOT NULL,
	"activated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app"."support_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"corpus_id" text NOT NULL,
	"locale" text NOT NULL,
	"experience" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"text" text NOT NULL,
	"sha256" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."support_events" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"type" text NOT NULL,
	"actor_user_id" text,
	"actor_kind" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."support_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"cycle" integer NOT NULL,
	"user_id" text NOT NULL,
	"score" integer NOT NULL,
	"handled_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."support_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"author_user_id" text,
	"author_kind" text NOT NULL,
	"body" text NOT NULL,
	"attachment_ids" text[] DEFAULT '{}' NOT NULL,
	"redacted_at" timestamp with time zone,
	"authored_locale" text,
	"target_locale" text,
	"published_body" text,
	"translation_state" text DEFAULT 'none' NOT NULL,
	"citations" text[] DEFAULT '{}' NOT NULL,
	"ai_provenance" jsonb,
	"preview" boolean DEFAULT false NOT NULL,
	"renditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"client_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app"."support_reads" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"user_id" text NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."support_replies" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."support_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"config" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."support_settings_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."support_staff_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"locale" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."support_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"work_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"input_characters" integer NOT NULL,
	"output_characters" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."support_work" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"message_id" text,
	"user_id" text NOT NULL,
	"owner_epoch" integer DEFAULT 0 NOT NULL,
	"author_epoch" integer,
	"purpose" text NOT NULL,
	"locale" text NOT NULL,
	"source_hash" text NOT NULL,
	"epoch" integer NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"lease_until" timestamp with time zone,
	"next_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."files" ADD COLUMN "upload_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."files" ADD COLUMN "sealed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."files" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "app"."users" ADD COLUMN "lifecycle_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."taggings" ADD CONSTRAINT "taggings_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "app"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tags" ADD CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tags" ADD CONSTRAINT "tags_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "app"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tags" ADD CONSTRAINT "tags_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tags" ADD CONSTRAINT "tags_parent_id_tags_id_fk" FOREIGN KEY ("parent_id") REFERENCES "app"."tags"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."support_attachments" ADD CONSTRAINT "support_attachments_case_id_support_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "app"."support_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."support_attachments" ADD CONSTRAINT "support_attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."support_attachments" ADD CONSTRAINT "support_attachments_message_id_support_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "app"."support_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."support_cases" ADD CONSTRAINT "support_cases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."support_cases" ADD CONSTRAINT "support_cases_initiator_user_id_users_id_fk" FOREIGN KEY ("initiator_user_id") REFERENCES "app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."support_cases" ADD CONSTRAINT "support_cases_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."support_documents" ADD CONSTRAINT "support_documents_corpus_id_support_corpora_id_fk" FOREIGN KEY ("corpus_id") REFERENCES "app"."support_corpora"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."support_events" ADD CONSTRAINT "support_events_case_id_support_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "app"."support_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."support_events" ADD CONSTRAINT "support_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."support_feedback" ADD CONSTRAINT "support_feedback_case_id_support_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "app"."support_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."support_feedback" ADD CONSTRAINT "support_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."support_messages" ADD CONSTRAINT "support_messages_case_id_support_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "app"."support_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."support_messages" ADD CONSTRAINT "support_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."support_reads" ADD CONSTRAINT "support_reads_case_id_support_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "app"."support_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."support_reads" ADD CONSTRAINT "support_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."support_staff_preferences" ADD CONSTRAINT "support_staff_preferences_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."support_usage" ADD CONSTRAINT "support_usage_work_id_support_work_id_fk" FOREIGN KEY ("work_id") REFERENCES "app"."support_work"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."support_usage" ADD CONSTRAINT "support_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."support_work" ADD CONSTRAINT "support_work_case_id_support_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "app"."support_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."support_work" ADD CONSTRAINT "support_work_message_id_support_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "app"."support_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."support_work" ADD CONSTRAINT "support_work_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "support_attachments_file" ON "app"."support_attachments" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "support_attachments_case" ON "app"."support_attachments" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "support_attachments_owner" ON "app"."support_attachments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "support_cases_request" ON "app"."support_cases" USING btree ("initiator_user_id","client_id");--> statement-breakpoint
CREATE INDEX "support_cases_requester" ON "app"."support_cases" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "support_cases_cohort" ON "app"."support_cases" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "support_cases_queue" ON "app"."support_cases" USING btree ("status","waiting_on","assigned_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "support_corpora_version" ON "app"."support_corpora" USING btree ("version");--> statement-breakpoint
CREATE INDEX "support_documents_context" ON "app"."support_documents" USING btree ("corpus_id","experience","locale");--> statement-breakpoint
CREATE INDEX "support_documents_search_simple" ON "app"."support_documents" USING gin (to_tsvector('simple', "title" || ' ' || "text"));--> statement-breakpoint
CREATE INDEX "support_documents_search_english" ON "app"."support_documents" USING gin (to_tsvector('english', "title" || ' ' || "text"));--> statement-breakpoint
CREATE UNIQUE INDEX "support_events_sequence" ON "app"."support_events" USING btree ("case_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "support_feedback_cycle" ON "app"."support_feedback" USING btree ("case_id","cycle");--> statement-breakpoint
CREATE UNIQUE INDEX "support_messages_sequence" ON "app"."support_messages" USING btree ("case_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "support_messages_request" ON "app"."support_messages" USING btree ("case_id","author_user_id","client_id");--> statement-breakpoint
CREATE INDEX "support_messages_author" ON "app"."support_messages" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "support_messages_publication" ON "app"."support_messages" USING btree ("case_id","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "support_reads_reader" ON "app"."support_reads" USING btree ("case_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "support_settings_revision" ON "app"."support_settings_revisions" USING btree ("version");--> statement-breakpoint
CREATE INDEX "support_work_pending" ON "app"."support_work" USING btree ("state","next_at");--> statement-breakpoint
CREATE INDEX "support_work_case" ON "app"."support_work" USING btree ("case_id");