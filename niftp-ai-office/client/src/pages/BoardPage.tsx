import type { Snapshot } from '../api.ts';
import { Badge, DemoBadge, Empty } from '../components.tsx';
import { BOARD_COLUMNS, JOB_STATUS, formatTime } from '../labels.ts';

type Props = { snapshot: Snapshot; navigate: (p: string) => void };

export function BoardPage({ snapshot, navigate }: Props) {
  const nameOf = (id: string) => snapshot.employees.find((e) => e.id === id)?.name ?? id;
  return (
    <div className="page">
      <div className="page-head">
        <h1>案件ボード</h1>
        <button type="button" className="btn primary" onClick={() => navigate('request')}>
          仕事を依頼する
        </button>
      </div>
      <div className="board">
        {BOARD_COLUMNS.map((col) => {
          const jobs = snapshot.jobs.filter((j) => j.column === col.key);
          return (
            <section key={col.key} className={`column col-${col.key}`} aria-label={col.label}>
              <header>
                <h2>{col.label}</h2>
                <span className="count">{jobs.length}</span>
                <div className="muted small">{col.hint}</div>
              </header>
              {jobs.length === 0 && <Empty>なし</Empty>}
              {jobs.map((j) => {
                const st = JOB_STATUS[j.status];
                return (
                  <a key={j.id} className="card" href={`#/jobs/${j.id}`}>
                    <div className="card-top">
                      <span className="muted">#{j.id}</span>
                      <Badge tone={st.tone}>{st.label}</Badge>
                      {j.adapter === 'demo' ? <DemoBadge /> : <Badge tone="real">Claude Code</Badge>}
                      {j.pauseRequested && <Badge tone="paused">停止要求中</Badge>}
                    </div>
                    <div className="card-title">{j.title}</div>
                    <div className="muted small">担当: {nameOf(j.assigneeId)}</div>
                    {j.status === 'running' && (
                      <div className="stage-progress" aria-label="工程の進捗">
                        {j.stages.map((s) => (
                          <span key={s.index} className={s.index < j.currentStageIndex ? 'done' : s.index === j.currentStageIndex ? 'current' : ''} title={`${s.label}（${s.employeeName}）`}>
                            {s.label}
                          </span>
                        ))}
                      </div>
                    )}
                    {j.statusNote && <div className="small note">{j.statusNote}</div>}
                    {j.status === 'error' && j.errorMessage && <div className="small error-text">{j.errorMessage}</div>}
                    <div className="muted small">
                      成果物 {j.deliverableCount}件・更新 {formatTime(j.updatedAt)}
                    </div>
                  </a>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
