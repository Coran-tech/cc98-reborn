CREATE TABLE `question_jwks` (
	`id` integer PRIMARY KEY NOT NULL,
	`jwks_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
