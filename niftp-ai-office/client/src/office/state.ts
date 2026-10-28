// オフィス画面の表示用の状態。サーバーの記録は変えず、閲覧者ごとの便宜（既読・動きの設定）だけを扱う。
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api, type OfficeEvent } from '../api.ts';
import { useChangeSignal } from '../hooks.ts';

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 保存できない環境（プライベートモード等）では、その場限りの設定として扱う
  }
}

// ---- アニメーションを減らす設定 ----
const MOTION_KEY = 'niftp.reduceMotion';
const motionListeners = new Set<() => void>();
let motionPref: 'on' | 'off' | 'system' = (readStorage(MOTION_KEY) as 'on' | 'off' | null) ?? 'system';

function systemReduced(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function applyMotion() {
  const reduced = motionPref === 'on' || (motionPref === 'system' && systemReduced());
  document.documentElement.dataset.motion = reduced ? 'reduced' : 'full';
}

if (typeof document !== 'undefined') applyMotion();

export function useReducedMotion() {
  const pref = useSyncExternalStore(
    (cb) => {
      motionListeners.add(cb);
      return () => motionListeners.delete(cb);
    },
    () => motionPref,
  );
  useEffect(applyMotion, [pref]);
  const reduced = pref === 'on' || (pref === 'system' && systemReduced());
  const setPref = (next: 'on' | 'off' | 'system') => {
    motionPref = next;
    writeStorage(MOTION_KEY, next);
    applyMotion();
    motionListeners.forEach((l) => l());
  };
  return { reduced, pref, setPref };
}

// ---- 資料棚の新着（この閲覧者がまだ見ていない成果物） ----
const SEEN_KEY = 'niftp.lastSeenDeliverableId';

export function useSeenDeliverables(maxId: number | null) {
  const [lastSeen, setLastSeen] = useState<number | null>(() => {
    const v = readStorage(SEEN_KEY);
    return v == null ? null : Number(v);
  });
  useEffect(() => {
    // 初めて開いたときは既存の成果物をすべて既読として扱い、以後に保存されたものだけを新着にする
    if (lastSeen == null && maxId != null) {
      setLastSeen(maxId);
      writeStorage(SEEN_KEY, String(maxId));
    }
  }, [lastSeen, maxId]);
  const markSeen = useCallback((id: number) => {
    setLastSeen((cur) => {
      const next = Math.max(cur ?? 0, id);
      writeStorage(SEEN_KEY, String(next));
      return next;
    });
  }, []);
  return { lastSeen: lastSeen ?? maxId ?? Number.MAX_SAFE_INTEGER, markSeen };
}

// ---- 実際の出来事（演出のきっかけ） ----
/**
 * 直近の出来事を取得する。画面を開いた時点までの出来事は演出せず、それ以後に新しく記録された出来事だけを fresh として返す。
 * 演出を見逃しても、同じ内容は events（出来事の一覧）と案件履歴で確認できる。
 */
export function useOfficeEvents() {
  const [events, setEvents] = useState<OfficeEvent[]>([]);
  const [fresh, setFresh] = useState<OfficeEvent[]>([]);
  const seen = useRef<Set<string> | null>(null);
  const load = useCallback(() => {
    api
      .officeEvents()
      .then((list) => {
        if (seen.current == null) {
          seen.current = new Set(list.map((e) => e.key));
        } else {
          const news = list.filter((e) => !seen.current!.has(e.key));
          news.forEach((e) => seen.current!.add(e.key));
          const recent = news.filter((e) => Date.now() - Date.parse(e.at) < 90_000);
          if (recent.length > 0) setFresh((f) => [...f, ...recent].slice(-8));
        }
        setEvents(list);
      })
      .catch(() => {});
  }, []);
  useEffect(load, [load]);
  useChangeSignal(load);
  const consume = useCallback((keys: string[]) => setFresh((f) => f.filter((e) => !keys.includes(e.key))), []);
  return { events, fresh, consume };
}

export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}
