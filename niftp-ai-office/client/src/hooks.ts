import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Snapshot } from './api.ts';

/** サーバーからの変更通知（SSE）を受けるたびに呼ばれる購読。通知が切れても定期的に再取得する。 */
type Listener = () => void;
const listeners = new Set<Listener>();
let source: EventSource | null = null;

function ensureSource() {
  if (source) return;
  source = new EventSource('/api/events');
  source.addEventListener('change', () => listeners.forEach((l) => l()));
}

export function useChangeSignal(onChange: Listener) {
  const ref = useRef(onChange);
  ref.current = onChange;
  useEffect(() => {
    ensureSource();
    let timer: number | undefined;
    const debounced = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => ref.current(), 120);
    };
    listeners.add(debounced);
    const poll = window.setInterval(() => ref.current(), 15000);
    return () => {
      listeners.delete(debounced);
      window.clearInterval(poll);
      window.clearTimeout(timer);
    };
  }, []);
}

export function useSnapshot() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const reload = useCallback(() => {
    api
      .state()
      .then((s) => {
        setSnapshot(s);
        setError('');
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(reload, [reload]);
  useChangeSignal(reload);
  return { snapshot, error, reload };
}

export function useHashRoute(): [string[], (path: string) => void] {
  const parse = () => (window.location.hash.replace(/^#\/?/, '').split('?')[0] || 'office').split('/');
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onHash = () => setRoute(parse());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return [route, (path: string) => (window.location.hash = `#/${path}`)];
}

export function hashQuery(): URLSearchParams {
  return new URLSearchParams(window.location.hash.split('?')[1] ?? '');
}
