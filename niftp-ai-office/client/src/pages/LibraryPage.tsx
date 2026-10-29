import { useEffect, useState } from 'react';
import { api, type ApprovedDeliverable, type Snapshot } from '../api.ts';
import { DeliverableViewer, DemoBadge, Empty } from '../components.tsx';
import { formatBytes, formatTime } from '../labels.ts';
import { useDeliverables } from './ApprovalsPage.tsx';

type Props = { snapshot: Snapshot; navigate: (p: string) => void; initialId?: number };

export function LibraryPage({ snapshot, navigate, initialId }: Props) {
  const deliverables = useDeliverables();
  const [selected, setSelected] = useState<number | undefined>(initialId);
  useEffect(() => setSelected(initialId), [initialId]);
  const nameOf = (id: string) => snapshot.employees.find((e) => e.id === id)?.name ?? id;
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [approved, setApproved] = useState<ApprovedDeliverable[]>([]);
  useEffect(() => {
    api.approvedDeliverables().then(setApproved).catch(() => setApproved([]));
  }, [deliverables.length]);
  const approvedIds = new Set(approved.map((a) => a.deliverableId));
  const shown = deliverables.filter((d) => !approvedOnly || approvedIds.has(d.id));
  const jobs = snapshot.jobs.filter((j) => shown.some((d) => d.jobId === j.id));

  return (
    <div className="page library">
      <h1>資料・成果物</h1>
      <p className="muted">AI社員が作業ディレクトリに実際に作成したファイルだけを、記録した時点の内容で保存・表示しています。</p>
      <label className="check">
        <input type="checkbox" checked={approvedOnly} onChange={(e) => setApprovedOnly(e.target.checked)} />
        CEOが承認した版の成果物だけを表示
      </label>
      <div className="library-grid">
        <div className="library-list">
          {jobs.length === 0 && <Empty>成果物はまだありません。案件を実行すると、ここに表示されます。</Empty>}
          {jobs.map((j) => (
            <section key={j.id} className="panel">
              <h2>
                <a href={`#/jobs/${j.id}`}>
                  #{j.id} {j.title}
                </a>
              </h2>
              <ul className="files">
                {shown
                  .filter((d) => d.jobId === j.id)
                  .map((d) => (
                    <li key={d.id}>
                      <button type="button" className={`file-btn ${selected === d.id ? 'active' : ''}`} onClick={() => navigate(`library/${d.id}`)} disabled={!d.exists}>
                        <span className="file-name">{d.title}</span>
                        {d.isDemo && <DemoBadge />}
                        <span className="muted small">
                          {nameOf(d.employeeId)}・{d.attempt}回目・{formatBytes(d.size)}・{formatTime(d.createdAt)}
                          {!d.exists && '・ファイルなし'}
                          {approvedIds.has(d.id) && '・✓ 承認済みの版'}
                        </span>
                      </button>
                      {approvedIds.has(d.id) && (
                        <button type="button" className="btn small ghost" onClick={() => navigate(`request?ref=${d.id}`)}>
                          この成果物を参照して依頼
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="panel viewer-panel">{selected ? <DeliverableViewer id={selected} /> : <Empty>左の一覧からファイルを選ぶと内容を表示します。</Empty>}</div>
      </div>
    </div>
  );
}
