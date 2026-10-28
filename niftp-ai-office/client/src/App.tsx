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

export function App() {
  const { snapshot, error } = useSnapshot();
  const [route, navigate] = useHashRoute();
  const page = route[0];

  if (!snapshot) {
    return <div className="loading">{error ? `サーバーに接続できません: ${error}` : '読み込み中…'}</div>;
  }

  const pendingApprovals = snapshot.approvals.filter((a) => a.status === 'pending').length;
  const demoDefault = snapshot.settings.defaultAdapter === 'demo';
  const demoRunning = snapshot.jobs.some((j) => j.adapter === 'demo' && (j.status === 'running' || j.status === 'queued'));

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <div>
            <div className="brand-name">NIFTP AI Office</div>
            <div className="brand-sub">
              {snapshot.company.name}
              <span className="concept-tag" title="法人は設立されていません">{snapshot.company.note}</span>
              <span className="ceo">CEO {snapshot.company.ceo}</span>
            </div>
          </div>
        </div>
        <nav className="nav" aria-label="画面切り替え">
          {NAV.map((n) => (
            <a key={n.key} href={`#/${n.key}`} className={page === n.key || (page === 'jobs' && n.key === 'board') ? 'active' : ''}>
              {n.label}
              {n.key === 'approvals' && pendingApprovals > 0 && <span className="count">{pendingApprovals}</span>}
            </a>
          ))}
        </nav>
      </header>

      {(demoDefault || demoRunning) && (
        <div className="mode-banner" role="status">
          <strong>デモモード</strong>
          デモ実行の案件は、定型の手順と定型テキストで流れを確認するためのものです。実際のAIによる調査・制作ではありません（成果物には「デモ」と表示されます）。
          {snapshot.adapters.find((a) => a.id === 'claude')?.ok && <a href="#/settings">実接続（Claude Code）に切り替える</a>}
        </div>
      )}

      <main className="main">
        {page === 'office' && <OfficePage snapshot={snapshot} navigate={navigate} />}
        {page === 'request' && <RequestPage snapshot={snapshot} navigate={navigate} />}
        {page === 'board' && <BoardPage snapshot={snapshot} navigate={navigate} />}
        {page === 'jobs' && route[1] && <JobDetailPage key={route[1]} jobId={Number(route[1])} snapshot={snapshot} navigate={navigate} />}
        {page === 'approvals' && <ApprovalsPage snapshot={snapshot} navigate={navigate} />}
        {page === 'library' && <LibraryPage snapshot={snapshot} navigate={navigate} initialId={route[1] ? Number(route[1]) : undefined} />}
        {page === 'settings' && <SettingsPage snapshot={snapshot} />}
        {!NAV.some((n) => n.key === page) && page !== 'jobs' && <p>ページが見つかりません。</p>}
      </main>
    </div>
  );
}
