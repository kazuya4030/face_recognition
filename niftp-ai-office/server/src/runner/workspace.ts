// 案件ごとの作業ディレクトリと成果物ファイルの扱い。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { STAGE_LABEL } from '../domain/jobState.ts';
import type { CompanyProfile, Employee, Job, RefKey, Stage, StageKind } from '../domain/types.ts';

export const OUTPUTS_DIR = 'outputs';
const MAX_FILES = 50;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const stageLabel = (kind: Stage['kind']) => STAGE_LABEL[kind] ?? kind;

export function workspaceDirFor(dataDir: string, jobId: number): string {
  return path.join(dataDir, 'workspaces', `job-${jobId}`);
}

/**
 * 成果物は記録した時点の内容を作業ディレクトリの外へ複製して保存する。
 * 後の実行で同じファイルが上書きされても、CEOが確認・承認した版の内容が残る。
 */
export function snapshotDirFor(dataDir: string, jobId: number): string {
  return path.join(dataDir, 'deliverables', `job-${jobId}`);
}

export function snapshotPathFor(dataDir: string, d: { id: number; jobId: number }): string {
  return path.join(snapshotDirFor(dataDir, d.jobId), String(d.id));
}

export function saveSnapshot(dataDir: string, d: { id: number; jobId: number }, content: Buffer): void {
  fs.mkdirSync(snapshotDirFor(dataDir, d.jobId), { recursive: true });
  fs.writeFileSync(snapshotPathFor(dataDir, d), content, { flag: 'wx' });
}

export const INPUTS_DIR = 'inputs';
export const COMPANY_FILE = 'reference/company.md';

export function companyMarkdown(c: Omit<CompanyProfile, 'updatedAt'>): string {
  const list = (xs: string[]) => (xs.length > 0 ? xs.map((x) => `- ${x}`).join('\n') : '- （登録なし）');
  return [
    '# 会社情報（CEOが登録した内容）',
    '',
    `- 会社名: ${c.name}`,
    `- 状態: ${c.status}`,
    `- CEO: ${c.ceo}`,
    '',
    '## 確定事項',
    list(c.facts),
    '',
    '## 仮説（検証が必要。事実として扱わない）',
    list(c.hypotheses),
    '',
    '## 未決定・未確認（推測で埋めない）',
    list(c.unknowns),
    '',
    'ここにない会社の実績・顧客・売上・予算は存在しないものとして扱い、作らないこと。',
    '',
  ].join('\n');
}

/**
 * 作業ディレクトリを用意し、依頼内容（brief.md）・会社情報・CEOのコメントをファイルとして書き出す。
 * AIへの入力はすべてファイル経由で渡し、どのファイルを渡したかは実行履歴に記録する。
 */
export function prepareWorkspace(dir: string, job: Job, stages: Stage[], employees: Employee[], company: Omit<CompanyProfile, 'updatedAt'>): void {
  fs.mkdirSync(path.join(dir, OUTPUTS_DIR), { recursive: true });
  fs.mkdirSync(path.join(dir, INPUTS_DIR), { recursive: true });
  fs.mkdirSync(path.join(dir, 'reference'), { recursive: true });
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? id;
  const lines = [
    `# 依頼書 #${job.id}: ${job.title}`,
    '',
    '## 目的',
    job.purpose || '（記載なし）',
    '',
    '## 依頼内容',
    job.details || '（記載なし）',
    '',
    '## 完了条件',
    job.acceptanceCriteria || '（記載なし）',
    '',
    '## 担当',
    nameOf(job.assigneeId),
    '',
    '## 工程（順番と担当はプログラムが管理）',
    ...stages.map((s) => `${s.index + 1}. ${STAGE_LABEL[s.kind]}（${nameOf(s.employeeId)}）`),
  ];
  if (job.feedback) {
    lines.push('', '## CEOからのコメント（差し戻し・回答）', '詳細は inputs/ceo_feedback.md を参照。', '', job.feedback);
  }
  fs.writeFileSync(path.join(dir, 'brief.md'), lines.join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(dir, COMPANY_FILE), companyMarkdown(company), 'utf8');
  const feedbackFile = path.join(dir, INPUTS_DIR, 'ceo_feedback.md');
  if (job.feedback) {
    fs.writeFileSync(feedbackFile, `# CEOからのコメント（第${job.revision}版まで）\n\n${job.feedback}\n`, 'utf8');
  } else if (fs.existsSync(feedbackFile)) {
    fs.rmSync(feedbackFile);
  }
}

/** 自動修正のため、レビュー結果からプログラムが作る指摘ファイル（AIは呼ばない）。 */
export function writeReviewFeedback(dir: string, revision: number, body: string): string {
  const rel = `${INPUTS_DIR}/review_feedback_r${revision}.md`;
  fs.mkdirSync(path.join(dir, INPUTS_DIR), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), body, 'utf8');
  return rel;
}

export interface StageFile {
  path: string;
  label: string;
}

export interface StageIO {
  inputs: StageFile[];
  outputs: StageFile[];
  /** この工程が書き込んでよい場所（ここ以外の outputs/ の変更は警告として記録する）。 */
  allowed: string[];
  /** 工程の完了に必須の出力。この工程の中で作成・更新されていなければ失敗とする。 */
  required: { path: string; dir: boolean }[];
}

const STAGE_OUTPUTS: Record<StageKind, Omit<StageIO, 'inputs'>> = {
  plan: {
    outputs: [{ path: 'outputs/plan.md', label: '作業計画' }],
    allowed: ['outputs/plan.md'],
    required: [{ path: 'outputs/plan.md', dir: false }],
  },
  research: {
    outputs: [{ path: 'outputs/research.md', label: '調査結果（事実・仮説・未確認・出典一覧）' }],
    allowed: ['outputs/research.md', 'outputs/research/'],
    required: [{ path: 'outputs/research.md', dir: false }],
  },
  execute: {
    outputs: [
      { path: 'outputs/deliverables/', label: '提出物（提出物ごとに1ファイル）' },
      { path: 'outputs/report.md', label: '作業報告（使った出典・仮説・対応した指摘・未確認事項）' },
    ],
    allowed: ['outputs/deliverables/', 'outputs/report.md'],
    required: [{ path: 'outputs/deliverables/', dir: true }],
  },
  review: {
    outputs: [{ path: 'outputs/review.md', label: 'レビュー結果（判定・条件ごとの確認・問題点・計算の再確認）' }],
    allowed: ['outputs/review.md'],
    required: [{ path: 'outputs/review.md', dir: false }],
  },
};

function listFiles(dir: string, relDir: string): string[] {
  const abs = path.join(dir, relDir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = `${relDir}/${ent.name}`;
    if (ent.isDirectory()) out.push(...listFiles(dir, rel));
    else if (ent.isFile()) out.push(rel);
  }
  return out.sort();
}

const exists = (dir: string, rel: string) => fs.existsSync(path.join(dir, rel));

/**
 * 工程ごとの入力・出力ファイル。社員の「参照できる情報」と、作業ディレクトリに実在するファイルから決める。
 * 前の工程の出力をそのまま次の工程の入力にすることで、同じ案件の資料と成果物を引き継ぐ。
 * （作業ディレクトリ内のファイルは読み取り自体は可能なため、これはアクセス制御ではなく指示上の参照範囲。）
 */
export function stageIO(dir: string, kind: StageKind, refs: RefKey[], opts: { reviewFeedback?: string | null }): StageIO {
  const inputs: StageFile[] = [];
  const has = (r: RefKey) => refs.includes(r);
  const add = (p: string, label: string) => {
    if (exists(dir, p) && !inputs.some((i) => i.path === p)) inputs.push({ path: p, label });
  };
  if (has('brief')) add('brief.md', '依頼書');
  if (has('company')) add(COMPANY_FILE, '会社情報（確定事項・仮説・未確認）');
  if (has('feedback')) add(`${INPUTS_DIR}/ceo_feedback.md`, 'CEOからのコメント（最優先で対応）');
  if (has('plan') && kind !== 'plan') add('outputs/plan.md', '作業計画');
  if (has('research') && kind !== 'research') {
    add('outputs/research.md', '調査結果（原資料）');
    for (const f of listFiles(dir, 'outputs/research')) add(f, '調査資料');
  }
  if (kind === 'execute' || (has('deliverables') && kind === 'review')) {
    const label = kind === 'execute' ? '前の版の提出物（修正対象）' : '確認対象の提出物';
    for (const f of listFiles(dir, 'outputs/deliverables')) add(f, label);
    add('outputs/report.md', kind === 'execute' ? '前の版の作業報告' : '作業報告');
  }
  if (kind === 'execute' && opts.reviewFeedback) add(opts.reviewFeedback, 'レビューの指摘（不合格のため修正が必要）');
  if (has('review') && kind === 'execute') add('outputs/review.md', '前の版へのレビュー結果');
  return { inputs, ...STAGE_OUTPUTS[kind] };
}

/** outputs/ 配下のファイルの更新時刻。工程の前後で比べ、どのファイルを書いたかを判定する。 */
export function outputMtimes(dir: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of listFiles(dir, OUTPUTS_DIR)) m.set(f, fs.statSync(path.join(dir, f)).mtimeMs);
  return m;
}

export function changedOutputs(before: Map<string, number>, after: Map<string, number>): string[] {
  return [...after.entries()].filter(([f, t]) => before.get(f) !== t).map(([f]) => f);
}

export interface ScannedFile {
  relPath: string;
  size: number;
  sha256: string;
  mime: string;
}

const MIME: Record<string, string> = {
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.html': 'text/html',
  '.ts': 'text/plain',
  '.tsx': 'text/plain',
  '.js': 'text/plain',
  '.py': 'text/plain',
  '.css': 'text/plain',
  '.yml': 'text/plain',
  '.yaml': 'text/plain',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
};

export const mimeOf = (p: string) => MIME[path.extname(p).toLowerCase()] ?? 'application/octet-stream';
export const isTextMime = (m: string) => m.startsWith('text/') || m === 'application/json' || m === 'image/svg+xml';

/** outputs/ 配下の実在するファイルだけを列挙する。シンボリックリンクや巨大ファイルは対象外。 */
export function scanOutputs(dir: string): { files: ScannedFile[]; skipped: string[] } {
  const root = path.join(dir, OUTPUTS_DIR);
  const files: ScannedFile[] = [];
  const skipped: string[] = [];
  const walk = (abs: string) => {
    if (!fs.existsSync(abs)) return;
    for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
      const p = path.join(abs, ent.name);
      const rel = path.relative(dir, p);
      if (ent.isSymbolicLink()) {
        skipped.push(`${rel}（シンボリックリンクのため除外）`);
      } else if (ent.isDirectory()) {
        walk(p);
      } else if (ent.isFile()) {
        const st = fs.statSync(p);
        if (st.size > MAX_FILE_BYTES) {
          skipped.push(`${rel}（${MAX_FILE_BYTES / 1024 / 1024}MB超のため除外）`);
        } else if (files.length >= MAX_FILES) {
          skipped.push(`${rel}（ファイル数上限のため除外）`);
        } else {
          const sha256 = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
          files.push({ relPath: rel.split(path.sep).join('/'), size: st.size, sha256, mime: mimeOf(p) });
        }
      }
    }
  };
  walk(root);
  return { files, skipped };
}
