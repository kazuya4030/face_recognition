// オフィス画面（NIFTP本社）。オフィスを主役にし、常時表示は稼働モード・件数・停止操作に絞る。
// 詳細は社員や家具をクリックしたときに開くパネルへ。スマートフォンではオフィス／社員／案件を切り替える。
import { useEffect, useRef, useState } from 'react';
import type { Snapshot } from '../api.ts';
import { Badge, DemoBadge, JobActions } from '../components.tsx';
import { EMPLOYEE_STATUS, JOB_STATUS } from '../labels.ts';
import { appearanceOf } from '../office/appearance.ts';
import { Portrait } from '../office/Character.tsx';
import type { Target } from '../office/layout.ts';
import { iso, VIEW } from '../office/iso.ts';
import { OfficeScene } from '../office/OfficeScene.tsx';
import { AchievementsPanel, CeoPanel, EmployeePanel, EntrancePanel, EventsPanel, ShelfPanel, type PanelKind } from '../office/Panels.tsx';
import { useNow, useOfficeEvents, useReducedMotion, useSeenDeliverables } from '../office/state.ts';
import { useDeliverablesState } from './ApprovalsPage.tsx';

type Props = { snapshot: Snapshot; navigate: (p: string) => void };
type MobileView = 'office' | 'people' | 'jobs';

export function OfficePage({ snapshot, navigate }: Props) {
  const [panel, setPanel] = useState<PanelKind | null>(null);
  const [view, setView] = useState<MobileView>('office');
  const { list: deliverables, loaded: deliverablesLoaded } = useDeliverablesState();
  const { events, fresh, consume } = useOfficeEvents();
  const { reduced, setPref } = useReducedMotion();
  const now = useNow();
  const maxDeliverableId = deliverables.length > 0 ? Math.max(...deliverables.map((d) => d.id)) : 0;
  // 読み込みが終わるまでは基準を決めない（既存の成果物を新着扱いしないため）
  const { lastSeen, markSeen } = useSeenDeliverables(deliverablesLoaded ? maxDeliverableId : null);
  const unseen = deliverablesLoaded ? deliverables.filter((d) => d.id > lastSeen && d.exists) : [];
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // スマートフォンでは縮小せず、ロゴの壁と共同デスクが中央に来る位置から表示する
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const [focusX] = iso(6.2, 3.0, 0);
    el.scrollLeft = (focusX / VIEW.w) * el.scrollWidth - el.clientWidth / 2;
  }, [view]);

  const pending = snapshot.approvals.filter((a) => a.status === 'pending');
  const running = snapshot.jobs.filter((j) => j.status === 'running');
  const waiting = snapshot.jobs.filter((j) => j.status === 'queued' || j.status === 'paused');
  const completedCount = snapshot.jobs.filter((j) => j.status === 'completed').length;
  const errors = snapshot.jobs.filter((j) => j.status === 'error');
  const selectedEmployee = panel && typeof panel === 'object' ? snapshot.employees.find((e) => e.id === panel.employee) : undefined;
  const lastEvent = events[events.length - 1];
  const nameOf = (id: string | null) => (id ? (snapshot.employees.find((e) => e.id === id)?.name ?? '') : 'CEO');

  const openDeliverable = (id: number) => {
    markSeen(maxDeliverableId);
    navigate(`library/${id}`);
  };

  const onTarget = (t: Target) => {
    switch (t) {
      case 'meeting':
        navigate('request');
        break;
      case 'whiteboard':
        navigate('board');
        break;
      case 'ceo':
        setPanel('ceo');
        break;
      case 'shelf':
        setPanel('shelf');
        break;
      case 'achievements':
        setPanel('achievements');
        break;
      case 'entrance':
        setPanel('entrance');
        break;
    }
  };

  const panelNode = (() => {
    const close = () => setPanel(null);
    if (!panel) return null;
    if (typeof panel === 'object') return selectedEmployee ? <EmployeePanel e={selectedEmployee} snapshot={snapshot} navigate={navigate} onClose={close} /> : null;
    switch (panel) {
      case 'ceo':
        return <CeoPanel snapshot={snapshot} onClose={close} />;
      case 'shelf':
        return <ShelfPanel deliverables={deliverables} snapshot={snapshot} lastSeen={lastSeen} onOpen={openDeliverable} onClose={close} />;
      case 'achievements':
        return <AchievementsPanel snapshot={snapshot} deliverables={deliverables} onClose={close} />;
      case 'events':
        return <EventsPanel events={events} snapshot={snapshot} onClose={close} />;
      case 'entrance':
        return <EntrancePanel snapshot={snapshot} onClose={close} />;
    }
  })();

  return (
    <div className="hq">
      <div className={`hq-hud ${running.length ? 'has-running' : ''}`} role="region" aria-label="会社の状況">
        {/* 承認待ち・エラーを先頭に置き、装飾より先に目に入るようにする */}
        <button type="button" className={`hud-stat ${pending.length ? 'attention' : ''}`} onClick={() => setPanel('ceo')} data-testid="hud-pending">
          {pending.length > 0 && <span className="hud-icon">!</span>}
          <span className="hud-num">{pending.length}</span>
          <span>承認待ち</span>
        </button>
        {errors.length > 0 && (
          <button type="button" className="hud-stat error" onClick={() => navigate('board')} data-testid="hud-errors">
            <span className="hud-num">{errors.length}</span>
            <span>エラー</span>
          </button>
        )}
        <button type="button" className="hud-stat" onClick={() => navigate('board')} data-testid="hud-working">
          <span className="st-dot" aria-hidden />
          <span className="hud-num">{running.length}</span>
          <span>作業中</span>
          {waiting.length > 0 && <span className="muted small hud-label-long">（待ち {waiting.length}）</span>}
        </button>
        {running.map((j) => (
          <div key={j.id} className="hud-running">
            <span className="pulse-dot" aria-hidden />
            <a href={`#/jobs/${j.id}`} className="hud-job">
              #{j.id} {j.title}
            </a>
            <span className="muted small">{j.currentStageLabel}</span>
            <JobActions job={{ ...j, actions: j.actions.filter((a) => a.action === 'pause' || a.action === 'cancel') }} />
          </div>
        ))}
        <div className="hud-right">
          <button type="button" className="btn small ghost desktop-only" onClick={() => setPanel('events')} title={lastEvent ? `${nameOf(lastEvent.employeeId)}：${lastEvent.label}` : ''}>
            出来事
          </button>
          <button type="button" className="btn small ghost desktop-only" aria-pressed={reduced} onClick={() => setPref(reduced ? 'off' : 'on')}>
            {reduced ? '動きを戻す' : '動きを減らす'}
          </button>
          <details className="popover hud-more mobile-only">
            <summary aria-label="その他の操作">…</summary>
            <div className="popover-body align-right">
              <button type="button" className="btn small" onClick={() => setPanel('events')}>
                最近の出来事
              </button>
              <button type="button" className="btn small" aria-pressed={reduced} onClick={() => setPref(reduced ? 'off' : 'on')}>
                {reduced ? '動きを戻す' : '動きを減らす'}
              </button>
            </div>
          </details>
          <button type="button" className="btn primary" onClick={() => navigate('request')}>
            仕事を依頼
          </button>
        </div>
      </div>

      <div className="hq-tabs" role="tablist" aria-label="表示の切り替え">
        {(
          [
            ['office', 'オフィス'],
            ['people', `社員 ${snapshot.employees.length}`],
            ['jobs', `案件 ${running.length + waiting.length + pending.length}`],
          ] as [MobileView, string][]
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} className={view === k ? 'active' : ''} onClick={() => setView(k)}>
            {label}
          </button>
        ))}
      </div>

      <div className={`hq-stage view-${view}`}>
        <div className="hq-scene-scroll" ref={scrollRef}>
          <OfficeScene
            snapshot={snapshot}
            selected={selectedEmployee?.id ?? null}
            onSelectEmployee={(id) => setPanel((p) => (p && typeof p === 'object' && p.employee === id ? null : { employee: id }))}
            onTarget={onTarget}
            unseenCount={unseen.length}
            onOpenNewest={() => unseen[0] && openDeliverable(unseen[0].id)}
            completedCount={completedCount}
            deliverableCount={deliverables.length}
            fresh={fresh}
            consume={consume}
            reducedMotion={reduced}
            now={now}
          />
        </div>

        <div className="hq-list people-list">
          {snapshot.employees.map((e) => {
            const st = EMPLOYEE_STATUS[e.status];
            return (
              <button key={e.id} type="button" className="person-card" onClick={() => setPanel({ employee: e.id })}>
                <Portrait look={appearanceOf(e.id)} size={52} />
                <span className="person-main">
                  <span className="strong">{e.name}</span> <span className="muted small">{e.roleTitle}</span>
                  <span className="small">
                    <Badge tone={st.tone}>{st.label}</Badge> {e.currentJob ? `#${e.currentJob.id} ${e.currentJob.title}` : e.statusDetail}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="hq-list jobs-list">
          {pending.map((a) => (
            <a key={`a${a.id}`} className="job-row attention" href="#/approvals">
              <Badge tone="review">承認待ち</Badge> {a.jobTitle}
            </a>
          ))}
          {[...running, ...waiting].map((j) => (
            <a key={j.id} className="job-row" href={`#/jobs/${j.id}`}>
              <Badge tone={JOB_STATUS[j.status].tone}>{JOB_STATUS[j.status].label}</Badge> #{j.id} {j.title} {j.adapter === 'demo' && <DemoBadge />}
            </a>
          ))}
          {pending.length + running.length + waiting.length === 0 && <p className="muted">進行中の案件はありません。</p>}
          <a className="btn" href="#/board">
            案件ボードを開く
          </a>
        </div>

        {panelNode}
      </div>
    </div>
  );
}
