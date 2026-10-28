// NIFTP本社の配置データ。家具の追加・入れ替えはこの配列を編集するだけで描画に反映される。
// 座標は iso.ts の床座標（1マス単位）。target を持つ家具はクリックで実際の機能（承認・資料・依頼など）へつながる。

export type Target = 'ceo' | 'shelf' | 'meeting' | 'whiteboard' | 'achievements' | 'entrance';

export type FurnitureKind =
  | 'rug'
  | 'ceo-desk'
  | 'chair'
  | 'credenza'
  | 'shelf'
  | 'plant'
  | 'tall-plant'
  | 'floor-lamp'
  | 'meeting-table'
  | 'glass-x' // x 方向に伸びるガラス壁（y 固定）
  | 'glass-y' // y 方向に伸びるガラス壁（x 固定）
  | 'sofa'
  | 'pouf'
  | 'coffee-table'
  | 'coffee-cart'
  | 'doormat'
  | 'coat-rack'
  | 'cabinet'
  | 'round-table';

export interface FurnitureItem {
  id: string;
  kind: FurnitureKind;
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  color?: string;
  target?: Target;
}

export const PALETTE = {
  wood: '#c9a77c',
  woodDark: '#8a6340',
  walnut: '#6e4a2c',
  navy: '#24345a',
  navyDeep: '#1a2642',
  green: '#5f8f5a',
  greenDark: '#3f6b42',
  sage: '#8fa889',
  wall: '#f2e8d8',
  wallShade: '#e6d8c2',
  warm: '#ffd38a',
};

export const FURNITURE: FurnitureItem[] = [
  // 社長室コーナー（奥の角）
  { id: 'rug-ceo', kind: 'rug', x: 0.7, y: 0.7, w: 4.6, d: 3.9, h: 0, color: PALETTE.navy },
  { id: 'credenza', kind: 'credenza', x: 1.3, y: 0.15, w: 3.0, d: 0.55, h: 0.62, color: PALETTE.walnut },
  { id: 'ceo-chair', kind: 'chair', x: 2.62, y: 1.55, w: 0.76, d: 0.7, h: 0.5, color: PALETTE.navyDeep },
  { id: 'ceo-desk', kind: 'ceo-desk', x: 1.5, y: 2.55, w: 3.0, d: 1.05, h: 0.78, color: PALETTE.walnut, target: 'ceo' },
  { id: 'plant-ceo', kind: 'tall-plant', x: 0.25, y: 0.25, w: 0.65, d: 0.65, h: 1.9 },
  { id: 'lamp-ceo', kind: 'floor-lamp', x: 4.75, y: 0.75, w: 0.4, d: 0.4, h: 2.1 },

  // 資料棚（左の壁沿い）
  { id: 'shelf-1', kind: 'shelf', x: 0.08, y: 4.9, w: 0.72, d: 1.75, h: 2.5, color: PALETTE.woodDark, target: 'shelf' },
  { id: 'shelf-2', kind: 'shelf', x: 0.08, y: 6.75, w: 0.72, d: 1.75, h: 2.5, color: PALETTE.woodDark, target: 'shelf' },
  { id: 'plant-shelf', kind: 'plant', x: 0.2, y: 8.65, w: 0.55, d: 0.55, h: 0.9 },
  { id: 'cabinet', kind: 'cabinet', x: 2.4, y: 4.75, w: 1.2, d: 0.6, h: 0.85, color: '#d9c3a0' },

  // エントランス（左の壁の手前側）
  { id: 'doormat', kind: 'doormat', x: 0.05, y: 9.45, w: 1.2, d: 1.6, h: 0, color: PALETTE.navy, target: 'entrance' },
  { id: 'coat-rack', kind: 'coat-rack', x: 1.4, y: 11.25, w: 0.4, d: 0.4, h: 1.8 },
  { id: 'plant-entrance', kind: 'tall-plant', x: 0.2, y: 11.3, w: 0.6, d: 0.6, h: 1.6 },

  // ガラス張りの会議室（右奥）
  { id: 'meeting-table', kind: 'meeting-table', x: 12.4, y: 1.35, w: 2.6, d: 1.5, h: 0.72, color: '#d8bb92', target: 'meeting' },
  { id: 'mchair-1', kind: 'chair', x: 12.75, y: 0.6, w: 0.6, d: 0.55, h: 0.45, color: '#3b4a6b' },
  { id: 'mchair-2', kind: 'chair', x: 14.05, y: 0.6, w: 0.6, d: 0.55, h: 0.45, color: '#3b4a6b' },
  { id: 'mchair-3', kind: 'chair', x: 12.75, y: 3.05, w: 0.6, d: 0.55, h: 0.45, color: '#3b4a6b' },
  { id: 'mchair-4', kind: 'chair', x: 14.05, y: 3.05, w: 0.6, d: 0.55, h: 0.45, color: '#3b4a6b' },
  { id: 'plant-meeting', kind: 'plant', x: 15.25, y: 0.3, w: 0.55, d: 0.55, h: 0.95 },
  { id: 'glass-left', kind: 'glass-y', x: 11.0, y: 0, w: 0.06, d: 4.4, h: 2.6, target: 'meeting' },
  { id: 'glass-front', kind: 'glass-x', x: 12.2, y: 4.4, w: 3.8, d: 0.06, h: 2.6, target: 'meeting' },

  // 小さなラウンジ（右手前）
  { id: 'rug-lounge', kind: 'rug', x: 10.9, y: 6.5, w: 4.8, d: 4.6, h: 0, color: PALETTE.sage },
  { id: 'sofa', kind: 'sofa', x: 11.5, y: 6.8, w: 3.1, d: 0.95, h: 0.85, color: PALETTE.navy },
  { id: 'coffee-table', kind: 'coffee-table', x: 12.2, y: 8.45, w: 1.7, d: 0.95, h: 0.42, color: PALETTE.wood },
  { id: 'pouf-1', kind: 'pouf', x: 11.15, y: 9.75, w: 0.7, d: 0.7, h: 0.42, color: '#d48a4a' },
  { id: 'pouf-2', kind: 'pouf', x: 14.2, y: 9.75, w: 0.7, d: 0.7, h: 0.42, color: '#e0b25a' },
  { id: 'coffee-cart', kind: 'coffee-cart', x: 15.0, y: 6.9, w: 0.85, d: 0.75, h: 0.9, color: PALETTE.walnut },
  { id: 'lamp-lounge', kind: 'floor-lamp', x: 10.95, y: 6.75, w: 0.4, d: 0.4, h: 2.0 },

  // 執務スペースの緑
  { id: 'plant-work', kind: 'tall-plant', x: 10.45, y: 4.85, w: 0.6, d: 0.6, h: 1.5 },
  { id: 'plant-front', kind: 'plant', x: 5.2, y: 11.1, w: 0.6, d: 0.6, h: 0.9 },
  { id: 'stand-table', kind: 'round-table', x: 2.6, y: 10.3, w: 0.9, d: 0.9, h: 1.05, color: PALETTE.wood },
];

/** 社員の席（sortOrder 順に割り当て）。人物は机の奥側に座り、手前（画面左下）を向く。 */
export interface DeskSlot {
  desk: { x: number; y: number; w: number; d: number };
  seat: { x: number; y: number };
}

const desk = (x: number, y: number): DeskSlot => ({ desk: { x, y, w: 2.0, d: 1.0 }, seat: { x: x + 1.0, y: y - 0.62 } });

export const DESK_SLOTS: DeskSlot[] = [desk(6.1, 5.95), desk(8.4, 5.95), desk(6.1, 8.85), desk(8.4, 8.85), desk(3.4, 8.85), desk(3.4, 5.95)];

export const CEO_SEAT = { x: 3.0, y: 1.92 };

/** 壁の窓・扉・掲示物。 */
export const WALL = {
  windowsRight: [
    { from: 1.25, to: 4.25 },
    { from: 15.0, to: 15.85 },
  ],
  windowsLeft: [{ from: 1.3, to: 3.9 }],
  door: { from: 9.55, to: 10.95 },
  logo: { from: 8.8, to: 11.8, z: 2.42, h: 0.78 },
  whiteboard: { from: 5.2, to: 8.5, z: 2.4, h: 1.45 },
  achievements: { from: 8.7, to: 10.6, z: 2.3, h: 1.35 },
  tv: { from: 12.7, to: 14.7, z: 2.2, h: 1.0 },
  clock: { at: 4.75, z: 2.75 },
};

/** 床に落ちる照明・窓の光。 */
export const LIGHT_POOLS = [
  { x: 8.2, y: 6.4, rx: 3.2, ry: 1.7, color: '#ffd38a', opacity: 0.26 },
  { x: 8.2, y: 9.3, rx: 3.2, ry: 1.7, color: '#ffd38a', opacity: 0.22 },
  { x: 13.2, y: 8.9, rx: 2.6, ry: 1.5, color: '#ffc77a', opacity: 0.22 },
  { x: 3.0, y: 2.8, rx: 2.4, ry: 1.3, color: '#ffd38a', opacity: 0.2 },
];
