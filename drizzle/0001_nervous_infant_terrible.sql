ALTER TABLE "staff" ADD COLUMN "name_stress" jsonb;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "name_stress" jsonb;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "study_language" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "show_stress" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_muted" jsonb DEFAULT '[]'::jsonb NOT NULL;