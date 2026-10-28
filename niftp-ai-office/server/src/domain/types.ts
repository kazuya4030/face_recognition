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

export type StageKind = 'plan' | 'execute' | 'review';

export type RunStatus =
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'timeout'
  | 'cancelled'
  | 'paused'
  | 'interrupted';

/** 社員の表示状態。実際の実行・承認状態から導出し、保存はしない。 */
export type EmployeeStatus = 'idle' | 'working' | 'waiting_review' | 'done' | 'error';

export type JobAction = 'start' | 'pause' | 'resume' | 'cancel';

export type DemoScenario = 'normal' | 'error' | 'timeout';

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
  useReviewer: boolean;
  adapter: AdapterId;
  demoScenario: DemoScenario;
  status: JobStatus;
  statusNote: string;
  feedback: string;
  attempt: number;
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

export interface Run {
  id: number;
  jobId: number;
  attempt: number;
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
  summary: string;
  error: string;
}

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
};

/** 設定値の許容範囲。範囲外の入力は拒否する（無限ループ・過剰実行の防止）。 */
export const SETTINGS_LIMITS: Record<Exclude<keyof Settings, 'defaultAdapter' | 'claudeModel'>, [number, number]> = {
  maxTurns: [1, 100],
  maxBudgetUsd: [0.05, 20],
  timeoutSec: [30, 3600],
  demoTimeoutSec: [5, 120],
  maxRunsPerDay: [1, 200],
  maxAttemptsPerJob: [1, 20],
};
