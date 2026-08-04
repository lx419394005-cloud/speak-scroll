CREATE TABLE IF NOT EXISTS players (
  nickname TEXT PRIMARY KEY COLLATE NOCASE,
  best_score INTEGER NOT NULL,
  plays INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_players_best_score
  ON players (best_score DESC, updated_at ASC);
