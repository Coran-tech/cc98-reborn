CREATE TABLE `question_marks` (
	`topic_id` text NOT NULL,
	`floor` integer NOT NULL,
	`voter_id` text NOT NULL,
	PRIMARY KEY(`topic_id`, `floor`, `voter_id`)
);
