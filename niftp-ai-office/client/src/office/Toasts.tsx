// 実際に記録された出来事の短い通知。画面を開いた後に新しく届いた出来事だけを出し、数秒で消える。
// 見逃しても同じ内容は「出来事」パネルと案件の作業履歴で確認できる。
import { useEffect, useRef, useState } from 'react';
import type { OfficeEvent, Snapshot } from '../api.ts';

interface Toast {
  key: string;
  tone: 'review' | 'error' | 'done' | 'info';
  text: string;
  jobId: number;
  demo: boolean;
}

function toastOf(ev: OfficeEvent, snapshot: Snapshot): Toast | null {
  const name = (id: string | null) => (id == null || id === 'ceo' ? 'CEO' : (snapshot.employees.find((e) => e.id === id)?.name ?? id));
  const demo = snapshot.jobs.find((j) => j.id === ev.jobId)?.adapter === 'demo';
  const base = { key: ev.key, jobId: ev.jobId, demo };
  switch (ev.type) {
    case 'handoff':
      return { ...base, tone: 'info', text: `${name(ev.employeeId)} → ${name(ev.toEmployeeId)}：${ev.label}（#${ev.jobId}）` };
    case 'deliverable_saved':
      return { ...base, tone: 'done', text: `${name(ev.employeeId)}：${ev.label}` };
    case 'approval_requested':
      return { ...base, tone: 'review', text: `承認待ち：#${ev.jobId} ${ev.jobTitle}` };
    case 'approved':
      return { ...base, tone: 'done', text: `承認しました：#${ev.jobId} ${ev.jobTitle}` };
    case 'rejected':
      return { ...base, tone: 'info', text: `差し戻しました：#${ev.jobId} ${ev.jobTitle}` };
    case 'error':
      return { ...base, tone: 'error', text: `${name(ev.employeeId)}：${ev.label}（#${ev.jobId} ${ev.jobTitle}）` };
    default:
      return null;
  }
}

const ICON: Record<Toast['tone'], string> = { review: '!', error: '×', done: '✓', info: '→' };

export function OfficeToasts({ fresh, snapshot, navigate }: { fresh: OfficeEvent[]; snapshot: Snapshot; navigate: (p: string) => void }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const shown = useRef(new Set<string>());
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  useEffect(() => {
    const add = fresh.map((ev) => toastOf(ev, snapshot)).filter((t): t is Toast => t != null && !shown.current.has(t.key));
    if (add.length === 0) return;
    add.forEach((t) => shown.current.add(t.key));
    setToasts((cur) => [...cur, ...add].slice(-4));
    // fresh はシーン側ですぐ消費されるため、タイマーは出来事ごとに持ち、画面を離れるときだけ止める
    timers.current.push(window.setTimeout(() => setToasts((cur) => cur.filter((t) => !add.includes(t))), 6000));
    // snapshot は表示名の参照のみ。新しい出来事が届いたときだけ通知を作る
  }, [fresh]);
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.key} type="button" className={`toast toast-${t.tone}`} onClick={() => navigate(`jobs/${t.jobId}`)}>
          <span className="toast-icon" aria-hidden>
            {ICON[t.tone]}
          </span>
          <span>{t.text}</span>
          {t.demo && <span className="toast-demo">デモ</span>}
        </button>
      ))}
    </div>
  );
}
