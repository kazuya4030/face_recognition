// SQLite（Node.js 内蔵 node:sqlite）によるスキーマ定義。ネイティブモジュールのビルドを不要にするため採用。
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA_VERSION = 3;

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

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  source_job_id INTEGER,
  source_deliverable_id INTEGER,
  source_revision INTEGER,
  source_approval_id INTEGER,
  note TEXT NOT NULL DEFAULT '',
  removed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS attachments_job ON attachments(job_id);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  run_id INTEGER,
  stage_kind TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  text TEXT NOT NULL,
  answer TEXT,
  answered_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS questions_job ON questions(job_id);

CREATE TABLE IF NOT EXISTS ceo_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  kind TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL,
  promoted_item_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ceo_notes_job ON ceo_notes(job_id);

CREATE TABLE IF NOT EXISTS memory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  source_note_id INTEGER,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_versions (
  item_id INTEGER NOT NULL REFERENCES memory_items(id),
  version INTEGER NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (item_id, version)
);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS research_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS company_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

/**
 * 既存のデータベースに後から追加した列。CREATE TABLE IF NOT EXISTS では既存の表に列が増えないため、
 * 起動時に不足している列だけを ALTER TABLE で追加する（既存の行は既定値になる）。
 */
const ADDED_COLUMNS: Record<string, [string, string][]> = {
  employees: [
    ['output_format', "TEXT NOT NULL DEFAULT ''"],
    ['escalation', "TEXT NOT NULL DEFAULT ''"],
    ['refs', "TEXT NOT NULL DEFAULT '[]'"],
    ['defaults_version', 'INTEGER NOT NULL DEFAULT 1'],
  ],
  jobs: [
    ['use_research', 'INTEGER NOT NULL DEFAULT 0'],
    ['revision', 'INTEGER NOT NULL DEFAULT 0'],
    ['review_rounds', 'INTEGER NOT NULL DEFAULT 0'],
    ['resume_stage_kind', 'TEXT'],
    ['attachment_ids', "TEXT NOT NULL DEFAULT '[]'"],
    ['hold_kind', 'TEXT'],
    ['hold_since', 'TEXT'],
    ['queue_order', 'REAL'],
    ['memory_refs', "TEXT NOT NULL DEFAULT '[]'"],
    ['stage_instructions', "TEXT NOT NULL DEFAULT '{}'"],
    ['review_plan', 'INTEGER NOT NULL DEFAULT 0'],
    ['research_web', 'INTEGER NOT NULL DEFAULT 1'],
    ['template_id', 'TEXT'],
    ['recurring_topic_id', 'INTEGER'],
  ],
  runs: [
    ['revision', 'INTEGER NOT NULL DEFAULT 0'],
    ['model', "TEXT NOT NULL DEFAULT ''"],
    ['usage', 'TEXT'],
    ['inputs', "TEXT NOT NULL DEFAULT '[]'"],
    ['outputs', "TEXT NOT NULL DEFAULT '[]'"],
    ['verdict', "TEXT NOT NULL DEFAULT 'none'"],
    ['memory_refs', "TEXT NOT NULL DEFAULT '[]'"],
    ['sources', "TEXT NOT NULL DEFAULT '[]'"],
  ],
  deliverables: [
    ['revision', 'INTEGER NOT NULL DEFAULT 0'],
    ['stage_kind', "TEXT NOT NULL DEFAULT ''"],
  ],
  approvals: [
    ['revision', 'INTEGER NOT NULL DEFAULT 0'],
    ['deliverable_ids', "TEXT NOT NULL DEFAULT '[]'"],
    ['review_verdict', "TEXT NOT NULL DEFAULT 'none'"],
  ],
};

function migrate(db: DatabaseSync): void {
  for (const [table, columns] of Object.entries(ADDED_COLUMNS)) {
    const existing = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));
    for (const [name, def] of columns) {
      if (!existing.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
    }
  }
  // 以前の版で作成した成果物は、工程の種類を記録した実行履歴から補う。
  db.exec(`UPDATE deliverables SET stage_kind = (SELECT stage_kind FROM runs WHERE runs.id = deliverables.run_id) WHERE stage_kind = ''`);
  db.prepare(`INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(String(SCHEMA_VERSION));
}

export function openDatabase(dataDir: string): DatabaseSync {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'office.sqlite'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}
