import { useEffect, useState } from 'react';
import type { Snapshot } from '../api.ts';
import { DeliverableViewer, DemoBadge, Empty } from '../components.tsx';
import { formatBytes, formatTime } from '../labels.ts';
import { useDeliverables } from './ApprovalsPage.tsx';

type Props = { snapshot: Snapshot; navigate: (p: string) => void; initialId?: number };

export function LibraryPage({ snapshot, navigate, initialId }: Props) {
  const deliverables = useDeliverables();
  const [selected, setSelected] = useState<number | undefined>(initialId);
  useEffect(() => setSelected(initialId), [initialId]);
  const nameOf = (id: string) => snapshot.employees.find((e) => e.id === id)?.name ?? id;
  const jobs = snapshot.jobs.filter((j) => deliverables.some((d) => d.jobId === j.id));

  return (
    <div className="page library">
      <h1>資料・成果物</h1>
      <p className="muted">AI社員が作業ディレクトリに実際に作成したファイルだけを、記録した時点の内容で保存・表示しています。</p>
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
                {deliverables
                  .filter((d) => d.jobId === j.id)
                  .map((d) => (
                    <li key={d.id}>
                      <button type="button" className={`file-btn ${selected === d.id ? 'active' : ''}`} onClick={() => navigate(`library/${d.id}`)} disabled={!d.exists}>
                        <span className="file-name">{d.title}</span>
                        {d.isDemo && <DemoBadge />}
                        <span className="muted small">
                          {nameOf(d.employeeId)}・{d.attempt}回目・{formatBytes(d.size)}・{formatTime(d.createdAt)}
                          {!d.exists && '・ファイルなし'}
                        </span>
                      </button>
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
