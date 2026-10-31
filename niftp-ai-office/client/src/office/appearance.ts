// AI社員とCEOの見た目。服装はスマートカジュアルで、色は会社の配色（インク・オフホワイト・グレー・オート）になじませ、
// 髪型・服の形・小物で見分けられるようにする。設定画面の「色」は机のマグカップなどの小さな差し色にだけ使う。
// 将来、見た目の変更機能を追加するときは、この定義をサーバー保存に置き換えればよい（描画側は Appearance だけを見る）。

export type HairStyle = 'short' | 'bob' | 'long' | 'bun' | 'curly' | 'side';
export type Outfit = 'tee' | 'shirt' | 'hoodie' | 'knit' | 'overshirt';
export type Accessory = 'glasses' | 'headphones' | 'earring' | 'watch' | 'none';
export type DeskProp = 'mug' | 'plant' | 'books' | 'notes' | 'tablet' | 'headphones' | 'bottle' | 'lamp' | 'notebook';

export interface Appearance {
  skin: string;
  hairStyle: HairStyle;
  hairColor: string;
  outfit: Outfit;
  /** 服の色（会社の配色になじむ落ち着いた色）。 */
  outfitColor: string;
  /** インナー・襟・ひもなどの色。 */
  inner: string;
  accessory: Accessory;
  /** 共同デスクの自分の場所に置いている物。 */
  deskProps: DeskProp[];
}

const PRESETS: Record<string, Appearance> = {
  manager: {
    skin: '#efcfb0',
    hairStyle: 'side',
    hairColor: '#24211d',
    outfit: 'shirt',
    outfitColor: '#c9d0cf',
    inner: '#f2f0e7',
    accessory: 'glasses',
    // 進行管理：付箋・デスクライト・マグ
    deskProps: ['notes', 'lamp', 'mug'],
  },
  researcher: {
    skin: '#f3d6bc',
    hairStyle: 'bob',
    hairColor: '#5e3c27',
    outfit: 'knit',
    outfitColor: '#d8cfb8',
    inner: '#f2f0e7',
    accessory: 'earring',
    // 調査：資料の本・植物・ブランドグリーンのノート
    deskProps: ['books', 'plant', 'notebook'],
  },
  builder: {
    skin: '#ddb08b',
    hairStyle: 'curly',
    hairColor: '#1c1a18',
    outfit: 'hoodie',
    outfitColor: '#3a3d36',
    inner: '#a4a89d',
    accessory: 'headphones',
    // 制作：タブレット・水筒・デスクライト
    deskProps: ['tablet', 'bottle', 'lamp'],
  },
  qa: {
    skin: '#f5dcc6',
    hairStyle: 'bun',
    hairColor: '#7b4f33',
    outfit: 'tee',
    outfitColor: '#8e9585',
    inner: '#f2f0e7',
    accessory: 'watch',
    // 品質確認：チェックリスト・ノート・マグ
    deskProps: ['notes', 'notebook', 'mug'],
  },
  scientist: {
    skin: '#e6c09c',
    hairStyle: 'long',
    hairColor: '#3d332b',
    // 白衣を思わせる明るいオーバーシャツ
    outfit: 'overshirt',
    outfitColor: '#e9e6da',
    inner: '#5b5f56',
    accessory: 'glasses',
    // 研究：論文の本・ノート・デスクライト
    deskProps: ['books', 'notebook', 'lamp'],
  },
};

const HAIR: HairStyle[] = ['short', 'bob', 'long', 'bun', 'curly', 'side'];
const OUTFITS: Outfit[] = ['tee', 'shirt', 'hoodie', 'knit', 'overshirt'];
const OUTFIT_COLORS = ['#3a3d36', '#d8cfb8', '#8e9585', '#c9d0cf', '#5b5f56', '#e9e6da'];
const ACCESSORIES: Accessory[] = ['glasses', 'headphones', 'earring', 'watch', 'none'];
const HAIR_COLORS = ['#24211d', '#5e3c27', '#1c1a18', '#7b4f33', '#3d332b'];
const SKINS = ['#efcfb0', '#f3d6bc', '#ddb08b', '#f5dcc6', '#d5a37e'];
const PROPS: DeskProp[][] = [['mug', 'plant'], ['books', 'notes'], ['tablet', 'mug'], ['bottle', 'books']];

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** 社員IDから見た目を決める。既定の5名以外は ID から決定的に組み合わせる。 */
export function appearanceOf(employeeId: string): Appearance {
  const preset = PRESETS[employeeId];
  if (preset) return preset;
  const h = hash(employeeId);
  return {
    skin: SKINS[h % SKINS.length],
    hairStyle: HAIR[h % HAIR.length],
    hairColor: HAIR_COLORS[(h >> 3) % HAIR_COLORS.length],
    outfit: OUTFITS[(h >> 5) % OUTFITS.length],
    outfitColor: OUTFIT_COLORS[(h >> 6) % OUTFIT_COLORS.length],
    inner: '#f2f0e7',
    accessory: ACCESSORIES[(h >> 7) % ACCESSORIES.length],
    deskProps: PROPS[(h >> 9) % PROPS.length],
  };
}

/** CEO もスーツではなく、チームと同じスマートカジュアル。 */
export const CEO_APPEARANCE: Appearance = {
  skin: '#ebc7a3',
  hairStyle: 'short',
  hairColor: '#1b1a18',
  outfit: 'overshirt',
  outfitColor: '#26281f',
  inner: '#f2f0e7',
  accessory: 'none',
  deskProps: ['mug', 'notebook', 'lamp'],
};
