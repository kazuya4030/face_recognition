// アイソメトリック（2:1）投影の計算。3Dエンジンは使わず、SVG の多角形で奥行きを表現する。
// 座標: x は画面右下、y は画面左下へ伸びる床の軸。z は高さ。単位は床の1マス。

export const ROOM = { w: 16, d: 12, wallH: 3.3 } as const;

const HALF_W = 32; // 1マスの横幅の半分（px）
const HALF_H = 16; // 1マスの縦幅の半分（px）
const UNIT_Z = 30; // 高さ1あたりの px

const MARGIN_X = 36;
const MARGIN_TOP = 40;
export const ORIGIN = { x: ROOM.d * HALF_W + MARGIN_X, y: ROOM.wallH * UNIT_Z + MARGIN_TOP };
export const VIEW = {
  w: (ROOM.w + ROOM.d) * HALF_W + MARGIN_X * 2,
  h: ORIGIN.y + (ROOM.w + ROOM.d) * HALF_H + 34,
};

export type P3 = [number, number, number];

export function iso(x: number, y: number, z = 0): [number, number] {
  return [ORIGIN.x + (x - y) * HALF_W, ORIGIN.y + (x + y) * HALF_H - z * UNIT_Z];
}

export function pts(list: P3[]): string {
  return list.map(([x, y, z]) => iso(x, y, z).map((v) => v.toFixed(1)).join(',')).join(' ');
}

export interface BoxGeom {
  x: number;
  y: number;
  z?: number;
  w: number;
  d: number;
  h: number;
}

/** 見える3面（上・左前・右前）の頂点。視点は x・y の大きい側（手前）。 */
export function boxFaces({ x, y, z = 0, w, d, h }: BoxGeom) {
  const t = z + h;
  return {
    top: pts([[x, y, t], [x + w, y, t], [x + w, y + d, t], [x, y + d, t]]),
    left: pts([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, t], [x, y + d, t]]),
    right: pts([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, t], [x + w, y, t]]),
  };
}

/** 床に落ちる影（家具の足元を少しずらした平行四辺形）。 */
export function shadowPts({ x, y, w, d }: BoxGeom, spread = 0.18): string {
  return pts([[x - 0.05, y - 0.05, 0], [x + w + spread, y - 0.05, 0], [x + w + spread, y + d + spread, 0], [x - 0.05, y + d + spread, 0]]);
}

/** 描画順のキー。手前（x+y が大きい）ほど後に描く。 */
export function depthOf({ x, y, w, d }: Pick<BoxGeom, 'x' | 'y' | 'w' | 'd'>): number {
  return x + w / 2 + (y + d / 2);
}

/**
 * 壁面に文字や絵を貼るための変換。ローカル座標の1pxが壁に沿って水平に進み、縦はそのまま下へ。
 * 'back-right' は y=0 の壁（画面右上）、'back-left' は x=0 の壁（画面左上）。
 */
export function wallTransform(wall: 'back-right' | 'back-left', u: number, z: number): string {
  if (wall === 'back-right') {
    const [ex, ey] = iso(u, 0, z);
    return `matrix(1 0.5 0 1 ${ex.toFixed(1)} ${ey.toFixed(1)})`;
  }
  // 左の壁は手前（y が大きい側）から奥へ読むと左から右になる
  const [ex, ey] = iso(0, u, z);
  return `matrix(1 -0.5 0 1 ${ex.toFixed(1)} ${ey.toFixed(1)})`;
}

/** 壁沿いの長さ（マス）を、wallTransform のローカル px に換算する。 */
export const wallLen = (units: number) => units * HALF_W;
/** 高さ（z）をローカル px に換算する。 */
export const heightPx = (units: number) => units * UNIT_Z;

export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => {
    const v = (n >> shift) & 0xff;
    const out = amount >= 0 ? v + (255 - v) * amount : v * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(out)));
  };
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}
