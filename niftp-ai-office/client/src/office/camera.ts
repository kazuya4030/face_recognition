// オフィスの画角（カメラ）。SVG の viewBox を動かして、拡大・縮小・移動・寄りを実現する。
// - 移動中もクリックやドラッグで割り込める（アニメーションは即座に中断される）
// - ドラッグした後のクリックは社員の選択として扱わない
// - 動きを減らす設定では、画角の切り替えを即時にする
// - スマートフォンでは touch-action: pan-y（CSS）により、縦のスワイプはページのスクロールに使われる
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { iso, VIEW } from './iso.ts';

export interface Camera {
  /** 画面中央に来るシーン座標。 */
  cx: number;
  cy: number;
  /** 全体が収まる倍率を 1 とした拡大率。 */
  zoom: number;
}

export const MIN_ZOOM = 0.9;
export const MAX_ZOOM = 3.6;
const DRAG_THRESHOLD = 6;

type Size = { w: number; h: number };

/** 全体が収まるときの表示幅（シーン座標）。 */
function fitWidth(size: Size): number {
  const aspect = size.w / Math.max(1, size.h);
  return aspect > VIEW.w / VIEW.h ? VIEW.h * aspect : VIEW.w;
}

export function visibleSize(cam: Camera, size: Size) {
  const w = fitWidth(size) / cam.zoom;
  return { w, h: (w * size.h) / Math.max(1, size.w) };
}

export function viewBoxOf(cam: Camera, size: Size): string {
  const v = visibleSize(cam, size);
  return `${(cam.cx - v.w / 2).toFixed(1)} ${(cam.cy - v.h / 2).toFixed(1)} ${v.w.toFixed(1)} ${v.h.toFixed(1)}`;
}

function clampCam(cam: Camera): Camera {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.zoom));
  return { zoom, cx: Math.min(VIEW.w, Math.max(0, cam.cx)), cy: Math.min(VIEW.h, Math.max(0, cam.cy)) };
}

/** 指定した範囲（シーン座標）が収まる画角。 */
export function frame(points: [number, number][], size: Size, pad = 1.08): Camera {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const bw = (Math.max(...xs) - Math.min(...xs)) * pad;
  const bh = (Math.max(...ys) - Math.min(...ys)) * pad;
  const fw = fitWidth(size);
  const fh = (fw * size.h) / Math.max(1, size.w);
  const zoom = Math.min(fw / bw, fh / bh);
  return clampCam({ cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2, zoom });
}

export const OVERVIEW: Camera = { cx: VIEW.w / 2, cy: VIEW.h / 2, zoom: 1 };

/** 初期表示：共同デスクと壁面ロゴを中心にした、少し寄った構図。 */
export function homeCamera(size: Size): Camera {
  // 縦長の画面（スマートフォン）では横幅で縮みすぎないよう、ロゴと共同デスクに絞って寄る
  if (size.w / size.h < 0.9) return frame([iso(4.3, 0, 3.1), iso(8.2, 0, 3.1), iso(4.5, 7.5, 0), iso(9.9, 6.7, 0)], size, 1.0);
  return frame([iso(1.6, 0, 3.3), iso(9.6, 0, 3.3), iso(3.2, 8.2, 0), iso(11.2, 6.9, 0)], size, 1.1);
}

/**
 * 社員への寄り。詳細パネルに隠れないよう、PC では右のパネル分だけ左へ、
 * スマートフォンでは下からのパネル分だけ上へずらす。
 */
export function focusCamera(point: [number, number], size: Size, panel: { right: number; bottom: number }): Camera {
  const zoom = size.w < 700 ? Math.max(homeCamera(size).zoom * 1.15, 2.1) : 1.95;
  const v = visibleSize({ cx: 0, cy: 0, zoom }, size);
  const unit = v.w / Math.max(1, size.w); // 画面1pxあたりのシーン座標
  const freeW = size.w - panel.right;
  const freeH = size.h - panel.bottom;
  // 見えている領域の中央（パネルを除く）に point が来るように中心をずらす
  const cx = point[0] + (size.w / 2 - freeW / 2) * unit;
  const cy = point[1] + (size.h / 2 - freeH * 0.45) * unit;
  return clampCam({ cx, cy, zoom });
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export function useCamera(containerRef: RefObject<HTMLDivElement | null>, reducedMotion: boolean) {
  const [size, setSize] = useState<Size>({ w: 1200, h: 700 });
  const [cam, setCamState] = useState<Camera | null>(null);
  const camRef = useRef<Camera | null>(null);
  const anim = useRef<number | null>(null);
  const userMoved = useRef(false);

  const apply = (c: Camera) => {
    camRef.current = c;
    setCamState(c);
  };
  const stop = () => {
    if (anim.current != null) cancelAnimationFrame(anim.current);
    anim.current = null;
  };

  /** 画角を移す。動きを減らす設定では即時。移動中に操作されたら中断する。 */
  const moveTo = useCallback(
    (target: Camera, duration = 420) => {
      stop();
      const from = camRef.current;
      const to = clampCam(target);
      if (!from || reducedMotion || duration <= 0) return apply(to);
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const k = ease(t);
        apply({ cx: from.cx + (to.cx - from.cx) * k, cy: from.cy + (to.cy - from.cy) * k, zoom: from.zoom + (to.zoom - from.zoom) * k });
        anim.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      anim.current = requestAnimationFrame(step);
    },
    [reducedMotion],
  );

  // 表示領域の大きさを追跡する。初回は初期の構図にする
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const next = { w: Math.max(1, r.width), h: Math.max(1, r.height) };
      setSize(next);
      if (!camRef.current || !userMoved.current) apply(homeCamera(next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  // ---- ドラッグ・ピンチ・ホイール ----
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startX: number; startY: number; cam: Camera; dist: number; midX: number; midY: number; dragging: boolean } | null>(null);
  const suppressClick = useRef(false);

  const toScene = (px: number, py: number, c: Camera) => {
    const el = containerRef.current!;
    const r = el.getBoundingClientRect();
    const v = visibleSize(c, size);
    return [c.cx + (px - r.left - r.width / 2) * (v.w / r.width), c.cy + (py - r.top - r.height / 2) * (v.h / r.height)] as const;
  };

  const resetGesture = () => {
    const pts = [...pointers.current.values()];
    if (pts.length === 0 || !camRef.current) {
      gesture.current = null;
      return;
    }
    const midX = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const midY = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    gesture.current = { startX: midX, startY: midY, cam: camRef.current, dist, midX, midY, dragging: gesture.current?.dragging ?? false };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    stop();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) gesture.current = null;
    resetGesture();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current || !camRef.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const pts = [...pointers.current.values()];
    const midX = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const midY = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    if (!g.dragging && Math.hypot(midX - g.startX, midY - g.startY) < DRAG_THRESHOLD && pts.length < 2) return;
    if (!g.dragging) {
      g.dragging = true;
      userMoved.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    let zoom = g.cam.zoom;
    if (pts.length > 1 && g.dist > 0) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      zoom = g.cam.zoom * (dist / g.dist);
    }
    const v0 = visibleSize(g.cam, size);
    const v1 = visibleSize({ ...g.cam, zoom }, size);
    const el = containerRef.current!;
    const r = el.getBoundingClientRect();
    // つまんだ位置（またはつかんだ位置）がずれないように中心を動かす
    const anchorX = g.cam.cx + (g.startX - r.left - r.width / 2) * (v0.w / r.width);
    const anchorY = g.cam.cy + (g.startY - r.top - r.height / 2) * (v0.h / r.height);
    apply(
      clampCam({
        zoom,
        cx: anchorX - (midX - r.left - r.width / 2) * (v1.w / r.width),
        cy: anchorY - (midY - r.top - r.height / 2) * (v1.h / r.height),
      }),
    );
  };

  const onPointerEnd = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    if (gesture.current?.dragging) {
      suppressClick.current = true;
      window.setTimeout(() => (suppressClick.current = false), 0);
    }
    if (pointers.current.size === 0) gesture.current = null;
    else resetGesture();
  };

  /** ドラッグの直後のクリックを無効にする（誤って社員を選ばないため）。 */
  const onClickCapture = (e: React.MouseEvent) => {
    if (suppressClick.current) {
      e.stopPropagation();
      e.preventDefault();
      suppressClick.current = false;
    }
  };

  // ホイールで拡大・縮小（カーソル位置を基準にする）。passive: false が必要なため addEventListener を使う
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!camRef.current) return;
      e.preventDefault();
      stop();
      userMoved.current = true;
      const c = camRef.current;
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.zoom * Math.exp(-e.deltaY * 0.0015)));
      const [ax, ay] = toScene(e.clientX, e.clientY, c);
      const r = el.getBoundingClientRect();
      const v1 = visibleSize({ ...c, zoom }, size);
      apply(clampCam({ zoom, cx: ax - (e.clientX - r.left - r.width / 2) * (v1.w / r.width), cy: ay - (e.clientY - r.top - r.height / 2) * (v1.h / r.height) }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const zoomBy = (factor: number) => {
    const c = camRef.current;
    if (!c) return;
    userMoved.current = true;
    moveTo({ ...c, zoom: c.zoom * factor }, 220);
  };

  return {
    size,
    cam: cam ?? homeCamera(size),
    camRef,
    viewBox: viewBoxOf(cam ?? homeCamera(size), size),
    moveTo: (c: Camera, d?: number) => {
      userMoved.current = true;
      moveTo(c, d);
    },
    home: () => {
      userMoved.current = false;
      moveTo(homeCamera(size));
    },
    overview: () => {
      userMoved.current = true;
      moveTo(OVERVIEW);
    },
    zoomBy,
    bind: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd, onClickCapture },
  };
}
