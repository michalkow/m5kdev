CREATE INDEX "support_cases_snooze" ON "app"."support_cases" USING btree ("status","snoozed_until");--> statement-breakpoint
CREATE INDEX "support_cases_retention" ON "app"."support_cases" USING btree ("status","resolved_at");--> statement-breakpoint
CREATE INDEX "support_cases_purging" ON "app"."support_cases" USING btree ("purging_at") WHERE "app"."support_cases"."purging_at" is not null;--> statement-breakpoint
CREATE INDEX "support_usage_window" ON "app"."support_usage" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "support_usage_user_window" ON "app"."support_usage" USING btree ("kind","user_id","created_at");--> statement-breakpoint
CREATE INDEX "support_usage_work" ON "app"."support_usage" USING btree ("work_id");