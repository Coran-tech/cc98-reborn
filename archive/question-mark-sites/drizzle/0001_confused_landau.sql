CREATE TABLE `question_challenges` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`nonce` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `question_rate_limits` (
	`rate_key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `question_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`subject_hash` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `question_votes` (
	`topic_id` integer NOT NULL,
	`floor` integer NOT NULL,
	`subject_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`topic_id`, `floor`, `subject_hash`)
);
