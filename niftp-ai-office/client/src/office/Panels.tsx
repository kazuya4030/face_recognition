// オフィスで社員や家具を選んだときに開く詳細パネル。内容はすべて実際の記録から作る。
import type { ReactNode } from 'react';
import type { DeliverableView, EmployeeView, OfficeEvent, Snapshot } from '../api.ts';
import { Badge, DemoBadge } from '../components.tsx';
import { EMPLOYEE_STATUS, formatTime } from '../labels.ts';
import { appearanceOf } from './appearance.ts';
import { Portrait } from './Character.tsx';

export type PanelKind = 'ceo' | 'shelf' | 'achievements' | 'events' | 'entrance' | { employee: string };

export function PanelShell({ title, onClose, children, testId }: { title: ReactNode; onClose: () => void; children: ReactNode; testId?: string }) {
  return (
    <aside className="hq-panel" aria-label={typeof title === 'string' ? title : '詳細'} data-testid={testId}>
      <div className="hq-panel-head">
        <h2>{title}</h2>
        <button type="button" className="btn ghost small" onClick={onClose} aria-label="閉じる">
          閉じる
        </button>
      </div>
      <div className="hq-panel-body">{children}</div>
    </aside>
  );
}

export function EmployeePanel({
  e,
  snapshot,
  navigate,
  onClose,
}: {
  e: EmployeeView;
  snapshot: Snapshot;
  navigate: (p: string) => void;
  onClose: () => void;
}) {
  const st = EMPLOYEE_STATUS[e.status];
  const job = e.currentJob ? snapshot.jobs.find((j) => j.id === e.currentJob!.id) : undefined;
  return (
    <PanelShell
      testId="employee-panel"
      onClose={onClose}
      title={
        <span className="emp-title">
          <Portrait look={appearanceOf(e.id)} outfitColor={e.color} size={64} />
          <span>
            <span className="emp-name">{e.name}</span>
            <span className="emp-role">{e.roleTitle}</span>
          </span>
        </span>
      }
    >
      <p className="muted small">{e.description}</p>
      <div className="emp-status">
        <Badge tone={st.tone}>{st.label}</Badge> <span>{e.statusDetail}</span>
      </div>

      <h3>現在の仕事</h3>
      {e.currentJob ? (
        <div className="emp-job">
          <a href={`#/jobs/${e.currentJob.id}`}>
            #{e.currentJob.id} {e.currentJob.title}
          </a>
          {job && (
            <div className="stage-progress">
              {job.stages.map((s) => (
                <span key={s.index} className={job.status === 'running' ? (s.index < job.currentStageIndex ? 'done' : s.index === job.currentStageIndex ? 'current' : '') : ''}>
                  {s.label}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="muted">いまは担当している仕事はありません。</p>
      )}
      {e.queuedJobs.length > 0 && (
        <p className="small">
          順番待ち:{' '}
          {e.queuedJobs.map((j) => (
            <a key={j.id} href={`#/jobs/${j.id}`} className="chip-link">
              #{j.id} {j.title}
            </a>
          ))}
        </p>
      )}

      <h3>直近の成果</h3>
      {e.recentDeliverables.length === 0 ? (
        <p className="muted">まだ保存された成果物はありません。</p>
      ) : (
        <ul className="plain">
          {e.recentDeliverables.map((d) => (
            <li key={d.id}>
              <a href={`#/library/${d.id}`}>{d.title}</a> {d.isDemo && <DemoBadge />} <span className="muted small">#{d.jobId}</span>
            </li>
          ))}
        </ul>
      )}

      <h3>相談事項</h3>
      {e.pendingApprovals.length === 0 ? (
        <p className="muted">CEOへの相談はありません。</p>
      ) : (
        <ul className="plain">
          {e.pendingApprovals.map((a) => (
            <li key={a.id}>
              <a href="#/approvals">{a.title}</a> <span className="muted small">確認事項 {a.itemCount}件</span>
            </li>
          ))}
        </ul>
      )}

      <div className="panel-foot">
        <button type="button" className="btn primary" onClick={() => navigate(`request?assignee=${e.id}`)}>
          {e.name}に仕事を依頼
        </button>
        <a className="btn" href="#/settings">
          名前・作業指示を編集
        </a>
      </div>
    </PanelShell>
  );
}

export function CeoPanel({ snapshot, onClose }: { snapshot: Snapshot; onClose: () => void }) {
  const pending = snapshot.approvals.filter((a) => a.status === 'pending');
  const nameOf = (id: string) => snapshot.employees.find((e) => e.id === id)?.name ?? id;
  return (
    <PanelShell title="CEOのデスク" onClose={onClose} testId="ceo-panel">
      <p className="muted small">AI社員から届いた、CEOの判断が必要な事項です。</p>
      {pending.length === 0 ? (
        <p>判断待ちはありません。</p>
      ) : (
        <ul className="decision-list">
          {pending.map((a) => (
            <li key={a.id}>
              <div className="strong">{a.title}</div>
              <div className="muted small">
                依頼者 {nameOf(a.requestedBy)}・確認事項 {a.items.length}件・{formatTime(a.createdAt)}
              </div>
              <div className="row-actions">
                <a className="btn small primary" href="#/approvals">
                  承認画面で判断する
                </a>
                <a className="btn small" href={`#/jobs/${a.jobId}`}>
                  案件を開く
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  );
}

export function ShelfPanel({
  deliverables,
  snapshot,
  lastSeen,
  onOpen,
  onClose,
}: {
  deliverables: DeliverableView[];
  snapshot: Snapshot;
  lastSeen: number;
  onOpen: (id: number) => void;
  onClose: () => void;
}) {
  const recent = deliverables.filter((d) => d.exists).slice(0, 12);
  const nameOf = (id: string) => snapshot.employees.find((e) => e.id === id)?.name ?? id;
  return (
    <PanelShell title="資料棚" onClose={onClose} testId="shelf-panel">
      <p className="muted small">AI社員が実際に保存した成果物です（新しい順）。</p>
      {recent.length === 0 ? (
        <p className="muted">まだ成果物はありません。</p>
      ) : (
        <ul className="shelf-list">
          {recent.map((d) => (
            <li key={d.id}>
              <button type="button" className="file-btn" onClick={() => onOpen(d.id)}>
                <span className="file-name">{d.title}</span>
                {d.id > lastSeen && <Badge tone="review">新着</Badge>}
                {d.isDemo && <DemoBadge />}
                <span className="muted small">
                  #{d.jobId}・{nameOf(d.employeeId)}・{formatTime(d.createdAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <a className="btn" href="#/library">
        資料・成果物の一覧へ
      </a>
    </PanelShell>
  );
}

export function AchievementsPanel({ snapshot, deliverables, onClose }: { snapshot: Snapshot; deliverables: DeliverableView[]; onClose: () => void }) {
  const done = snapshot.jobs.filter((j) => j.status === 'completed').sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));
  const approvedCount = snapshot.approvals.filter((a) => a.status === 'approved').length;
  return (
    <PanelShell title="実績ボード" onClose={onClose} testId="achievements-panel">
      <p className="muted small">CEOが承認して完了した案件と、保存済みの成果物の記録です。</p>
      <dl className="ach-stats">
        <div>
          <dt>完了した案件</dt>
          <dd>{done.length}</dd>
        </div>
        <div>
          <dt>保存済み成果物</dt>
          <dd>{deliverables.length}</dd>
        </div>
        <div>
          <dt>承認の記録</dt>
          <dd>{approvedCount}</dd>
        </div>
      </dl>
      {done.length === 0 ? (
        <p className="muted">まだ完了した案件はありません。最初の承認で、ここに記録が並びます。</p>
      ) : (
        <ul className="decision-list">
          {done.map((j) => (
            <li key={j.id}>
              <a href={`#/jobs/${j.id}`} className="strong">
                #{j.id} {j.title}
              </a>
              <div className="muted small">
                完了 {formatTime(j.finishedAt)}・成果物 {j.deliverableCount}件 {j.adapter === 'demo' ? '・デモ' : '・Claude Code'}
              </div>
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  );
}

export function EventsPanel({ events, snapshot, onClose }: { events: OfficeEvent[]; snapshot: Snapshot; onClose: () => void }) {
  const nameOf = (id: string | null) => (id == null ? 'CEO' : id === 'shelf' ? '資料棚' : id === 'ceo' ? 'CEO' : (snapshot.employees.find((e) => e.id === id)?.name ?? id));
  const list = [...events].reverse().slice(0, 30);
  return (
    <PanelShell title="最近の出来事" onClose={onClose} testId="events-panel">
      <p className="muted small">実行履歴・成果物・承認の記録から表示しています。詳しい内容は各案件の作業履歴で確認できます。</p>
      {list.length === 0 ? (
        <p className="muted">まだ出来事はありません。</p>
      ) : (
        <ol className="event-list">
          {list.map((e) => (
            <li key={e.key}>
              <time>{formatTime(e.at)}</time>
              <span>
                <strong>{nameOf(e.employeeId)}</strong>
                {e.toEmployeeId && e.type === 'handoff' ? ` → ${nameOf(e.toEmployeeId)}` : ''}：{e.label}
                <a href={`#/jobs/${e.jobId}`} className="muted small">
                  {' '}
                  #{e.jobId} {e.jobTitle}
                </a>
              </span>
            </li>
          ))}
        </ol>
      )}
    </PanelShell>
  );
}

export function EntrancePanel({ snapshot, onClose }: { snapshot: Snapshot; onClose: () => void }) {
  return (
    <PanelShell title="NIFTP 本社" onClose={onClose} testId="entrance-panel">
      <p>
        <strong>{snapshot.company.name}</strong>
        <br />
        <span className="muted small">{snapshot.company.note}</span>
      </p>
      <p>CEO: {snapshot.company.ceo}</p>
      <p>AI社員: {snapshot.employees.length}名</p>
      <p className="muted small">社員の名前は仮の名前です。設定画面で変更できます。</p>
      <a className="btn" href="#/settings">
        設定を開く
      </a>
    </PanelShell>
  );
}
