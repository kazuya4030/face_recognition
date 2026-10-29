import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Snapshot } from './api.ts';
import { CompanyInfo } from './components.tsx';
import { useHashRoute, useSnapshot } from './hooks.ts';
import { OfficePage } from './pages/OfficePage.tsx';
import { RequestPage } from './pages/RequestPage.tsx';
import { BoardPage } from './pages/BoardPage.tsx';
import { ApprovalsPage } from './pages/ApprovalsPage.tsx';
import { LibraryPage } from './pages/LibraryPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { JobDetailPage } from './pages/JobDetailPage.tsx';

const NAV = [
  { key: 'office', label: 'オフィス' },
  { key: 'request', label: '仕事の依頼' },
  { key: 'board', label: '案件ボード' },
  { key: 'approvals', label: '承認' },
  { key: 'library', label: '資料・成果物' },
  { key: 'settings', label: '設定' },
];

/** 開閉できる小さなポップオーバー。外側をクリックすると閉じる。 */
function Popover({ className, label, children, align = 'left' }: { className: string; label: ReactNode; children: ReactNode; align?: 'left' | 'right' }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);
  return (
    <details ref={ref} className={`popover ${className}`}>
      <summary>{label}</summary>
      <div className={`popover-body align-${align}`}>{children}</div>
    </details>
  );
}

function ModeChip({ snapshot }: { snapshot: Snapshot }) {
  const demo = snapshot.settings.defaultAdapter === 'demo' || snapshot.jobs.some((j) => j.adapter === 'demo' && ['running', 'queued'].includes(j.status));
  const claudeOk = snapshot.adapters.find((a) => a.id === 'claude')?.ok;
  return (
    <Popover className={`mode-chip ${demo ? 'is-demo' : 'is-real'}`} label={demo ? 'デモモード' : '実接続'}>
      {demo ? (
        <p>
          デモ実行の案件は、定型の手順と定型テキストで流れを確認するためのものです。実際のAIによる調査・制作ではありません。成果物には「デモ」と表示されます。
        </p>
      ) : (
        <p>新しい依頼は Claude Code が実際に作業します。費用・利用枠を消費します。</p>
      )}
      <a href="#/settings">{demo && claudeOk ? '実接続（Claude Code）に切り替える' : '実行方式の設定'}</a>
    </Popover>
  );
}

function MobileMenu({ page, pending, snapshot }: { page: string; pending: number; snapshot: Snapshot }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [page]);
  return (
    <div className="mobile-menu">
      <button type="button" className="menu-button" aria-expanded={open} aria-label="メニュー" onClick={() => setOpen((o) => !o)}>
        <span aria-hidden className="menu-icon" />
      </button>
      {open && (
        <div className="menu-sheet" role="menu">
          <nav aria-label="画面切り替え">
            {NAV.map((n) => (
              <a key={n.key} href={`#/${n.key}`} role="menuitem" className={page === n.key ? 'active' : ''} onClick={() => setOpen(false)}>
                {n.label}
                {n.key === 'approvals' && pending > 0 && <span className="count">{pending}</span>}
              </a>
            ))}
          </nav>
          <CompanyInfo snapshot={snapshot} />
        </div>
      )}
    </div>
  );
}

export function App() {
  const { snapshot, error } = useSnapshot();
  const [route, navigate] = useHashRoute();
  const page = route[0];

  if (!snapshot) {
    return <div className="loading">{error ? `サーバーに接続できません: ${error}` : '読み込み中…'}</div>;
  }

  const pendingApprovals = snapshot.approvals.filter((a) => a.status === 'pending').length;

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/office" aria-label="NIFTP AI Office（オフィスへ）">
          <img className="brand-logo" src="/brand/niftp-logo.png" alt="NIFTP" width={1087} height={381} />
          <span className="brand-product">AI Office</span>
        </a>
        <ModeChip snapshot={snapshot} />
        <nav className="nav" aria-label="画面切り替え">
          {NAV.map((n) => (
            <a key={n.key} href={`#/${n.key}`} className={page === n.key || (page === 'jobs' && n.key === 'board') ? 'active' : ''}>
              {n.label}
              {n.key === 'approvals' && pendingApprovals > 0 && <span className="count">{pendingApprovals}</span>}
            </a>
          ))}
        </nav>
        <div className="topbar-right">
          <Popover className="company-pop" label="会社情報" align="right">
            <CompanyInfo snapshot={snapshot} />
          </Popover>
          {pendingApprovals > 0 && (
            <a className="pending-pill" href="#/approvals" aria-label={`承認待ち ${pendingApprovals}件`}>
              <span aria-hidden>!</span> 承認 {pendingApprovals}
            </a>
          )}
          <MobileMenu page={page} pending={pendingApprovals} snapshot={snapshot} />
        </div>
      </header>

      <main className={`main page-${page}`}>
        {page === 'office' && <OfficePage snapshot={snapshot} navigate={navigate} />}
        {page === 'request' && <RequestPage snapshot={snapshot} navigate={navigate} />}
        {page === 'board' && <BoardPage snapshot={snapshot} navigate={navigate} />}
        {page === 'jobs' && route[1] && <JobDetailPage key={route[1]} jobId={Number(route[1])} snapshot={snapshot} navigate={navigate} />}
        {page === 'approvals' && <ApprovalsPage snapshot={snapshot} navigate={navigate} focusId={route[1] ? Number(route[1]) : undefined} />}
        {page === 'library' && <LibraryPage snapshot={snapshot} navigate={navigate} initialId={route[1] ? Number(route[1]) : undefined} />}
        {page === 'settings' && <SettingsPage snapshot={snapshot} />}
        {!NAV.some((n) => n.key === page) && page !== 'jobs' && <p>ページが見つかりません。</p>}
      </main>
    </div>
  );
}
