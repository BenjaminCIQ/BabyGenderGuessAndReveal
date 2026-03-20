DROP TABLE IF EXISTS votes;
DROP TABLE IF EXISTS reveal;
DROP TABLE IF EXISTS app_config;

CREATE TABLE votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    vote TEXT NOT NULL,
    ip_address TEXT,
    voter_id TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE reveal (
    id INTEGER PRIMARY KEY,
    revealed BOOLEAN NOT NULL DEFAULT 0,
    actual_gender TEXT
);

CREATE TABLE app_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    config_json TEXT NOT NULL DEFAULT '{}'
);

INSERT OR IGNORE INTO app_config (id, config_json) VALUES (1, '{}');