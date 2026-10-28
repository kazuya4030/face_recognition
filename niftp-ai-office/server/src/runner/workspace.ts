// 案件ごとの作業ディレクトリと成果物ファイルの扱い。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Job, Stage } from '../domain/types.ts';
import type { Employee } from '../domain/types.ts';

export const OUTPUTS_DIR = 'outputs';
const MAX_FILES = 50;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const STAGE_LABEL: Record<Stage['kind'], string> = { plan: '作業分解', execute: '実行', review: '品質確認' };
export const stageLabel = (kind: Stage['kind']) => STAGE_LABEL[kind];

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

/** 作業ディレクトリを用意し、依頼内容を brief.md として書き出す（AIへの入力はファイル経由で渡す）。 */
export function prepareWorkspace(dir: string, job: Job, stages: Stage[], employees: Employee[]): void {
  fs.mkdirSync(path.join(dir, OUTPUTS_DIR), { recursive: true });
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
    '## 工程',
    ...stages.map((s) => `${s.index + 1}. ${STAGE_LABEL[s.kind]}（${nameOf(s.employeeId)}）`),
  ];
  if (job.feedback) {
    lines.push('', '## CEOからの差し戻しコメント（前回の成果物への指摘）', job.feedback);
  }
  fs.writeFileSync(path.join(dir, 'brief.md'), lines.join('\n') + '\n', 'utf8');
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
