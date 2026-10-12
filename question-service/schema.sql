PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS question_challenges (
    id_hash TEXT PRIMARY KEY NOT NULL,
    nonce TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS question_sessions (
    token_hash TEXT PRIMARY KEY NOT NULL,
    subject_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS question_rate_limits (
    rate_key TEXT PRIMARY KEY NOT NULL,
    count INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS question_votes (
    topic_id INTEGER NOT NULL,
    floor INTEGER NOT NULL,
    subject_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (topic_id, floor, subject_hash)
);
CREATE TABLE IF NOT EXISTS question_jwks (
    id INTEGER PRIMARY KEY NOT NULL,
    jwks_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS question_votes_topic_floor ON question_votes (topic_id, floor);
CREATE INDEX IF NOT EXISTS question_challenges_expiry ON question_challenges (expires_at);
CREATE INDEX IF NOT EXISTS question_sessions_expiry ON question_sessions (expires_at);
CREATE INDEX IF NOT EXISTS question_rate_limits_expiry ON question_rate_limits (expires_at);
