// AI実行部分の共通インターフェース。業務管理（JobRunner）はこの型だけを知っていればよい。
import type { ActivityKind, AdapterId, CompanyProfile, Employee, Job, ReviewItem, ReviewVerdict, RunUsage, Settings, SourceRecord, Stage, StageKind } from '../domain/types.ts';
import type { StageIO } from './workspace.ts';

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
  /** この工程で作る（または確認する）成果物の版。 */
  revision: number;
  /** プログラムが決めた入力ファイル・出力ファイル。 */
  io: StageIO;
  /** 実行日（UTC、YYYY-MM-DD）。出典の確認日などに使わせる。 */
  today: string;
  company: Omit<CompanyProfile, 'updatedAt'>;
  /** 案件固有の、この工程への指示（テンプレート・作業計画の確認で決まる）。 */
  instructions: string;
  /** この工程で使ってよい費用の上限（USD）。設定の工程上限と案件の残り予算の小さい方。 */
  budgetUsd: number;
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
  | 'blocked'
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
  model: string;
  usage: RunUsage | null;
  /** レビュー工程の判定。他の工程は none。 */
  verdict: ReviewVerdict;
  /** Web の利用状況（実接続のみ）。null は計測していないことを表す。 */
  web: WebStats | null;
  /** 調査の出典（プログラムが実際のツール結果と照合済み）。 */
  sources: SourceRecord[];
  /** 作業計画が提案した、各工程への案件固有の指示。 */
  stageInstructions?: Partial<Record<StageKind, string>>;
}

export interface WebStats {
  searches: number;
  searchErrors: number;
  fetches: number;
  fetchErrors: number;
  /** AI自身の申告（available / search_only / unavailable）。申告がなければ空。 */
  reported: string;
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
  return {
    status, summary: '', items: [], evidence: [], error: '', costUsd: null, costNote: '', numTurns: null,
    model: '', usage: null, verdict: 'none', web: null, sources: [], ...patch,
  };
}

/** AbortSignal の中止理由を工程結果に変換する。 */
export function abortOutcome(signal: AbortSignal): 'timeout' | 'cancelled' {
  return signal.reason === 'timeout' ? 'timeout' : 'cancelled';
}
