// SQLite（Node.js 内蔵 node:sqlite）によるスキーマ定義。ネイティブモジュールのビルドを不要にするため採用。
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL,
  name TEXT NOT NULL,
  role_key TEXT NOT NULL,
  role_title TEXT NOT NULL,
  description TEXT NOT NULL,
  instructions TEXT NOT NULL,
  color TEXT NOT NULL,
  tools TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  purpose TEXT NOT NULL,
  details TEXT NOT NULL,
  acceptance_criteria TEXT NOT NULL,
  assignee_id TEXT NOT NULL REFERENCES employees(id),
  use_planner INTEGER NOT NULL,
  use_reviewer INTEGER NOT NULL,
  adapter TEXT NOT NULL,
  demo_scenario TEXT NOT NULL,
  status TEXT NOT NULL,
  status_note TEXT NOT NULL DEFAULT '',
  feedback TEXT NOT NULL DEFAULT '',
  attempt INTEGER NOT NULL DEFAULT 0,
  current_stage_index INTEGER NOT NULL DEFAULT 0,
  current_step_index INTEGER NOT NULL DEFAULT 0,
  pause_requested INTEGER NOT NULL DEFAULT 0,
  error_message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  attempt INTEGER NOT NULL,
  stage_index INTEGER NOT NULL,
  stage_kind TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  adapter TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  cost_usd REAL,
  cost_note TEXT NOT NULL DEFAULT '',
  num_turns INTEGER,
  summary TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS runs_job ON runs(job_id);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  run_id INTEGER,
  employee_id TEXT,
  actor TEXT NOT NULL,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS activities_job ON activities(job_id);

CREATE TABLE IF NOT EXISTS deliverables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  run_id INTEGER NOT NULL REFERENCES runs(id),
  employee_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  title TEXT NOT NULL,
  rel_path TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  is_demo INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS deliverables_job ON deliverables(job_id);

CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  attempt INTEGER NOT NULL,
  requested_by TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  items TEXT NOT NULL,
  status TEXT NOT NULL,
  ceo_comment TEXT NOT NULL DEFAULT '',
  decided_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS approvals_job ON approvals(job_id);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

export function openDatabase(dataDir: string): DatabaseSync {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'office.sqlite'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  db.exec(SCHEMA);
  db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)').run('schema_version', String(SCHEMA_VERSION));
  return db;
}
