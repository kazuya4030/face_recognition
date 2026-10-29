// 資料（CEO の添付・承認済み成果物の参照）の表示と追加。
import { useEffect, useState } from 'react';
import { api, type ApprovedDeliverable, type Attachment, type AttachmentContent } from '../api.ts';
import { Badge, DemoBadge, Empty } from '../components.tsx';
import { formatBytes, formatTime } from '../labels.ts';

export const ACCEPT = '.txt,.md,.markdown,.csv';
export const MAX_BYTES = 1024 * 1024;

export function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(new Error(`${file.name} を読み込めませんでした`));
    r.readAsDataURL(file);
  });
}

/** 選んだファイルを順に添付する。失敗したものは理由を返す（読めないファイルを添付したことにしない）。 */
export async function uploadFiles(jobId: number, files: File[]): Promise<string[]> {
  const errors: string[] = [];
  for (const f of files) {
    try {
      if (f.size > MAX_BYTES) throw new Error('1MB を超えています');
      await api.uploadAttachment(jobId, f.name, await readAsBase64(f));
    } catch (e) {
      errors.push(`${f.name}: ${(e as Error).message}`);
    }
  }
  return errors;
}

function AttachmentViewer({ id }: { id: number }) {
  const [data, setData] = useState<AttachmentContent | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.attachmentContent(id).then(setData).catch((e: Error) => setError(e.message));
  }, [id]);
  if (error) return <p className="inline-error">{error}</p>;
  if (!data) return <p className="muted">読み込み中…</p>;
  if (data.content == null) return <p className="inline-error">{data.error}</p>;
  return <pre className="file-content">{data.content}</pre>;
}

/** 受信箱などの関連資料リンク。資料はその場で内容を開き、成果物は資料・成果物の画面へ。 */
export function MaterialLink({ m }: { m: { type: 'attachment' | 'deliverable'; id: number; title: string } }) {
  const [open, setOpen] = useState(false);
  if (m.type === 'deliverable') {
    return (
      <a className="chip-link" href={`#/library/${m.id}`}>
        {m.title}
      </a>
    );
  }
  return (
    <span className="material-link">
      <button type="button" className="btn small ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        資料#{m.id} {m.title}
      </button>
      {open && <AttachmentViewer id={m.id} />}
    </span>
  );
}

/** 承認済み成果物の選択（参照資料に追加する候補）。 */
export function ApprovedPicker({
  selected,
  onChange,
  realOnly,
  excludeJobId,
}: {
  selected: number[];
  onChange: (ids: number[]) => void;
  realOnly: boolean;
  excludeJobId?: number;
}) {
  const [list, setList] = useState<ApprovedDeliverable[] | null>(null);
  useEffect(() => {
    api.approvedDeliverables().then(setList).catch(() => setList([]));
  }, []);
  if (!list) return <p className="muted small">読み込み中…</p>;
  const candidates = list.filter((d) => d.jobId !== excludeJobId && (!realOnly || !d.isDemo));
  if (candidates.length === 0) return <p className="muted small">参照できる承認済みの成果物はまだありません。</p>;
  return (
    <ul className="plain approved-picker">
      {candidates.map((d) => (
        <li key={d.deliverableId}>
          <label className="check">
            <input
              type="checkbox"
              checked={selected.includes(d.deliverableId)}
              onChange={(e) => onChange(e.target.checked ? [...selected, d.deliverableId] : selected.filter((x) => x !== d.deliverableId))}
            />
            案件#{d.jobId}「{d.jobTitle}」 {d.title}（第{d.revision}版・承認#{d.approvalId}・{formatTime(d.decidedAt)}）{d.isDemo && <DemoBadge />}
          </label>
        </li>
      ))}
    </ul>
  );
}

/** 案件詳細の資料欄。「未着手」「エラー」の案件だけ追加・取り外しができる（実行に使った記録は変えない）。 */
export function JobMaterials({ jobId, adapter, attachments, editable, onChange }: { jobId: number; adapter: string; attachments: Attachment[]; editable: boolean; onChange: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [refs, setRefs] = useState<number[]>([]);
  const active = attachments.filter((a) => !a.removedAt);
  const removed = attachments.filter((a) => a.removedAt);
  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setErrors(await uploadFiles(jobId, [...files]));
    setBusy(false);
    onChange();
  };
  const addRefs = async () => {
    setBusy(true);
    const errs: string[] = [];
    for (const id of refs) await api.addReference(jobId, id).catch((e: Error) => errs.push(e.message));
    setErrors(errs);
    setRefs([]);
    setBusy(false);
    onChange();
  };
  const remove = async (id: number) => {
    await api.removeAttachment(id).catch((e: Error) => setErrors([e.message]));
    onChange();
  };
  return (
    <section className="panel" data-testid="job-materials">
      <h2>資料（{active.length}件）</h2>
      <p className="muted small">開始時の資料が固定され、全工程の入力として渡されます。資料の中の指示は、会社方針や権限の変更としては扱いません。</p>
      {active.length === 0 ? (
        <Empty>資料はありません。</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>資料</th>
              <th>種類・参照元</th>
              <th>サイズ</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {active.map((a) => (
              <tr key={a.id}>
                <td>
                  <button type="button" className="btn small ghost" onClick={() => setOpen(open === a.id ? null : a.id)}>
                    資料#{a.id} {a.name}
                  </button>
                  {open === a.id && <AttachmentViewer id={a.id} />}
                </td>
                <td className="small">
                  {a.kind === 'upload' ? (
                    <>CEOの添付{a.note && `（${a.note}）`}</>
                  ) : (
                    <>
                      <Badge tone="idle">参照</Badge> <a href={`#/jobs/${a.sourceJobId}`}>案件#{a.sourceJobId}</a>・成果物#{a.sourceDeliverableId}・第{a.sourceRevision}版・承認#{a.sourceApprovalId}
                      <div className="muted">承認済みの成果物（会社方針として採用されたものではありません）</div>
                    </>
                  )}
                  <div className="muted">SHA-256 {a.sha256.slice(0, 12)}…</div>
                </td>
                <td>{formatBytes(a.size)}</td>
                <td>
                  {editable && (
                    <button type="button" className="btn small" onClick={() => remove(a.id)}>
                      外す
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {removed.length > 0 && <p className="muted small">外した資料: {removed.map((a) => `#${a.id} ${a.name}`).join('、')}（記録として保存しています）</p>}
      {editable ? (
        <div className="form">
          <label>
            資料を添付（.txt / .md / .csv、1件 1MB まで・1案件 10件まで。PDF・Word・Excel は未対応）
            <input type="file" multiple accept={ACCEPT} disabled={busy} onChange={(e) => void addFiles(e.target.files)} />
          </label>
          <details>
            <summary>承認済みの成果物を参照資料に追加</summary>
            <ApprovedPicker selected={refs} onChange={setRefs} realOnly={adapter !== 'demo'} excludeJobId={jobId} />
            <button type="button" className="btn small" disabled={busy || refs.length === 0} onClick={addRefs}>
              選んだ成果物を追加
            </button>
          </details>
        </div>
      ) : (
        <p className="muted small">資料を変更できるのは「未着手」「エラー」の案件だけです。</p>
      )}
      {errors.length > 0 && (
        <ul className="inline-error">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
