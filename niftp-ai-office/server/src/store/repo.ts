// 永続化層。SQL はこのファイルに閉じ込め、業務処理側はドメイン型だけを扱う。
import type { DatabaseSync } from 'node:sqlite';
import { EMPLOYEE_DEFAULTS_VERSION, LEGACY_DEFAULT_NAMES, SEED_COMPANY, SEED_EMPLOYEES } from '../domain/seed.ts';
import { SEED_TEMPLATES } from '../domain/templates.ts';
import {
  DEFAULT_SETTINGS,
  NOT_CALLED_NOTE,
  type Activity,
  type AdapterId,
  type Approval,
  type Attachment,
  type CeoNote,
  type CompanyProfile,
  type HoldKind,
  type JobTemplate,
  type MemoryItem,
  type MemoryKind,
  type MemoryRef,
  type Question,
  type ResearchTopic,
  type SourceRecord,
  type Deliverable,
  type Employee,
  type Job,
  type JobStatus,
  type RefKey,
  type ReviewItem,
  type ReviewVerdict,
  type Run,
  type RunStatus,
  type RunUsage,
  type Settings,
  type StageKind,
} from '../domain/types.ts';

type Row = Record<string, unknown>;

export const now = () => new Date().toISOString();

const str = (v: unknown) => (v == null ? '' : String(v));
const num = (v: unknown) => Number(v);
const nullableStr = (v: unknown) => (v == null ? null : String(v));
const json = <T>(v: unknown, fallback: T): T => {
  if (v == null || v === '') return fallback;
  try {
    return JSON.parse(String(v)) as T;
  } catch {
    return fallback;
  }
};

function toEmployee(r: Row): Employee {
  return {
    id: str(r.id),
    sortOrder: num(r.sort_order),
    name: str(r.name),
    roleKey: str(r.role_key) as Employee['roleKey'],
    roleTitle: str(r.role_title),
    description: str(r.description),
    instructions: str(r.instructions),
    color: str(r.color),
    tools: JSON.parse(str(r.tools)) as string[],
    outputFormat: str(r.output_format),
    escalation: str(r.escalation),
    refs: json<RefKey[]>(r.refs, []),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

function toJob(r: Row): Job {
  return {
    id: num(r.id),
    title: str(r.title),
    purpose: str(r.purpose),
    details: str(r.details),
    acceptanceCriteria: str(r.acceptance_criteria),
    assigneeId: str(r.assignee_id),
    usePlanner: Boolean(r.use_planner),
    useResearch: Boolean(r.use_research),
    useReviewer: Boolean(r.use_reviewer),
    adapter: str(r.adapter) as AdapterId,
    demoScenario: str(r.demo_scenario) as Job['demoScenario'],
    status: str(r.status) as JobStatus,
    statusNote: str(r.status_note),
    feedback: str(r.feedback),
    attempt: num(r.attempt),
    revision: num(r.revision ?? 0),
    reviewRounds: num(r.review_rounds ?? 0),
    resumeStageKind: (nullableStr(r.resume_stage_kind) as StageKind | null) || null,
    attachmentIds: json<number[]>(r.attachment_ids, []),
    memoryRefs: json<MemoryRef[]>(r.memory_refs, []),
    holdKind: (nullableStr(r.hold_kind) as HoldKind | null) || null,
    holdSince: nullableStr(r.hold_since),
    queueOrder: r.queue_order == null ? num(r.id) : num(r.queue_order),
    stageInstructions: json<Partial<Record<StageKind, string>>>(r.stage_instructions, {}),
    reviewPlan: Boolean(r.review_plan),
    researchWeb: r.research_web == null ? true : Boolean(r.research_web),
    templateId: nullableStr(r.template_id),
    recurringTopicId: r.recurring_topic_id == null ? null : num(r.recurring_topic_id),
    currentStageIndex: num(r.current_stage_index),
    currentStepIndex: num(r.current_step_index),
    pauseRequested: Boolean(r.pause_requested),
    errorMessage: str(r.error_message),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
    startedAt: nullableStr(r.started_at),
    finishedAt: nullableStr(r.finished_at),
  };
}

function toRun(r: Row): Run {
  return {
    id: num(r.id),
    jobId: num(r.job_id),
    attempt: num(r.attempt),
    revision: num(r.revision ?? 0),
    stageIndex: num(r.stage_index),
    stageKind: str(r.stage_kind) as StageKind,
    employeeId: str(r.employee_id),
    adapter: str(r.adapter) as AdapterId,
    status: str(r.status) as RunStatus,
    startedAt: str(r.started_at),
    finishedAt: nullableStr(r.finished_at),
    costUsd: r.cost_usd == null ? null : num(r.cost_usd),
    costNote: str(r.cost_note),
    numTurns: r.num_turns == null ? null : num(r.num_turns),
    model: str(r.model),
    usage: json<RunUsage | null>(r.usage, null),
    inputs: json<string[]>(r.inputs, []),
    outputs: json<string[]>(r.outputs, []),
    verdict: (str(r.verdict) || 'none') as ReviewVerdict,
    memoryRefs: json<MemoryRef[]>(r.memory_refs, []),
    sources: json<SourceRecord[]>(r.sources, []),
    summary: str(r.summary),
    error: str(r.error),
  };
}

function toActivity(r: Row): Activity {
  return {
    id: num(r.id),
    jobId: num(r.job_id),
    runId: r.run_id == null ? null : num(r.run_id),
    employeeId: nullableStr(r.employee_id),
    actor: str(r.actor) as Activity['actor'],
    kind: str(r.kind) as Activity['kind'],
    message: str(r.message),
    detail: str(r.detail),
    createdAt: str(r.created_at),
  };
}

function toDeliverable(r: Row): Deliverable {
  return {
    id: num(r.id),
    jobId: num(r.job_id),
    runId: num(r.run_id),
    employeeId: str(r.employee_id),
    attempt: num(r.attempt),
    revision: num(r.revision ?? 0),
    stageKind: str(r.stage_kind) as StageKind,
    title: str(r.title),
    relPath: str(r.rel_path),
    mime: str(r.mime),
    size: num(r.size),
    sha256: str(r.sha256),
    isDemo: Boolean(r.is_demo),
    createdAt: str(r.created_at),
  };
}

function toAttachment(r: Row): Attachment {
  const n = (v: unknown) => (v == null ? null : num(v));
  return {
    id: num(r.id),
    jobId: num(r.job_id),
    kind: str(r.kind) as Attachment['kind'],
    name: str(r.name),
    mime: str(r.mime),
    size: num(r.size),
    sha256: str(r.sha256),
    sourceJobId: n(r.source_job_id),
    sourceDeliverableId: n(r.source_deliverable_id),
    sourceRevision: n(r.source_revision),
    sourceApprovalId: n(r.source_approval_id),
    note: str(r.note),
    removedAt: nullableStr(r.removed_at),
    createdAt: str(r.created_at),
  };
}

function toApproval(r: Row): Approval {
  return {
    id: num(r.id),
    jobId: num(r.job_id),
    attempt: num(r.attempt),
    revision: num(r.revision ?? 0),
    deliverableIds: json<number[]>(r.deliverable_ids, []),
    reviewVerdict: (str(r.review_verdict) || 'none') as ReviewVerdict,
    requestedBy: str(r.requested_by),
    title: str(r.title),
    summary: str(r.summary),
    items: JSON.parse(str(r.items)) as ReviewItem[],
    status: str(r.status) as Approval['status'],
    ceoComment: str(r.ceo_comment),
    decidedAt: nullableStr(r.decided_at),
    createdAt: str(r.created_at),
  };
}

export type JobPatch = Partial<
  Pick<
    Job,
    | 'status'
    | 'statusNote'
    | 'feedback'
    | 'attempt'
    | 'revision'
    | 'reviewRounds'
    | 'resumeStageKind'
    | 'attachmentIds'
    | 'memoryRefs'
    | 'holdKind'
    | 'holdSince'
    | 'queueOrder'
    | 'stageInstructions'
    | 'currentStageIndex'
    | 'currentStepIndex'
    | 'pauseRequested'
    | 'errorMessage'
    | 'startedAt'
    | 'finishedAt'
  >
>;

const JOB_COLUMNS: Record<keyof JobPatch, string> = {
  status: 'status',
  statusNote: 'status_note',
  feedback: 'feedback',
  attempt: 'attempt',
  revision: 'revision',
  reviewRounds: 'review_rounds',
  resumeStageKind: 'resume_stage_kind',
  attachmentIds: 'attachment_ids',
  memoryRefs: 'memory_refs',
  holdKind: 'hold_kind',
  holdSince: 'hold_since',
  queueOrder: 'queue_order',
  stageInstructions: 'stage_instructions',
  currentStageIndex: 'current_stage_index',
  currentStepIndex: 'current_step_index',
  pauseRequested: 'pause_requested',
  errorMessage: 'error_message',
  startedAt: 'started_at',
  finishedAt: 'finished_at',
};

export class Repo {
  constructor(readonly db: DatabaseSync) {}

  private txDepth = 0;

  /** トランザクション。入れ子で呼ばれた場合は外側のトランザクションにまとめる。 */
  transaction<T>(fn: () => T): T {
    if (this.txDepth > 0) return fn();
    this.txDepth++;
    try {
      return this.runTransaction(fn);
    } finally {
      this.txDepth--;
    }
  }

  private runTransaction<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  seedIfEmpty(): void {
    if (!this.db.prepare('SELECT id FROM company_profile WHERE id = 1').get()) {
      this.db.prepare('INSERT INTO company_profile (id, data, updated_at) VALUES (1, ?, ?)').run(JSON.stringify(SEED_COMPANY), now());
    }
    // 会社情報の確定事項・仮説・未確認を、版つきの「会社の記憶」へ一度だけ移す（以後は記憶が正）
    if (!this.db.prepare(`SELECT value FROM meta WHERE key = 'memory_migrated'`).get()) {
      const stored = this.getCompanyRaw();
      this.transaction(() => {
        for (const t of stored.facts) this.addMemory('policy', t);
        for (const t of stored.hypotheses) this.addMemory('hypothesis', t);
        for (const t of stored.unknowns) this.addMemory('undecided', t);
        this.db.prepare(`INSERT INTO meta (key, value) VALUES ('memory_migrated', '1')`).run();
      });
    }
    for (const [i, t] of SEED_TEMPLATES.entries()) {
      if (!this.db.prepare('SELECT id FROM templates WHERE id = ?').get(t.id)) this.saveTemplate(t, i + 1);
    }
    const count = num((this.db.prepare('SELECT COUNT(*) AS c FROM employees').get() as Row).c);
    if (count > 0) {
      this.renameUntouchedDefaults();
      this.applyUntouchedDuties();
      this.addMissingSeedEmployees();
      return;
    }
    const t = now();
    const stmt = this.db.prepare(
      `INSERT INTO employees (id, sort_order, name, role_key, role_title, description, instructions, color, tools, output_format, escalation, refs, defaults_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const e of SEED_EMPLOYEES) {
      stmt.run(
        e.id, e.sortOrder, e.name, e.roleKey, e.roleTitle, e.description, e.instructions, e.color, JSON.stringify(e.tools),
        e.outputFormat, e.escalation, JSON.stringify(e.refs), EMPLOYEE_DEFAULTS_VERSION, t, t,
      );
    }
  }

  /** 後から追加した初期社員（研究員など）が既存の DB にいなければ追加する。既存の社員は変えない。 */
  private addMissingSeedEmployees(): void {
    const t = now();
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO employees (id, sort_order, name, role_key, role_title, description, instructions, color, tools, output_format, escalation, refs, defaults_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const e of SEED_EMPLOYEES) {
      stmt.run(
        e.id, e.sortOrder, e.name, e.roleKey, e.roleTitle, e.description, e.instructions, e.color, JSON.stringify(e.tools),
        e.outputFormat, e.escalation, JSON.stringify(e.refs), EMPLOYEE_DEFAULTS_VERSION, t, t,
      );
    }
  }

  /**
   * 利用者が編集していない社員（created_at = updated_at）だけ、新しい版の担当指示・提出形式・
   * 人間に戻す条件・参照情報・ツールに更新する。名前と見た目は変えない。
   */
  private applyUntouchedDuties(): void {
    const stmt = this.db.prepare(
      `UPDATE employees SET description = ?, instructions = ?, tools = ?, output_format = ?, escalation = ?, refs = ?, defaults_version = ?
       WHERE id = ? AND created_at = updated_at AND defaults_version < ?`,
    );
    for (const e of SEED_EMPLOYEES) {
      stmt.run(e.description, e.instructions, JSON.stringify(e.tools), e.outputFormat, e.escalation, JSON.stringify(e.refs), EMPLOYEE_DEFAULTS_VERSION, e.id, EMPLOYEE_DEFAULTS_VERSION);
    }
  }

  /** 初期名のまま変更されていない社員だけを、現在の仮の名前・役割表記へ更新する。 */
  private renameUntouchedDefaults(): void {
    const stmt = this.db.prepare('UPDATE employees SET name = ?, role_title = ? WHERE id = ? AND name = ? AND created_at = updated_at');
    for (const e of SEED_EMPLOYEES) {
      const legacy = LEGACY_DEFAULT_NAMES[e.id];
      if (legacy) stmt.run(e.name, e.roleTitle, e.id, legacy);
    }
  }

  // ---- 社員 ----
  listEmployees(): Employee[] {
    return (this.db.prepare('SELECT * FROM employees ORDER BY sort_order, id').all() as Row[]).map(toEmployee);
  }

  getEmployee(id: string): Employee | undefined {
    const r = this.db.prepare('SELECT * FROM employees WHERE id = ?').get(id) as Row | undefined;
    return r ? toEmployee(r) : undefined;
  }

  updateEmployee(
    id: string,
    patch: Pick<Employee, 'name' | 'roleTitle' | 'description' | 'instructions' | 'color' | 'tools' | 'outputFormat' | 'escalation' | 'refs'>,
  ): void {
    this.db
      .prepare(
        `UPDATE employees SET name = ?, role_title = ?, description = ?, instructions = ?, color = ?, tools = ?, output_format = ?, escalation = ?, refs = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        patch.name, patch.roleTitle, patch.description, patch.instructions, patch.color, JSON.stringify(patch.tools),
        patch.outputFormat, patch.escalation, JSON.stringify(patch.refs), now(), id,
      );
  }

  // ---- 会社情報 ----
  private getCompanyRaw(): CompanyProfile {
    const r = this.db.prepare('SELECT data, updated_at FROM company_profile WHERE id = 1').get() as Row | undefined;
    const data = r ? json<Partial<CompanyProfile>>(r.data, {}) : {};
    return { ...SEED_COMPANY, ...data, updatedAt: r ? str(r.updated_at) : '' };
  }

  /** 会社情報。会社名・CEO・状態は company_profile、確定事項・仮説・未決事項は会社の記憶（有効な最新版）から作る。 */
  getCompany(): CompanyProfile {
    const base = this.getCompanyRaw();
    const mem = this.listMemory();
    const latest = [base.updatedAt, ...mem.map((m) => m.updatedAt)].reduce((a, b) => (b > a ? b : a), '');
    return {
      ...base,
      facts: mem.filter((m) => m.kind === 'policy').map((m) => m.text),
      hypotheses: mem.filter((m) => m.kind === 'hypothesis').map((m) => m.text),
      unknowns: mem.filter((m) => m.kind === 'undecided').map((m) => m.text),
      updatedAt: latest,
    };
  }

  saveCompany(c: Omit<CompanyProfile, 'updatedAt'>): void {
    this.db
      .prepare('INSERT INTO company_profile (id, data, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
      .run(JSON.stringify(c), now());
  }

  // ---- 案件 ----
  createJob(
    input: Pick<
      Job,
      'title' | 'purpose' | 'details' | 'acceptanceCriteria' | 'assigneeId' | 'usePlanner' | 'useResearch' | 'useReviewer' | 'adapter' | 'demoScenario'
    > &
      Partial<Pick<Job, 'reviewPlan' | 'researchWeb' | 'templateId' | 'stageInstructions' | 'recurringTopicId'>>,
  ): Job {
    const t = now();
    const info = this.db
      .prepare(
        `INSERT INTO jobs (title, purpose, details, acceptance_criteria, assignee_id, use_planner, use_research, use_reviewer, adapter, demo_scenario,
           review_plan, research_web, template_id, stage_instructions, recurring_topic_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
      )
      .run(
        input.title,
        input.purpose,
        input.details,
        input.acceptanceCriteria,
        input.assigneeId,
        input.usePlanner ? 1 : 0,
        input.useResearch ? 1 : 0,
        input.useReviewer ? 1 : 0,
        input.adapter,
        input.demoScenario,
        input.reviewPlan ? 1 : 0,
        input.researchWeb === false ? 0 : 1,
        input.templateId ?? null,
        JSON.stringify(input.stageInstructions ?? {}),
        input.recurringTopicId ?? null,
        t,
        t,
      );
    const id = Number(info.lastInsertRowid);
    this.db.prepare('UPDATE jobs SET queue_order = ? WHERE id = ?').run(id, id);
    return this.getJob(id)!;
  }

  getJob(id: number): Job | undefined {
    const r = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Row | undefined;
    return r ? toJob(r) : undefined;
  }

  listJobs(): Job[] {
    return (this.db.prepare('SELECT * FROM jobs ORDER BY id DESC').all() as Row[]).map(toJob);
  }

  listJobsByStatus(status: JobStatus): Job[] {
    return (this.db.prepare('SELECT * FROM jobs WHERE status = ? ORDER BY COALESCE(queue_order, id), id').all(status) as Row[]).map(toJob);
  }

  updateJob(id: number, patch: JobPatch): Job {
    const keys = Object.keys(patch) as (keyof JobPatch)[];
    if (keys.length > 0) {
      const sets = keys.map((k) => `${JOB_COLUMNS[k]} = ?`).join(', ');
      const values = keys.map((k) => {
        const v = patch[k];
        return typeof v === 'boolean' ? (v ? 1 : 0) : v != null && typeof v === 'object' ? JSON.stringify(v) : (v ?? null);
      });
      this.db.prepare(`UPDATE jobs SET ${sets}, updated_at = ? WHERE id = ?`).run(...values, now(), id);
    }
    return this.getJob(id)!;
  }

  setJobAdapter(id: number, adapter: AdapterId): void {
    this.db.prepare('UPDATE jobs SET adapter = ?, demo_scenario = CASE WHEN ? = \'demo\' THEN demo_scenario ELSE \'normal\' END, updated_at = ? WHERE id = ?').run(adapter, adapter, now(), id);
  }

  // ---- 実行履歴 ----
  createRun(input: {
    jobId: number;
    attempt: number;
    revision: number;
    stageIndex: number;
    stageKind: StageKind;
    employeeId: string;
    adapter: AdapterId;
    inputs: string[];
    memoryRefs?: MemoryRef[];
  }): Run {
    const info = this.db
      .prepare(
        `INSERT INTO runs (job_id, attempt, revision, stage_index, stage_kind, employee_id, adapter, status, inputs, memory_refs, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?)`,
      )
      .run(
        input.jobId, input.attempt, input.revision, input.stageIndex, input.stageKind, input.employeeId, input.adapter,
        JSON.stringify(input.inputs), JSON.stringify(input.memoryRefs ?? []), now(),
      );
    return this.getRun(Number(info.lastInsertRowid))!;
  }

  getRun(id: number): Run | undefined {
    const r = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as Row | undefined;
    return r ? toRun(r) : undefined;
  }

  listRuns(jobId?: number): Run[] {
    const rows = jobId == null
      ? this.db.prepare('SELECT * FROM runs ORDER BY id').all()
      : this.db.prepare('SELECT * FROM runs WHERE job_id = ? ORDER BY id').all(jobId);
    return (rows as Row[]).map(toRun);
  }

  listRunningRuns(): Run[] {
    return (this.db.prepare(`SELECT * FROM runs WHERE status = 'running'`).all() as Row[]).map(toRun);
  }

  finishRun(
    id: number,
    r: {
      status: RunStatus;
      costUsd: number | null;
      costNote: string;
      numTurns: number | null;
      summary: string;
      error: string;
      model?: string;
      usage?: RunUsage | null;
      outputs?: string[];
      verdict?: ReviewVerdict;
      sources?: SourceRecord[];
    },
  ): void {
    this.db
      .prepare(
        `UPDATE runs SET status = ?, finished_at = ?, cost_usd = ?, cost_note = ?, num_turns = ?, summary = ?, error = ?, model = ?, usage = ?, outputs = ?, verdict = ?, sources = ? WHERE id = ?`,
      )
      .run(
        r.status, now(), r.costUsd, r.costNote, r.numTurns, r.summary, r.error,
        r.model ?? '', r.usage ? JSON.stringify(r.usage) : null, JSON.stringify(r.outputs ?? []), r.verdict ?? 'none', JSON.stringify(r.sources ?? []), id,
      );
  }

  /** 期間内（ISO 文字列の範囲）に開始した実接続の実行の費用合計と、費用を取得できなかった実行の数。 */
  realCostBetween(fromIso: string, toIso: string): { knownUsd: number; unknownRuns: number; runs: number } {
    const r = this.db
      .prepare(
        `SELECT COALESCE(SUM(cost_usd), 0) AS s, SUM(CASE WHEN cost_usd IS NULL AND cost_note != ? AND status != 'running' THEN 1 ELSE 0 END) AS u,
                SUM(CASE WHEN cost_note != ? THEN 1 ELSE 0 END) AS n
         FROM runs WHERE adapter != 'demo' AND started_at >= ? AND started_at < ?`,
      )
      .get(NOT_CALLED_NOTE, NOT_CALLED_NOTE, fromIso, toIso) as Row;
    return { knownUsd: num(r.s), unknownRuns: num(r.u ?? 0), runs: num(r.n ?? 0) };
  }

  /** この実行（attempt）で工程に使った時間の合計（秒）。 */
  attemptElapsedSec(jobId: number, attempt: number): number {
    const rows = this.db.prepare('SELECT started_at, finished_at FROM runs WHERE job_id = ? AND attempt = ?').all(jobId, attempt) as Row[];
    return rows.reduce((s, r) => s + Math.max(0, (Date.parse(str(r.finished_at) || now()) - Date.parse(str(r.started_at))) / 1000), 0);
  }

  /** この案件の実接続の実行で、報告された費用の合計と、費用を取得できなかった実行の数。 */
  jobRealCost(jobId: number): { knownUsd: number; unknownRuns: number } {
    const r = this.db
      .prepare(`SELECT COALESCE(SUM(cost_usd), 0) AS s, SUM(CASE WHEN cost_usd IS NULL AND cost_note != ? THEN 1 ELSE 0 END) AS u FROM runs WHERE job_id = ? AND adapter != 'demo'`)
      .get(NOT_CALLED_NOTE, jobId) as Row;
    return { knownUsd: num(r.s), unknownRuns: num(r.u ?? 0) };
  }

  countRunsInAttempt(jobId: number, attempt: number): number {
    return num((this.db.prepare(`SELECT COUNT(*) AS c FROM runs WHERE job_id = ? AND attempt = ?`).get(jobId, attempt) as Row).c);
  }

  /** 当日（ローカル日付ではなくUTC日付）に開始した実接続の実行数。上限判定に使う。 */
  countRunsStartedToday(adapter: AdapterId): number {
    const day = new Date().toISOString().slice(0, 10);
    const r = this.db.prepare(`SELECT COUNT(*) AS c FROM runs WHERE adapter = ? AND substr(started_at, 1, 10) = ?`).get(adapter, day) as Row;
    return num(r.c);
  }

  // ---- 作業履歴 ----
  addActivity(a: Omit<Activity, 'id' | 'createdAt'>): Activity {
    const info = this.db
      .prepare(`INSERT INTO activities (job_id, run_id, employee_id, actor, kind, message, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(a.jobId, a.runId, a.employeeId, a.actor, a.kind, a.message, a.detail, now());
    return toActivity(this.db.prepare('SELECT * FROM activities WHERE id = ?').get(Number(info.lastInsertRowid)) as Row);
  }

  listActivities(jobId: number): Activity[] {
    return (this.db.prepare('SELECT * FROM activities WHERE job_id = ? ORDER BY id').all(jobId) as Row[]).map(toActivity);
  }

  // ---- 成果物 ----
  addDeliverable(d: Omit<Deliverable, 'id' | 'createdAt'>): Deliverable {
    const info = this.db
      .prepare(
        `INSERT INTO deliverables (job_id, run_id, employee_id, attempt, revision, stage_kind, title, rel_path, mime, size, sha256, is_demo, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(d.jobId, d.runId, d.employeeId, d.attempt, d.revision, d.stageKind, d.title, d.relPath, d.mime, d.size, d.sha256, d.isDemo ? 1 : 0, now());
    return this.getDeliverable(Number(info.lastInsertRowid))!;
  }

  getDeliverable(id: number): Deliverable | undefined {
    const r = this.db.prepare('SELECT * FROM deliverables WHERE id = ?').get(id) as Row | undefined;
    return r ? toDeliverable(r) : undefined;
  }

  listDeliverables(jobId?: number): Deliverable[] {
    const rows = jobId == null
      ? this.db.prepare('SELECT * FROM deliverables ORDER BY id DESC').all()
      : this.db.prepare('SELECT * FROM deliverables WHERE job_id = ? ORDER BY id').all(jobId);
    return (rows as Row[]).map(toDeliverable);
  }

  // ---- 資料（添付・参照） ----
  addAttachment(a: Omit<Attachment, 'id' | 'createdAt' | 'removedAt'>): Attachment {
    const info = this.db
      .prepare(
        `INSERT INTO attachments (job_id, kind, name, mime, size, sha256, source_job_id, source_deliverable_id, source_revision, source_approval_id, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(a.jobId, a.kind, a.name, a.mime, a.size, a.sha256, a.sourceJobId, a.sourceDeliverableId, a.sourceRevision, a.sourceApprovalId, a.note, now());
    return this.getAttachment(Number(info.lastInsertRowid))!;
  }

  getAttachment(id: number): Attachment | undefined {
    const r = this.db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as Row | undefined;
    return r ? toAttachment(r) : undefined;
  }

  listAttachments(jobId: number): Attachment[] {
    return (this.db.prepare('SELECT * FROM attachments WHERE job_id = ? ORDER BY id').all(jobId) as Row[]).map(toAttachment);
  }

  removeAttachment(id: number): void {
    this.db.prepare('UPDATE attachments SET removed_at = ? WHERE id = ? AND removed_at IS NULL').run(now(), id);
  }

  // ---- 社員からの質問 ----
  addQuestion(q: Omit<Question, 'id' | 'createdAt' | 'answer' | 'answeredAt'>): Question {
    const info = this.db
      .prepare('INSERT INTO questions (job_id, run_id, stage_kind, employee_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(q.jobId, q.runId, q.stageKind, q.employeeId, q.text, now());
    return this.listQuestions(q.jobId).find((x) => x.id === Number(info.lastInsertRowid))!;
  }

  listQuestions(jobId?: number): Question[] {
    const rows = jobId == null
      ? this.db.prepare('SELECT * FROM questions ORDER BY id').all()
      : this.db.prepare('SELECT * FROM questions WHERE job_id = ? ORDER BY id').all(jobId);
    return (rows as Row[]).map((r) => ({
      id: num(r.id), jobId: num(r.job_id), runId: r.run_id == null ? null : num(r.run_id), stageKind: str(r.stage_kind) as StageKind,
      employeeId: str(r.employee_id), text: str(r.text), answer: nullableStr(r.answer), answeredAt: nullableStr(r.answered_at), createdAt: str(r.created_at),
    }));
  }

  answerQuestion(id: number, answer: string): void {
    this.db.prepare('UPDATE questions SET answer = ?, answered_at = ? WHERE id = ? AND answer IS NULL').run(answer, now(), id);
  }

  // ---- CEO の指摘（案件限定） ----
  addNote(n: Omit<CeoNote, 'id' | 'createdAt' | 'promotedItemId'>): CeoNote {
    const info = this.db.prepare('INSERT INTO ceo_notes (job_id, kind, revision, text, created_at) VALUES (?, ?, ?, ?, ?)').run(n.jobId, n.kind, n.revision, n.text, now());
    return this.listNotes().find((x) => x.id === Number(info.lastInsertRowid))!;
  }

  listNotes(jobId?: number): CeoNote[] {
    const rows = jobId == null
      ? this.db.prepare('SELECT * FROM ceo_notes ORDER BY id').all()
      : this.db.prepare('SELECT * FROM ceo_notes WHERE job_id = ? ORDER BY id').all(jobId);
    return (rows as Row[]).map((r) => ({
      id: num(r.id), jobId: num(r.job_id), kind: str(r.kind) as CeoNote['kind'], revision: num(r.revision), text: str(r.text),
      promotedItemId: r.promoted_item_id == null ? null : num(r.promoted_item_id), createdAt: str(r.created_at),
    }));
  }

  markNotePromoted(noteId: number, itemId: number): void {
    this.db.prepare('UPDATE ceo_notes SET promoted_item_id = ? WHERE id = ?').run(itemId, noteId);
  }

  // ---- 会社の記憶（版つき） ----
  listMemory(includeArchived = false): MemoryItem[] {
    const rows = this.db.prepare(`SELECT * FROM memory_items ${includeArchived ? '' : 'WHERE archived_at IS NULL'} ORDER BY id`).all() as Row[];
    return rows.map((r) => ({
      id: num(r.id), kind: str(r.kind) as MemoryKind, text: str(r.text), version: num(r.version),
      sourceNoteId: r.source_note_id == null ? null : num(r.source_note_id), archivedAt: nullableStr(r.archived_at),
      createdAt: str(r.created_at), updatedAt: str(r.updated_at),
    }));
  }

  getMemory(id: number): MemoryItem | undefined {
    return this.listMemory(true).find((m) => m.id === id);
  }

  addMemory(kind: MemoryKind, text: string, sourceNoteId: number | null = null): MemoryItem {
    const t = now();
    return this.transaction(() => {
      const info = this.db.prepare('INSERT INTO memory_items (kind, text, version, source_note_id, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)').run(kind, text, sourceNoteId, t, t);
      const id = Number(info.lastInsertRowid);
      this.db.prepare('INSERT INTO memory_versions (item_id, version, kind, text, archived, created_at) VALUES (?, 1, ?, ?, 0, ?)').run(id, kind, text, t);
      return this.getMemory(id)!;
    });
  }

  /** 内容・種類の変更、またはアーカイブ。版を 1 上げ、変更前の版は memory_versions に残る。 */
  updateMemory(id: number, patch: { kind?: MemoryKind; text?: string; archived?: boolean }): MemoryItem {
    const cur = this.getMemory(id)!;
    const t = now();
    const kind = patch.kind ?? cur.kind;
    const text = patch.text ?? cur.text;
    const archived = patch.archived ?? cur.archivedAt != null;
    return this.transaction(() => {
      this.db.prepare('UPDATE memory_items SET kind = ?, text = ?, version = version + 1, archived_at = ?, updated_at = ? WHERE id = ?').run(kind, text, archived ? (cur.archivedAt ?? t) : null, t, id);
      this.db.prepare('INSERT INTO memory_versions (item_id, version, kind, text, archived, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, cur.version + 1, kind, text, archived ? 1 : 0, t);
      return this.getMemory(id)!;
    });
  }

  /** 指定した ID と版の内容（実行時に固定した版を読み出す）。 */
  memoryVersion(ref: MemoryRef): { kind: MemoryKind; text: string } | undefined {
    const r = this.db.prepare('SELECT kind, text FROM memory_versions WHERE item_id = ? AND version = ?').get(ref.id, ref.version) as Row | undefined;
    return r ? { kind: str(r.kind) as MemoryKind, text: str(r.text) } : undefined;
  }

  // ---- 定期研究のテーマ ----
  listTopics(): ResearchTopic[] {
    return (this.db.prepare('SELECT * FROM research_topics ORDER BY id').all() as Row[]).map((r) => ({
      id: num(r.id), text: str(r.text), active: Boolean(r.active), createdAt: str(r.created_at),
    }));
  }

  addTopic(text: string): ResearchTopic {
    const info = this.db.prepare('INSERT INTO research_topics (text, active, created_at) VALUES (?, 1, ?)').run(text, now());
    return this.listTopics().find((t) => t.id === Number(info.lastInsertRowid))!;
  }

  updateTopic(id: number, patch: { text?: string; active?: boolean }): void {
    const cur = this.listTopics().find((t) => t.id === id);
    if (!cur) return;
    this.db.prepare('UPDATE research_topics SET text = ?, active = ? WHERE id = ?').run(patch.text ?? cur.text, (patch.active ?? cur.active) ? 1 : 0, id);
  }

  // ---- 業務テンプレート ----
  listTemplates(): JobTemplate[] {
    return (this.db.prepare('SELECT data FROM templates ORDER BY sort_order, id').all() as Row[]).map((r) => JSON.parse(str(r.data)) as JobTemplate);
  }

  saveTemplate(t: JobTemplate, sortOrder: number): void {
    this.db
      .prepare('INSERT INTO templates (id, sort_order, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
      .run(t.id, sortOrder, JSON.stringify(t), now());
  }

  // ---- 承認 ----
  createApproval(
    a: Pick<Approval, 'jobId' | 'attempt' | 'revision' | 'deliverableIds' | 'reviewVerdict' | 'requestedBy' | 'title' | 'summary' | 'items'>,
  ): Approval {
    const info = this.db
      .prepare(
        `INSERT INTO approvals (job_id, attempt, revision, deliverable_ids, review_verdict, requested_by, title, summary, items, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      )
      .run(a.jobId, a.attempt, a.revision, JSON.stringify(a.deliverableIds), a.reviewVerdict, a.requestedBy, a.title, a.summary, JSON.stringify(a.items), now());
    return this.getApproval(Number(info.lastInsertRowid))!;
  }

  getApproval(id: number): Approval | undefined {
    const r = this.db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as Row | undefined;
    return r ? toApproval(r) : undefined;
  }

  listApprovals(jobId?: number): Approval[] {
    const rows = jobId == null
      ? this.db.prepare('SELECT * FROM approvals ORDER BY id DESC').all()
      : this.db.prepare('SELECT * FROM approvals WHERE job_id = ? ORDER BY id').all(jobId);
    return (rows as Row[]).map(toApproval);
  }

  decideApproval(id: number, status: 'approved' | 'rejected' | 'superseded', comment: string): void {
    this.db.prepare(`UPDATE approvals SET status = ?, ceo_comment = ?, decided_at = ? WHERE id = ?`).run(status, comment, now(), id);
  }

  // ---- 待ち行列の状態（設定とは別に meta に保存） ----
  queueRunning(): boolean {
    const r = this.db.prepare(`SELECT value FROM meta WHERE key = 'queue_running'`).get() as Row | undefined;
    return r ? str(r.value) === '1' : true;
  }

  setQueueRunning(running: boolean): void {
    this.db.prepare(`INSERT INTO meta (key, value) VALUES ('queue_running', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(running ? '1' : '0');
  }

  // ---- 設定 ----
  getSettings(): Settings {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as Row[];
    const stored = Object.fromEntries(rows.map((r) => [str(r.key), JSON.parse(str(r.value))]));
    return { ...DEFAULT_SETTINGS, ...stored } as Settings;
  }

  saveSettings(s: Settings): void {
    const stmt = this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    this.transaction(() => {
      for (const [k, v] of Object.entries(s)) stmt.run(k, JSON.stringify(v));
    });
  }
}
