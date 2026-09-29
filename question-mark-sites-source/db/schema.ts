import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const questionMarks = sqliteTable("question_marks", {
  topicId: text("topic_id").notNull(),
  floor: integer("floor").notNull(),
  voterId: text("voter_id").notNull(),
}, (table) => [primaryKey({ columns: [table.topicId, table.floor, table.voterId] })]);

export const questionVotes = sqliteTable("question_votes", {
  topicId: integer("topic_id").notNull(),
  floor: integer("floor").notNull(),
  subjectHash: text("subject_hash").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.topicId, table.floor, table.subjectHash] })]);

export const questionChallenges = sqliteTable("question_challenges", {
  idHash: text("id_hash").primaryKey(),
  nonce: text("nonce").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const questionSessions = sqliteTable("question_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  subjectHash: text("subject_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const questionRateLimits = sqliteTable("question_rate_limits", {
  rateKey: text("rate_key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const questionJwks = sqliteTable("question_jwks", {
  id: integer("id").primaryKey(),
  jwksJson: text("jwks_json").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
