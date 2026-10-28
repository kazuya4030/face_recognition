// デモ実行アダプター。定型の手順と定型テキストで一連の流れを確認するためのもの。
// 実際の調査・制作は行わない。生成するファイルにはデモである旨を必ず明記する。
import fs from 'node:fs';
import path from 'node:path';
import { abortOutcome, emptyResult, type AdapterAvailability, type ExecutionAdapter, type StageContext, type StageResult } from './adapter.ts';
import { OUTPUTS_DIR } from './workspace.ts';

const DEMO_HEADER =
  '> 【デモ出力】このファイルはデモ実行アダプターが生成した定型テキストです。実際のAIによる調査・制作の結果ではありません。\n\n';

interface DemoStep {
  message: string;
  /** この手順で書き出すファイル（outputs/ からの相対パスと内容）。 */
  file?: (ctx: StageContext) => { name: string; body: string };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

const STEPS: Record<StageContext['stage']['kind'], DemoStep[]> = {
  plan: [
    { message: '依頼書（brief.md）を読み込み' },
    { message: '作業を分解し、担当と完了条件を整理' },
    {
      message: '作業計画を outputs/plan.md に書き出し',
      file: ({ job }) => ({
        name: 'plan.md',
        body:
          `# 作業計画（デモ）: ${job.title}\n\n` +
          `| No | 作業 | 担当 | 完了条件 |\n|---|---|---|---|\n` +
          `| 1 | 依頼内容の確認 | 業務責任者AI | 目的と完了条件が明文化されている |\n` +
          `| 2 | 成果物の作成 | 担当社員 | ${job.acceptanceCriteria.split('\n')[0] || '完了条件を満たす'} |\n` +
          `| 3 | 照合・確認 | 品質確認AI | 完了条件ごとに確認結果がある |\n`,
      }),
    },
  ],
  execute: [
    { message: '依頼書と作業計画を確認' },
    { message: '成果物の構成を作成' },
    {
      message: '成果物を outputs/deliverable.md に書き出し',
      file: ({ job, employee }) => ({
        name: 'deliverable.md',
        body:
          `# ${job.title}（デモ成果物）\n\n作成: ${employee.name}\n\n## 目的\n${job.purpose || '（記載なし）'}\n\n` +
          `## 内容\nこの欄には実接続時に担当AI社員が作成した内容が入ります。デモでは定型文のみを出力しています。\n\n` +
          `## 完了条件への対応\n${(job.acceptanceCriteria || '（記載なし）')
            .split('\n')
            .filter(Boolean)
            .map((l) => `- ${l} → デモのため未検証`)
            .join('\n')}\n`,
      }),
    },
    { message: '作業報告を作成' },
  ],
  review: [
    { message: '依頼の完了条件を一覧化' },
    { message: '成果物と完了条件を照合' },
    {
      message: '確認結果を outputs/review.md に書き出し',
      file: ({ job }) => ({
        name: 'review.md',
        body:
          `# 品質確認（デモ）: ${job.title}\n\n- 成果物ファイルの存在: 確認済み（outputs/deliverable.md）\n` +
          `- 内容の妥当性: デモ出力のため判定対象外\n`,
      }),
    },
  ],
};

export class DemoAdapter implements ExecutionAdapter {
  readonly id = 'demo' as const;
  readonly label = 'デモ実行';
  readonly isDemo = true;
  readonly supportsStepPause = true;

  constructor(private readonly stepMs: number) {}

  availability(): AdapterAvailability {
    return { ok: true, detail: 'デモ実行アダプター（定型データ）' };
  }

  async refreshAvailability(): Promise<AdapterAvailability> {
    return this.availability();
  }

  async runStage(ctx: StageContext): Promise<StageResult> {
    const steps = STEPS[ctx.stage.kind];
    const outDir = path.join(ctx.workspaceDir, OUTPUTS_DIR);
    try {
      for (let i = ctx.resumeStep; i < steps.length; i++) {
        if (ctx.pauseRequested() && i > ctx.resumeStep) {
          ctx.saveStep(i);
          return emptyResult('paused', { summary: `手順${i + 1}/${steps.length}の前で一時停止` });
        }
        const step = steps[i];
        ctx.emit({ kind: 'action', message: `［デモ］${step.message}` });
        if (ctx.stage.kind === 'execute' && i === 1 && ctx.job.demoScenario === 'timeout') {
          ctx.emit({ kind: 'system', message: '［デモ］タイムアウト再現シナリオ: 応答のない状態を再現しています' });
          await sleep(24 * 60 * 60 * 1000, ctx.signal);
        }
        await sleep(this.stepMs, ctx.signal);
        if (ctx.stage.kind === 'execute' && i === 1 && ctx.job.demoScenario === 'error') {
          return emptyResult('failed', { error: '［デモ］エラー再現シナリオ: 成果物の作成中に失敗しました' });
        }
        if (step.file) {
          const { name, body } = step.file(ctx);
          fs.writeFileSync(path.join(outDir, name), DEMO_HEADER + body, 'utf8');
        }
        ctx.saveStep(i + 1);
      }
    } catch {
      return emptyResult(abortOutcome(ctx.signal), { error: ctx.signal.reason === 'timeout' ? '制限時間を超えたため停止しました' : 'CEOの指示でキャンセルしました' });
    }

    const result = emptyResult('succeeded', { costNote: 'デモ実行のため費用は発生しません' });
    if (ctx.stage.kind === 'plan') {
      result.summary = '［デモ］依頼を3つの作業に分解しました。';
    } else if (ctx.stage.kind === 'execute') {
      result.summary = '［デモ］定型の成果物を作成しました。実際の調査・制作は行っていません。';
      result.evidence = ['［デモ］根拠の例: brief.md（依頼書）'];
    } else {
      result.summary = '［デモ］成果物ファイルの存在を確認しました。内容の妥当性は判定していません。';
      result.items = [
        { text: '［デモ］成果物はデモ用の定型文です。実接続で再実行するか判断してください。', severity: 'warning' },
        { text: '［デモ］完了条件の各項目は未検証です。', severity: 'info' },
      ];
    }
    return result;
  }
}
