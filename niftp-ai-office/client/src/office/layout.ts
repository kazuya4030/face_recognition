// NIFTP本社の配置データ。家具の追加・入れ替えはこの配列を編集するだけで描画に反映される。
// 座標は iso.ts の床座標（1マス単位）。target を持つ家具はクリックで実際の機能（承認・資料・依頼など）へつながる。
//
// ゾーニング（入口から見て）:
//  ① 右奥の壁: ガラス扉のエントランスと、NIFTP ロゴの黒い壁（空間の主役）。前は通路として空けておく
//  ② 中央: 大型モニターが並ぶ共同デスク（CEO もチームと同じデスクで働く）
//  ③ 右奥の角: ガラス張りのプロジェクトルーム
//  ④ 右手前: ソファと低いテーブルのラウンジ
//  ⑤ 左の壁: 大きな窓（街並み）、資料棚、コーヒーカウンター

export type Target = 'ceo' | 'shelf' | 'meeting' | 'whiteboard' | 'achievements' | 'entrance';

export type FurnitureKind =
  | 'floor-patch'
  | 'rug'
  | 'doormat'
  | 'bench'
  | 'task-chair'
  | 'shelf'
  | 'coffee-counter'
  | 'plant'
  | 'tall-plant'
  | 'floor-lamp'
  | 'meeting-table'
  | 'glass-x' // x 方向に伸びるガラス壁（y 固定）
  | 'glass-y' // y 方向に伸びるガラス壁（x 固定）
  | 'sofa'
  | 'low-table'
  | 'ottoman'
  | 'high-table'
  | 'stool';

export interface FurnitureItem {
  id: string;
  kind: FurnitureKind;
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  color?: string;
  /** 椅子などの向き。'front' は手前（+y）を向く。 */
  facing?: 'front' | 'back';
  target?: Target;
}

/** 素材の色。ブランドの配色（インク・オフホワイト・グリーン・グレー）に合わせる。 */
export const MATERIAL = {
  ink: '#141512',
  metal: '#1d1e1a', // マットブラックの金属
  oak: '#d8c3a0', // 薄い木目
  oakDark: '#b99f78',
  concrete: '#cfcdc5',
  concreteDark: '#b9b7ae',
  offwhite: '#f2f0e7',
  laminate: '#eceae1',
  fabric: '#c9c5b6',
  fabricDark: '#8f938a',
  gray: '#a4a89d',
  green: '#91b36a',
  leaf: '#6f8f55',
  leafDark: '#4d6a3c',
  leafLight: '#8fae6c',
};

export const FURNITURE: FurnitureItem[] = [
  // ① エントランス：床はコンクリート、扉の内側にマット。ロゴの前は低いベンチだけにして視線を通す
  { id: 'entry-floor', kind: 'floor-patch', x: 0, y: 0, w: 10.9, d: 2.2, h: 0, color: '#d4d2ca' },
  { id: 'doormat', kind: 'doormat', x: 0.5, y: 0.15, w: 1.4, d: 1.0, h: 0, color: MATERIAL.ink, target: 'entrance' },
  { id: 'entry-bench', kind: 'bench', x: 3.6, y: 0.35, w: 3.0, d: 0.5, h: 0.42, color: MATERIAL.oak },
  { id: 'plant-logo-l', kind: 'tall-plant', x: 2.0, y: 0.3, w: 0.55, d: 0.55, h: 1.9 },
  { id: 'plant-logo-r', kind: 'plant', x: 8.75, y: 0.35, w: 0.55, d: 0.55, h: 0.9 },

  // ③ ガラス張りのプロジェクトルーム（右奥）
  { id: 'meeting-table', kind: 'meeting-table', x: 12.4, y: 1.4, w: 2.5, d: 1.4, h: 0.72, color: MATERIAL.laminate, target: 'meeting' },
  { id: 'mchair-1', kind: 'task-chair', x: 12.85, y: 0.65, w: 0.55, d: 0.55, h: 0.45, facing: 'front' },
  { id: 'mchair-2', kind: 'task-chair', x: 14.0, y: 0.65, w: 0.55, d: 0.55, h: 0.45, facing: 'front' },
  { id: 'mchair-3', kind: 'task-chair', x: 12.85, y: 3.05, w: 0.55, d: 0.55, h: 0.45, facing: 'back' },
  { id: 'mchair-4', kind: 'task-chair', x: 14.0, y: 3.05, w: 0.55, d: 0.55, h: 0.45, facing: 'back' },
  { id: 'plant-meeting', kind: 'plant', x: 15.3, y: 0.3, w: 0.5, d: 0.5, h: 0.9 },
  { id: 'glass-left', kind: 'glass-y', x: 11.0, y: 0, w: 0.05, d: 4.4, h: 2.75, target: 'meeting' },
  { id: 'glass-front', kind: 'glass-x', x: 12.2, y: 4.4, w: 3.8, d: 0.05, h: 2.75, target: 'meeting' },

  // ⑤ 左の壁：資料棚とコーヒーカウンター
  { id: 'shelf-1', kind: 'shelf', x: 0.05, y: 7.85, w: 0.62, d: 1.0, h: 2.45, color: MATERIAL.metal, target: 'shelf' },
  { id: 'shelf-2', kind: 'shelf', x: 0.05, y: 8.9, w: 0.62, d: 1.0, h: 2.45, color: MATERIAL.metal, target: 'shelf' },
  { id: 'coffee-counter', kind: 'coffee-counter', x: 0.05, y: 10.05, w: 0.85, d: 1.85, h: 0.95, color: MATERIAL.oak },
  { id: 'high-table', kind: 'high-table', x: 2.4, y: 10.35, w: 0.8, d: 0.8, h: 1.05, color: MATERIAL.oak },
  { id: 'stool-1', kind: 'stool', x: 2.05, y: 11.2, w: 0.42, d: 0.42, h: 0.75 },
  { id: 'stool-2', kind: 'stool', x: 3.25, y: 10.6, w: 0.42, d: 0.42, h: 0.75 },
  { id: 'plant-window', kind: 'tall-plant', x: 0.3, y: 6.9, w: 0.6, d: 0.6, h: 2.0 },

  // ④ ラウンジ（右手前）
  { id: 'rug-lounge', kind: 'rug', x: 11.0, y: 6.9, w: 4.6, d: 4.2, h: 0, color: '#c3c6ba' },
  { id: 'sofa', kind: 'sofa', x: 11.5, y: 7.1, w: 3.2, d: 0.95, h: 0.75, color: MATERIAL.fabric },
  { id: 'low-table', kind: 'low-table', x: 12.3, y: 8.7, w: 1.7, d: 0.85, h: 0.36, color: MATERIAL.oak },
  { id: 'ottoman-1', kind: 'ottoman', x: 11.3, y: 9.9, w: 0.75, d: 0.75, h: 0.4, color: MATERIAL.fabricDark },
  { id: 'ottoman-2', kind: 'ottoman', x: 14.3, y: 9.9, w: 0.75, d: 0.75, h: 0.4, color: '#d9d4c4' },
  { id: 'lamp-lounge', kind: 'floor-lamp', x: 15.05, y: 7.2, w: 0.4, d: 0.4, h: 2.0 },

  // 執務スペース周りの緑
  { id: 'plant-work', kind: 'tall-plant', x: 10.4, y: 4.85, w: 0.55, d: 0.55, h: 1.6 },
];

/** 共同デスク（3区画に分けて描画順を正しく保つ）。中央に大型モニターが背中合わせに並ぶ。 */
export const BENCH = { x: 4.0, y: 5.0, w: 6.0, d: 1.5, h: 0.74, segments: 3 } as const;

/** 共同デスクの席。'front' はロゴ側（奥）に座って手前を向く席、'back' は手前に座ってモニターに向かう席。 */
export interface Seat {
  x: number;
  y: number;
  facing: 'front' | 'back';
}

const segCenter = (i: number) => BENCH.x + (BENCH.w / BENCH.segments) * (i + 0.5);
const far = (i: number): Seat => ({ x: segCenter(i), y: BENCH.y - 0.65, facing: 'front' });
const near = (i: number): Seat => ({ x: segCenter(i), y: BENCH.y + BENCH.d + 0.65, facing: 'back' });

/** 社員の席（sortOrder 順に割り当て）。CEO は奥の右端の席で、チームと同じデスクにいる。 */
export const EMPLOYEE_SEATS: Seat[] = [far(0), far(1), near(0), near(1), near(2)];
export const CEO_SEAT: Seat = far(2);

/** 壁の窓・扉・掲示物。 */
export const WALL = {
  /** 左の壁（x=0）の大きな窓。 */
  windowsLeft: [
    { from: 0.6, to: 2.6 },
    { from: 2.8, to: 4.8 },
    { from: 5.0, to: 7.0 },
  ],
  door: { from: 0.5, to: 1.9 },
  brandWall: { from: 2.4, to: 8.6 },
  whiteboard: { from: 9.15, to: 10.75, z: 2.35, h: 1.25 },
  projectScreen: { from: 12.5, to: 14.8, z: 2.25, h: 1.05 },
  /** プロジェクトボード（コーヒーカウンターの上）。実際の案件を表示する。 */
  projectBoard: { from: 9.9, to: 11.9, z: 2.8, h: 1.32 },
  // 左の壁、窓と資料棚の間
  clock: { at: 7.42, z: 2.6 },
};

/** 照明・窓の光が床に落とす柔らかい明るさ。 */
export const LIGHT_POOLS = [
  { x: 7.0, y: 5.75, rx: 4.0, ry: 1.9, color: '#fff3d6', opacity: 0.32 },
  { x: 13.2, y: 9.0, rx: 2.6, ry: 1.5, color: '#fff0cf', opacity: 0.25 },
  { x: 5.5, y: 1.2, rx: 3.4, ry: 1.2, color: '#fff6e2', opacity: 0.28 },
];
