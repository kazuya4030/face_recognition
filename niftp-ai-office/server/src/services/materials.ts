// 案件の資料（CEO の添付ファイルと、過去の承認済み成果物の参照）。
// - 対応形式は TXT / Markdown / CSV（UTF-8。Shift_JIS は UTF-8 に変換して保存）。PDF・Office 形式は未対応。
// - 内容は登録時に固定し、data/attachments/job-<案件>/<資料ID> に保存する（変更・上書きしない）。
// - 実行中・実行待ち・確認待ちの案件の資料は変更できない。実行に使う資料は開始時に固定する（jobs.attachment_ids）。
// - 参照資料は「その版の成果物が承認された」ことを示すだけで、会社方針として採用されたことは意味しない。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Attachment, Job } from '../domain/types.ts';
import type { ChangeBus } from '../events.ts';
import { snapshotPathFor } from '../runner/workspace.ts';
import { attachmentPathFor } from '../runner/workspace.ts';
import type { Repo } from '../store/repo.ts';
import { UserError } from './errors.ts';

export const ATTACHMENT_LIMITS = { maxBytes: 1024 * 1024, maxPerJob: 10, maxNameLength: 120 };
const TEXT_TYPES: Record<string, string> = { '.txt': 'text/plain', '.md': 'text/markdown', '.markdown': 'text/markdown', '.csv': 'text/csv' };
/** 資料を変更できる案件の状態。それ以外（実行中・確認待ち・完了など）は記録を固定する。 */
const EDITABLE: Job['status'][] = ['draft', 'error'];

/** UTF-8 として読めるかを確認し、読めなければ Shift_JIS を試す。どちらでもなければ null（読めない資料は受け付けない）。 */
export function decodeText(buf: Buffer): { text: string; note: string } | null {
  if (buf.includes(0)) return null;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
    return { text, note: '' };
  } catch {
    /* 次を試す */
  }
  try {
    const text = new TextDecoder('shift_jis', { fatal: true }).decode(buf);
    return { text, note: 'Shift_JIS から UTF-8 に変換して保存' };
  } catch {
    return null;
  }
}

export function sanitizeName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  // 制御文字を除き、前後の空白・ドットを取る（隠しファイルや「..」にならないように）
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/^\.+/, '');
  return cleaned.slice(0, ATTACHMENT_LIMITS.maxNameLength);
}

export class MaterialsService {
  constructor(
    private readonly repo: Repo,
    private readonly dataDir: string,
    private readonly bus: ChangeBus,
  ) {}

  private editableJob(jobId: number): Job {
    const job = this.repo.getJob(jobId);
    if (!job) throw new UserError('案件が見つかりません', 404);
    if (!EDITABLE.includes(job.status)) {
      throw new UserError('資料を変更できるのは「未着手」「エラー」の案件だけです（実行に使った資料の記録を変えないため）', 409);
    }
    const active = this.repo.listAttachments(jobId).filter((a) => !a.removedAt);
    if (active.length >= ATTACHMENT_LIMITS.maxPerJob) throw new UserError(`資料は1案件あたり${ATTACHMENT_LIMITS.maxPerJob}件までです`);
    return job;
  }

  private store(a: Omit<Attachment, 'id' | 'createdAt' | 'removedAt'>, content: Buffer): Attachment {
    return this.repo.transaction(() => {
      const created = this.repo.addAttachment(a);
      const p = attachmentPathFor(this.dataDir, created);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content, { flag: 'wx' });
      return created;
    });
  }

  /** CEO の添付ファイル（本文は base64）。 */
  upload(jobId: number, body: Record<string, unknown>): Attachment {
    this.editableJob(jobId);
    const name = sanitizeName(typeof body.name === 'string' ? body.name : '');
    if (!name) throw new UserError('ファイル名が不正です');
    const ext = path.extname(name).toLowerCase();
    const mime = TEXT_TYPES[ext];
    if (!mime) throw new UserError(`対応していない形式です（${ext || '拡張子なし'}）。添付できるのは .txt / .md / .csv です（PDF・Word・Excel は未対応）`);
    if (typeof body.contentBase64 !== 'string') throw new UserError('ファイルの内容がありません');
    const raw = Buffer.from(body.contentBase64, 'base64');
    if (raw.length === 0) throw new UserError('空のファイルは添付できません');
    if (raw.length > ATTACHMENT_LIMITS.maxBytes) throw new UserError(`ファイルが大きすぎます（上限 ${ATTACHMENT_LIMITS.maxBytes / 1024 / 1024}MB）`);
    const decoded = decodeText(raw);
    if (!decoded) throw new UserError('文字として読めないファイルです（UTF-8 または Shift_JIS のテキストを添付してください）');
    const content = Buffer.from(decoded.text, 'utf8');
    const a = this.store(
      {
        jobId, kind: 'upload', name, mime, size: content.length,
        sha256: crypto.createHash('sha256').update(content).digest('hex'),
        sourceJobId: null, sourceDeliverableId: null, sourceRevision: null, sourceApprovalId: null, note: decoded.note,
      },
      content,
    );
    this.log(jobId, `資料を添付: ${a.name}（${a.size} bytes、資料#${a.id}）${a.note ? `・${a.note}` : ''}`);
    this.bus.changed(jobId);
    return a;
  }

  /** CEO が承認した版の成果物（参照できるもの）。デモの成果物も区別して返す。 */
  approvedDeliverables() {
    const jobs = new Map(this.repo.listJobs().map((j) => [j.id, j]));
    const deliverables = new Map(this.repo.listDeliverables().map((d) => [d.id, d]));
    const out: {
      deliverableId: number; jobId: number; jobTitle: string; title: string; revision: number; stageKind: string;
      approvalId: number; decidedAt: string | null; isDemo: boolean; size: number; sha256: string;
    }[] = [];
    for (const a of this.repo.listApprovals().filter((x) => x.status === 'approved')) {
      for (const id of a.deliverableIds) {
        const d = deliverables.get(id);
        if (!d || !snapshotExists(this.dataDir, d)) continue;
        out.push({
          deliverableId: d.id, jobId: a.jobId, jobTitle: jobs.get(a.jobId)?.title ?? '', title: d.title, revision: d.revision,
          stageKind: d.stageKind, approvalId: a.id, decidedAt: a.decidedAt, isDemo: d.isDemo, size: d.size, sha256: d.sha256,
        });
      }
    }
    return out;
  }

  /** 承認済みの成果物を、新しい案件の参照資料として写す（参照元の案件・成果物・版・承認を記録）。 */
  addReference(jobId: number, body: Record<string, unknown>): Attachment {
    const job = this.editableJob(jobId);
    const deliverableId = Number(body.deliverableId);
    const item = this.approvedDeliverables().find((x) => x.deliverableId === deliverableId);
    if (!item) throw new UserError('承認済みの成果物ではありません（承認された版の成果物だけを参照資料にできます）');
    if (item.jobId === jobId) throw new UserError('同じ案件の成果物は参照資料にできません');
    if (item.isDemo && job.adapter !== 'demo') throw new UserError('デモの成果物は実案件の参照資料にできません');
    const d = this.repo.getDeliverable(deliverableId)!;
    if (this.repo.listAttachments(jobId).some((a) => !a.removedAt && a.sourceDeliverableId === deliverableId)) {
      throw new UserError('この成果物は既に参照資料に追加されています');
    }
    const content = fs.readFileSync(snapshotPathFor(this.dataDir, d));
    if (!decodeText(content)) throw new UserError('文字として読めない成果物は参照資料にできません');
    const a = this.store(
      {
        jobId, kind: 'reference', name: d.title.split('/').pop() ?? d.title, mime: d.mime, size: content.length, sha256: d.sha256,
        sourceJobId: item.jobId, sourceDeliverableId: d.id, sourceRevision: d.revision, sourceApprovalId: item.approvalId,
        note: `案件#${item.jobId}「${item.jobTitle}」第${d.revision}版で承認された成果物（会社方針として採用されたものではない）`,
      },
      content,
    );
    this.log(jobId, `参照資料を追加: 案件#${item.jobId} の ${d.title}（第${d.revision}版・承認#${item.approvalId}、資料#${a.id}）`);
    this.bus.changed(jobId);
    return a;
  }

  remove(id: number): void {
    const a = this.repo.getAttachment(id);
    if (!a || a.removedAt) throw new UserError('資料が見つかりません', 404);
    const job = this.repo.getJob(a.jobId)!;
    if (!EDITABLE.includes(job.status)) throw new UserError('資料を外せるのは「未着手」「エラー」の案件だけです', 409);
    // 記録を残すため、ファイルは消さずに「外した」印を付ける
    this.repo.removeAttachment(id);
    this.log(a.jobId, `資料を外しました: ${a.name}（資料#${a.id}）`);
    this.bus.changed(a.jobId);
  }

  content(id: number) {
    const a = this.repo.getAttachment(id);
    if (!a) throw new UserError('資料が見つかりません', 404);
    const p = attachmentPathFor(this.dataDir, a);
    if (!fs.existsSync(p)) return { attachment: a, content: null as string | null, error: '保存されたファイルが見つかりません' };
    return { attachment: a, content: fs.readFileSync(p, 'utf8') as string | null, error: '' };
  }

  private log(jobId: number, message: string) {
    this.repo.addActivity({ jobId, runId: null, employeeId: null, actor: 'ceo', kind: 'ceo', message, detail: '' });
  }
}

function snapshotExists(dataDir: string, d: { id: number; jobId: number }) {
  return fs.existsSync(snapshotPathFor(dataDir, d));
}
