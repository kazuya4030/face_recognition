// 業務ドメインの型定義。画面・永続化・AI実行のどこからも参照される共通語彙。

export type AdapterId = 'demo' | 'claude';

/** 案件の状態。画面の5列（未着手/作業中/確認待ち/完了/エラー）へは boardColumnOf で対応付ける。 */
export type JobStatus =
  | 'draft' // 登録済み・未開始（差し戻し後もここに戻る）
  | 'queued' // 開始指示済み・実行待ち
  | 'running' // AI社員が実行中
  | 'paused' // 一時停止中
  | 'awaiting_review' // CEOの確認待ち
  | 'completed' // CEOが承認して完了
  | 'error' // 失敗・タイムアウト・中断
  | 'cancelled'; // CEOがキャンセル

export type BoardColumn = 'todo' | 'doing' | 'review' | 'done' | 'error';

/** 工程。作業計画（業務責任者）→ 調査（調査・企画）→ 成果物作成（担当）→ レビュー（品質確認）の順に実行する。 */
export type StageKind = 'plan' | 'research' | 'execute' | 'review';

/** レビューの判定。none はレビュー工程なし、unknown は判定を取得できなかった場合。 */
export type ReviewVerdict = 'pass' | 'fail' | 'unknown' | 'none';

/** 社員が参照できる情報（作業ディレクトリ内のどのファイルを入力として渡すか）。 */
export type RefKey = 'brief' | 'company' | 'plan' | 'research' | 'deliverables' | 'review' | 'feedback';

export type RunStatus =
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'timeout'
  | 'cancelled'
  | 'paused'
  | 'interrupted'
  | 'blocked'; // 必要な接続・情報がないため工程を保留した（実行は成功扱いにしない）

/** 社員の表示状態。実際の実行・承認状態から導出し、保存はしない。 */
export type EmployeeStatus = 'idle' | 'working' | 'waiting_review' | 'done' | 'error';

export type JobAction = 'start' | 'pause' | 'resume' | 'cancel';

/** デモの再現シナリオ。rework は第1版のレビューを不合格にして自動修正を再現する。 */
export type DemoScenario = 'normal' | 'error' | 'timeout' | 'rework';

export type ActivityKind =
  | 'status' // 状態変化
  | 'ceo' // CEOの操作
  | 'action' // AIが実行した操作（ツール呼び出し等）
  | 'result' // 工程の結果
  | 'evidence' // 根拠
  | 'question' // 確認事項
  | 'denied' // 権限で拒否された操作
  | 'error'
  | 'system';

export interface Employee {
  id: string;
  sortOrder: number;
  name: string;
  roleKey: 'manager' | 'researcher' | 'builder' | 'qa' | 'custom';
  roleTitle: string;
  description: string;
  instructions: string;
  color: string;
  /** Claude Code 実行時に許可するツール（--tools）。 */
  tools: string[];
  /** 提出形式（出力ファイルと書き方）。 */
  outputFormat: string;
  /** 人間（CEO）に判断を戻す条件。 */
  escalation: string;
  /** 参照できる情報。 */
  refs: RefKey[];
  createdAt: string;
  updatedAt: string;
}

export interface Job {
  id: number;
  title: string;
  purpose: string;
  details: string;
  acceptanceCriteria: string;
  assigneeId: string;
  usePlanner: boolean;
  useResearch: boolean;
  useReviewer: boolean;
  adapter: AdapterId;
  demoScenario: DemoScenario;
  status: JobStatus;
  statusNote: string;
  feedback: string;
  attempt: number;
  /** 成果物の版。成果物作成の工程を始めるたびに 1 増える。 */
  revision: number;
  /** この実行（attempt）中に、レビュー結果を受けて自動修正した回数。 */
  reviewRounds: number;
  /** 次回「続きから開始」したときに始める工程（差し戻し後は成果物作成、失敗後は失敗した工程）。 */
  resumeStageKind: StageKind | null;
  currentStageIndex: number;
  currentStepIndex: number;
  pauseRequested: boolean;
  errorMessage: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface Stage {
  index: number;
  kind: StageKind;
  employeeId: string;
}

export interface RunUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheCreationTokens: number | null;
  webSearchRequests: number | null;
}

export interface Run {
  id: number;
  jobId: number;
  attempt: number;
  revision: number;
  stageIndex: number;
  stageKind: StageKind;
  employeeId: string;
  adapter: AdapterId;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  /** 実行側が報告した費用（USD）。取得できない場合は null（画面では「未取得」）。 */
  costUsd: number | null;
  costNote: string;
  numTurns: number | null;
  /** 実行側が報告したモデル名。取得できなければ空。 */
  model: string;
  /** トークン数など。取得できなければ null。 */
  usage: RunUsage | null;
  /** この工程に入力として渡したファイル。 */
  inputs: string[];
  /** この工程で記録した成果物ファイル。 */
  outputs: string[];
  /** レビュー工程の判定（他の工程は none）。 */
  verdict: ReviewVerdict;
  summary: string;
  error: string;
}

/** AIを呼び出さずに終えた工程の費用欄の記録。費用の「未取得」とは区別する。 */
export const NOT_CALLED_NOTE = 'AIを呼び出していません';

export interface Activity {
  id: number;
  jobId: number;
  runId: number | null;
  employeeId: string | null;
  actor: 'ceo' | 'system' | 'ai';
  kind: ActivityKind;
  message: string;
  detail: string;
  createdAt: string;
}

export interface Deliverable {
  id: number;
  jobId: number;
  runId: number;
  employeeId: string;
  attempt: number;
  revision: number;
  stageKind: StageKind;
  title: string;
  relPath: string;
  mime: string;
  size: number;
  sha256: string;
  isDemo: boolean;
  createdAt: string;
}

export interface ReviewItem {
  text: string;
  severity: 'info' | 'warning' | 'blocker';
}

export interface Approval {
  id: number;
  jobId: number;
  attempt: number;
  /** 確認対象の成果物の版。承認はこの版にだけ有効で、新しい版には引き継がない。 */
  revision: number;
  /** 確認対象の成果物（この版の時点の保存版）の ID 一覧。 */
  deliverableIds: number[];
  reviewVerdict: ReviewVerdict;
  requestedBy: string;
  title: string;
  summary: string;
  items: ReviewItem[];
  status: 'pending' | 'approved' | 'rejected' | 'superseded';
  ceoComment: string;
  decidedAt: string | null;
  createdAt: string;
}

export interface Settings {
  defaultAdapter: AdapterId;
  claudeModel: string;
  maxTurns: number;
  maxBudgetUsd: number;
  timeoutSec: number;
  demoTimeoutSec: number;
  maxRunsPerDay: number;
  maxAttemptsPerJob: number;
  /** レビューで不合格のとき、CEOに戻す前に自動で修正する回数。 */
  maxAutoRework: number;
  /** 1案件あたりの実接続の費用上限（USD、Claude Code の報告値の合計）。 */
  maxJobBudgetUsd: number;
  /** 1回の実行（開始〜確認待ち）で起動する工程数の上限。 */
  maxStageRunsPerAttempt: number;
}

export const DEFAULT_SETTINGS: Settings = {
  defaultAdapter: 'demo',
  claudeModel: 'sonnet',
  maxTurns: 30,
  maxBudgetUsd: 1.0,
  timeoutSec: 900,
  demoTimeoutSec: 20,
  maxRunsPerDay: 20,
  maxAttemptsPerJob: 5,
  maxAutoRework: 1,
  maxJobBudgetUsd: 5,
  maxStageRunsPerAttempt: 8,
};

/** 設定値の許容範囲。範囲外の入力は拒否する（無限ループ・過剰実行の防止）。 */
export const SETTINGS_LIMITS: Record<Exclude<keyof Settings, 'defaultAdapter' | 'claudeModel'>, [number, number]> = {
  maxTurns: [1, 100],
  maxBudgetUsd: [0.05, 20],
  timeoutSec: [30, 3600],
  demoTimeoutSec: [5, 120],
  maxRunsPerDay: [1, 200],
  maxAttemptsPerJob: [1, 20],
  maxAutoRework: [0, 3],
  maxJobBudgetUsd: [0.1, 50],
  maxStageRunsPerAttempt: [1, 20],
};

/** 会社情報。確定事項・仮説・未決定（未確認）を分けて保存し、入力されていない実績や顧客は補完しない。 */
export interface CompanyProfile {
  name: string;
  ceo: string;
  /** 法人としての状態の表記（例: 構想上の名称・法人設立状況は未確認）。 */
  status: string;
  facts: string[];
  hypotheses: string[];
  unknowns: string[];
  updatedAt: string;
}
