-- 한 판의 플레이 기록. 클라이언트가 보낸 run 객체를 거의 그대로 저장한다.
CREATE TABLE runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT NOT NULL,
  reached_stage INTEGER NOT NULL,
  stages_cleared INTEGER NOT NULL,
  cleared INTEGER NOT NULL DEFAULT 0,
  total_time_ms INTEGER NOT NULL,
  shots INTEGER NOT NULL DEFAULT 0,
  hits INTEGER NOT NULL DEFAULT 0,
  repels INTEGER NOT NULL DEFAULT 0,
  lookbacks INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  accuracy REAL NOT NULL DEFAULT 0,
  achievements TEXT NOT NULL DEFAULT '[]', -- JSON string[]
  stages TEXT NOT NULL DEFAULT '[]',       -- JSON StageRecord[]
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_runs_cleared_time ON runs (cleared DESC, total_time_ms ASC);
CREATE INDEX idx_runs_reached_stage ON runs (reached_stage DESC);

-- 닉네임별 누적 프로필. 랭킹/업적 화면이 여기서 읽는다.
CREATE TABLE profiles (
  nickname_lower TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  best_stage INTEGER NOT NULL DEFAULT 0,
  cleared INTEGER NOT NULL DEFAULT 0,
  best_clear_ms INTEGER,
  achievements TEXT NOT NULL DEFAULT '[]',
  total_shots INTEGER NOT NULL DEFAULT 0,
  total_hits INTEGER NOT NULL DEFAULT 0,
  runs INTEGER NOT NULL DEFAULT 0
);

-- 닉네임 x 스테이지별 최고 격퇴 기록. "STAGE N PREDATOR RECORD" 랭킹용.
CREATE TABLE stage_repels (
  nickname_lower TEXT NOT NULL,
  stage INTEGER NOT NULL,
  nickname TEXT NOT NULL,
  best_repels INTEGER NOT NULL DEFAULT 0,
  best_hits INTEGER NOT NULL DEFAULT 0,
  best_shots INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (nickname_lower, stage)
);

CREATE INDEX idx_stage_repels_stage ON stage_repels (stage, best_repels DESC);
