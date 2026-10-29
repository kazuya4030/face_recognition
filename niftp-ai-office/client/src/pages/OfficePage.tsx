// オフィス画面（NIFTP本社）。オフィスを主役にし、常時表示は承認待ち・エラー・作業中・停止操作・依頼に絞る。
// 画角はカメラで管理し、初期表示は共同デスクと壁面ロゴを中心にした構図。社員を選ぶとその社員へ寄り、パネルを閉じると元の画角に戻る。
// オフィスの操作が難しい場合でも、社員・案件の一覧（PCは「一覧」パネル、スマートフォンは下部タブ）から同じ機能を使える。
import { useRef, useState } from 'react';
import type { EmployeeView, Snapshot } from '../api.ts';
import { Badge, DemoBadge, JobActions } from '../components.tsx';
import { EMPLOYEE_STATUS, JOB_STATUS } from '../labels.ts';
import { appearanceOf } from '../office/appearance.ts';
import { focusCamera, useCamera, type Camera } from '../office/camera.ts';
import { Portrait } from '../office/Character.tsx';
import type { Target } from '../office/layout.ts';
import { focusPointOf, OfficeScene } from '../office/OfficeScene.tsx';
import { CeoPanel, EmployeePanel, EntrancePanel, EventsPanel, PanelShell, ProjectBoardPanel, ShelfPanel, type PanelKind } from '../office/Panels.tsx';
import { useNow, useOfficeEvents, useReducedMotion, useSeenDeliverables } from '../office/state.ts';
import { OfficeToasts } from '../office/Toasts.tsx';
import { useDeliverablesState } from './ApprovalsPage.tsx';

type Props = { snapshot: Snapshot; navigate: (p: string) => void };
type MobileView = 'office' | 'people' | 'jobs';

const isNarrow = () => typeof window !== 'undefined' && window.innerWidth <= 760;

function PersonCard({ e, onOpen }: { e: EmployeeView; onOpen: () => void }) {
  const st = EMPLOYEE_STATUS[e.status];
  return (
    <button type="button" className="person-card" onClick={onOpen}>
      <Portrait look={appearanceOf(e.id)} size={52} />
      <span className="person-main">
        <span className="strong">{e.name}</span> <span className="muted small">{e.roleTitle}</span>
        <span className="small">
          <Badge tone={st.tone}>{st.label}</Badge> {e.currentJob ? `#${e.currentJob.id} ${e.currentJob.title}` : e.statusDetail}
        </span>
      </span>
    </button>
  );
}

function JobRows({ snapshot }: { snapshot: Snapshot }) {
  const pending = snapshot.approvals.filter((a) => a.status === 'pending');
  const active = snapshot.jobs.filter((j) => ['running', 'queued', 'paused', 'error'].includes(j.status));
  return (
    <>
      {pending.map((a) => (
        <a key={`a${a.id}`} className="job-row attention" href={`#/approvals/${a.id}`}>
          <Badge tone="review">承認待ち</Badge> {a.jobTitle}
        </a>
      ))}
      {active.map((j) => (
        <a key={j.id} className={`job-row ${j.status === 'error' ? 'is-error' : ''}`} href={`#/jobs/${j.id}`}>
          <Badge tone={JOB_STATUS[j.status].tone}>{JOB_STATUS[j.status].label}</Badge> #{j.id} {j.title} {j.adapter === 'demo' && <DemoBadge />}
        </a>
      ))}
      {pending.length + active.length === 0 && <p className="muted">進行中の案件はありません。</p>}
      <a className="btn" href="#/board">
        案件ボードを開く
      </a>
    </>
  );
}

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

  const stageRef = useRef<HTMLDivElement>(null);
  const camera = useCamera(stageRef, reduced);
  const beforeFocus = useRef<Camera | null>(null);

  const pending = snapshot.approvals.filter((a) => a.status === 'pending');
  const running = snapshot.jobs.filter((j) => j.status === 'running');
  const waiting = snapshot.jobs.filter((j) => j.status === 'queued' || j.status === 'paused');
  const errors = snapshot.jobs.filter((j) => j.status === 'error');
  const selectedEmployee = panel && typeof panel === 'object' ? snapshot.employees.find((e) => e.id === panel.employee) : undefined;
  const lastEvent = events[events.length - 1];
  const nameOf = (id: string | null) => (id ? (snapshot.employees.find((e) => e.id === id)?.name ?? '') : 'CEO');

  const openDeliverable = (id: number) => {
    markSeen(maxDeliverableId);
    navigate(`library/${id}`);
  };

  /** 社員を選ぶ：その社員へ寄り、詳細パネルを開く。パネルに隠れないよう寄る位置をずらす。 */
  const selectEmployee = (id: string) => {
    if (selectedEmployee?.id === id) return closePanel();
    if (!selectedEmployee && camera.camRef.current) beforeFocus.current = camera.camRef.current;
    setPanel({ employee: id });
    const point = focusPointOf(snapshot.employees, id);
    if (point && (view === 'office' || !isNarrow())) {
      const narrow = isNarrow();
      camera.moveTo(focusCamera(point, camera.size, narrow ? { right: 0, bottom: Math.max(0, camera.size.h - (window.innerHeight * 0.4 - (stageRef.current?.getBoundingClientRect().top ?? 0))) } : { right: 392, bottom: 0 }));
    }
  };

  /** パネルを閉じる：社員へ寄っていた場合は元の画角へ戻る。 */
  const closePanel = () => {
    setPanel(null);
    if (beforeFocus.current) {
      camera.moveTo(beforeFocus.current);
      beforeFocus.current = null;
    }
  };

  const openPanel = (p: PanelKind) => {
    if (selectedEmployee && beforeFocus.current) {
      camera.moveTo(beforeFocus.current);
      beforeFocus.current = null;
    }
    setPanel(p);
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
        openPanel('ceo');
        break;
      case 'shelf':
        openPanel('shelf');
        break;
      case 'achievements':
        openPanel('projects');
        break;
      case 'entrance':
        openPanel('entrance');
        break;
    }
  };

  const panelNode = (() => {
    if (!panel) return null;
    if (typeof panel === 'object') {
      return selectedEmployee ? <EmployeePanel e={selectedEmployee} snapshot={snapshot} navigate={navigate} onClose={closePanel} onOpenDeliverable={openDeliverable} /> : null;
    }
    switch (panel) {
      case 'ceo':
        return <CeoPanel snapshot={snapshot} onClose={closePanel} />;
      case 'shelf':
        return <ShelfPanel deliverables={deliverables} snapshot={snapshot} lastSeen={lastSeen} onOpen={openDeliverable} onClose={closePanel} />;
      case 'projects':
        return <ProjectBoardPanel snapshot={snapshot} deliverables={deliverables} navigate={navigate} onOpenDeliverable={openDeliverable} onClose={closePanel} />;
      case 'events':
        return <EventsPanel events={events} snapshot={snapshot} onClose={closePanel} />;
      case 'entrance':
        return <EntrancePanel snapshot={snapshot} onClose={closePanel} />;
      case 'list':
        return (
          <PanelShell title="社員・案件の一覧" onClose={closePanel} testId="list-panel">
            <p className="muted small">オフィスの中で探さなくても、ここから同じ操作ができます。</p>
            <h3>社員</h3>
            <div className="list-stack">
              {snapshot.employees.map((e) => (
                <PersonCard key={e.id} e={e} onOpen={() => selectEmployee(e.id)} />
              ))}
            </div>
            <h3>案件</h3>
            <div className="list-stack">
              <JobRows snapshot={snapshot} />
            </div>
          </PanelShell>
        );
    }
  })();

  return (
    <div className="hq">
      <div className={`hq-hud ${running.length ? 'has-running' : ''}`} role="region" aria-label="会社の状況">
        {/* 承認待ち・エラーを先頭に置き、装飾より先に目に入るようにする */}
        <button type="button" className={`hud-stat ${pending.length ? 'attention' : ''}`} onClick={() => openPanel('ceo')} data-testid="hud-pending">
          {pending.length > 0 && <span className="hud-icon">!</span>}
          <span className="hud-num">{pending.length}</span>
          <span>承認待ち</span>
        </button>
        {errors.length > 0 && (
          <button type="button" className="hud-stat error" onClick={() => navigate('board')} data-testid="hud-errors">
            <span className="hud-icon error">×</span>
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
          <button type="button" className="btn small ghost desktop-only" onClick={() => openPanel('list')}>
            一覧
          </button>
          <button type="button" className="btn small ghost desktop-only" onClick={() => openPanel('events')} title={lastEvent ? `${nameOf(lastEvent.employeeId)}：${lastEvent.label}` : ''}>
            出来事
          </button>
          <button type="button" className="btn small ghost desktop-only" aria-pressed={reduced} onClick={() => setPref(reduced ? 'off' : 'on')}>
            {reduced ? '動きを戻す' : '動きを減らす'}
          </button>
          <details className="popover hud-more mobile-only">
            <summary aria-label="その他の操作">…</summary>
            <div className="popover-body align-right">
              <button type="button" className="btn small" onClick={() => openPanel('events')}>
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
            ['jobs', `案件 ${running.length + waiting.length + pending.length + errors.length}`],
          ] as [MobileView, string][]
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} className={view === k ? 'active' : ''} onClick={() => setView(k)}>
            {label}
          </button>
        ))}
      </div>

      <div className={`hq-stage view-${view}`}>
        <div className="hq-scene" ref={stageRef} {...camera.bind} data-testid="office-stage">
          <OfficeScene
            snapshot={snapshot}
            selected={selectedEmployee?.id ?? null}
            onSelectEmployee={selectEmployee}
            onTarget={onTarget}
            unseenCount={unseen.length}
            onOpenNewest={() => unseen[0] && openDeliverable(unseen[0].id)}
            fresh={fresh}
            consume={consume}
            reducedMotion={reduced}
            now={now}
            viewBox={camera.viewBox}
          />
        </div>

        <OfficeToasts fresh={fresh} snapshot={snapshot} navigate={navigate} />

        {/* 画角の操作 */}
        <div className="cam-controls" role="toolbar" aria-label="画角の操作">
          <button type="button" onClick={() => camera.zoomBy(1.25)} aria-label="拡大">
            ＋
          </button>
          <button type="button" onClick={() => camera.zoomBy(0.8)} aria-label="縮小">
            －
          </button>
          <button type="button" className="wide" onClick={() => camera.overview()}>
            オフィス全体
          </button>
          <button type="button" className="wide" onClick={() => camera.home()}>
            デスク中心
          </button>
        </div>
        <p className="cam-hint desktop-only" aria-hidden>
          ドラッグで移動・ホイールで拡大縮小
        </p>

        <div className="hq-list people-list">
          {snapshot.employees.map((e) => (
            <PersonCard key={e.id} e={e} onOpen={() => selectEmployee(e.id)} />
          ))}
        </div>

        <div className="hq-list jobs-list">
          <JobRows snapshot={snapshot} />
        </div>

        {panelNode}
      </div>
    </div>
  );
}
