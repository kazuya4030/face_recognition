// AI実行部分の共通インターフェース。業務管理（JobRunner）はこの型だけを知っていればよい。
import type { ActivityKind, AdapterId, Employee, Job, ReviewItem, Settings, Stage } from '../domain/types.ts';

export interface StageEvent {
  kind: Extract<ActivityKind, 'action' | 'result' | 'evidence' | 'question' | 'denied' | 'error' | 'system'>;
  message: string;
  detail?: string;
}

export interface StageContext {
  job: Job;
  stage: Stage;
  stages: Stage[];
  employee: Employee;
  attempt: number;
  /** 案件専用の作業ディレクトリ（AIはここだけを扱う）。 */
  workspaceDir: string;
  /** 一時停止後の再開時、どの手順から始めるか（手順単位の一時停止に対応するアダプターのみ使用）。 */
  resumeStep: number;
  settings: Settings;
  signal: AbortSignal;
  emit: (event: StageEvent) => void;
  /** 一時停止が要求されているか。区切りごとに確認する。 */
  pauseRequested: () => boolean;
  /** 手順の進捗を保存する（再起動しても再開位置を失わないため）。 */
  saveStep: (step: number) => void;
}

export type StageOutcome =
  | 'succeeded'
  | 'failed'
  | 'timeout'
  | 'cancelled'
  | 'paused';

export interface StageResult {
  status: StageOutcome;
  summary: string;
  /** CEOへの確認事項・品質確認の指摘。 */
  items: ReviewItem[];
  /** 根拠（参照資料・URL・ファイル）。 */
  evidence: string[];
  error: string;
  /** 実行側が報告した費用。報告がなければ null（推測値は入れない）。 */
  costUsd: number | null;
  costNote: string;
  numTurns: number | null;
}

export interface AdapterAvailability {
  ok: boolean;
  detail: string;
  version?: string;
}

export interface ExecutionAdapter {
  readonly id: AdapterId;
  readonly label: string;
  readonly isDemo: boolean;
  /** 工程の途中（手順の区切り）で一時停止できるか。 */
  readonly supportsStepPause: boolean;
  availability(): AdapterAvailability;
  refreshAvailability(): Promise<AdapterAvailability>;
  runStage(ctx: StageContext): Promise<StageResult>;
}

export function emptyResult(status: StageOutcome, patch: Partial<StageResult> = {}): StageResult {
  return { status, summary: '', items: [], evidence: [], error: '', costUsd: null, costNote: '', numTurns: null, ...patch };
}

/** AbortSignal の中止理由を工程結果に変換する。 */
export function abortOutcome(signal: AbortSignal): 'timeout' | 'cancelled' {
  return signal.reason === 'timeout' ? 'timeout' : 'cancelled';
}
