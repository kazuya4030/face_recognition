// AI社員の見た目。社員ごとに髪型・服装・小物・デスク周りを変えて見分けられるようにする。
// 将来、見た目の変更機能を追加するときは、この定義をサーバー保存に置き換えればよい（描画側は Appearance だけを見る）。
// 服の色は設定画面の「色」を使うため、色を変えると見た目にも反映される。

export type HairStyle = 'short' | 'bob' | 'long' | 'bun' | 'curly' | 'side';
export type Outfit = 'hoodie' | 'shirt-tie' | 'cardigan' | 'jacket';
export type Accessory = 'glasses' | 'headphones' | 'earring' | 'scarf' | 'none';
export type DeskProp = 'mug' | 'plant' | 'books' | 'notes' | 'second-monitor' | 'magnifier' | 'figure' | 'lamp';

export interface Appearance {
  skin: string;
  hairStyle: HairStyle;
  hairColor: string;
  outfit: Outfit;
  /** 服の差し色（シャツ・ネクタイ・インナーなど）。 */
  accent: string;
  accessory: Accessory;
  deskProps: DeskProp[];
  /** デスクの天板の色。 */
  deskTop: string;
}

const PRESETS: Record<string, Omit<Appearance, never>> = {
  manager: {
    skin: '#f1cfae',
    hairStyle: 'side',
    hairColor: '#2c2420',
    outfit: 'shirt-tie',
    accent: '#e9eef5',
    accessory: 'glasses',
    deskProps: ['notes', 'mug', 'lamp'],
    deskTop: '#c9a77c',
  },
  researcher: {
    skin: '#f4d6bb',
    hairStyle: 'bob',
    hairColor: '#6b3f26',
    outfit: 'cardigan',
    accent: '#f5efe2',
    accessory: 'earring',
    deskProps: ['books', 'magnifier', 'plant'],
    deskTop: '#d1b089',
  },
  builder: {
    skin: '#e3b48f',
    hairStyle: 'curly',
    hairColor: '#1f1b1a',
    outfit: 'hoodie',
    accent: '#2b3a55',
    accessory: 'headphones',
    deskProps: ['second-monitor', 'figure', 'mug'],
    deskTop: '#bf9a6c',
  },
  qa: {
    skin: '#f6dcc5',
    hairStyle: 'bun',
    hairColor: '#8a5a3c',
    outfit: 'jacket',
    accent: '#fbf6ee',
    accessory: 'scarf',
    deskProps: ['notes', 'plant', 'mug'],
    deskTop: '#cbac84',
  },
};

const HAIR: HairStyle[] = ['short', 'bob', 'long', 'bun', 'curly', 'side'];
const OUTFITS: Outfit[] = ['hoodie', 'shirt-tie', 'cardigan', 'jacket'];
const ACCESSORIES: Accessory[] = ['glasses', 'headphones', 'earring', 'scarf', 'none'];
const HAIR_COLORS = ['#2c2420', '#6b3f26', '#1f1b1a', '#8a5a3c', '#4a3a2c'];
const SKINS = ['#f1cfae', '#f4d6bb', '#e3b48f', '#f6dcc5', '#d9a77c'];
const PROPS: DeskProp[][] = [['mug', 'plant'], ['books', 'notes'], ['second-monitor', 'mug'], ['lamp', 'books']];

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** 社員IDから見た目を決める。既定の4名以外は ID から決定的に組み合わせる。 */
export function appearanceOf(employeeId: string): Appearance {
  const preset = PRESETS[employeeId];
  if (preset) return preset;
  const h = hash(employeeId);
  return {
    skin: SKINS[h % SKINS.length],
    hairStyle: HAIR[h % HAIR.length],
    hairColor: HAIR_COLORS[(h >> 3) % HAIR_COLORS.length],
    outfit: OUTFITS[(h >> 5) % OUTFITS.length],
    accent: '#f5efe2',
    accessory: ACCESSORIES[(h >> 7) % ACCESSORIES.length],
    deskProps: PROPS[(h >> 9) % PROPS.length],
    deskTop: '#c9a77c',
  };
}

export const CEO_APPEARANCE: Appearance = {
  skin: '#efcaa6',
  hairStyle: 'short',
  hairColor: '#1d1a19',
  outfit: 'jacket',
  accent: '#ffffff',
  accessory: 'none',
  deskProps: ['mug'],
  deskTop: '#7a5532',
};
