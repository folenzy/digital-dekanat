CREATE TABLE "lesson_notes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lesson_notes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"group_id" integer NOT NULL,
	"date" date NOT NULL,
	"pair" integer NOT NULL,
	"topic" text,
	"task" text,
	"materials" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "lesson_notes_group_date_pair_uq" UNIQUE("group_id","date","pair"),
	CONSTRAINT "lesson_notes_pair_chk" CHECK ("lesson_notes"."pair" between 1 and 6)
);
--> statement-breakpoint
ALTER TABLE "lesson_notes" ADD CONSTRAINT "lesson_notes_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;