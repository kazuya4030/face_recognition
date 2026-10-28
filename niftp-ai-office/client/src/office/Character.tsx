// 座っているAI社員（とCEO）のSVGスプライト。原点は椅子の座面中央、上方向がマイナス。
// まばたき・呼吸は装飾として常時表示してよいが、作業中の演出（画面の光・肩の動き）は status が working のときだけ。
import { useId } from 'react';
import { shade } from './iso.ts';
import type { Appearance } from './appearance.ts';

type Props = {
  look: Appearance;
  outfitColor: string;
  working?: boolean;
  /** まばたきの開始をずらして、全員が同時にまばたきしないようにする。 */
  blinkDelay?: number;
};

function BackHair({ look }: { look: Appearance }) {
  if (look.hairStyle === 'long') {
    return <path d="M -11 -40 L -12.5 -16 Q 0 -12 12.5 -16 L 11 -40 Z" fill={look.hairColor} />;
  }
  if (look.hairStyle === 'bun') return <circle cx={0} cy={-49.5} r={5.2} fill={look.hairColor} />;
  return null;
}

function FrontHair({ look }: { look: Appearance }) {
  const c = look.hairColor;
  switch (look.hairStyle) {
    case 'short':
      return <path d="M -10 -37 Q -10.5 -49 0 -49.5 Q 10.5 -49 10 -37 Q 7 -43.5 0 -43 Q -7 -43.5 -10 -37 Z" fill={c} />;
    case 'side':
      return <path d="M -10 -35.5 Q -11.5 -49.5 1 -49.5 Q 11.5 -48.5 10.2 -37 Q 8.5 -42.5 -1.5 -44 Q -6 -40.5 -10 -35.5 Z" fill={c} />;
    case 'bob':
      return <path d="M -11 -38 Q -12 -50.5 0 -50.5 Q 12 -50.5 11 -38 L 11.2 -30.5 Q 9.2 -29.5 8.3 -32.5 L 8.3 -40 Q 0 -45 -8.3 -40 L -8.3 -32.5 Q -9.2 -29.5 -11.2 -30.5 Z" fill={c} />;
    case 'long':
      return <path d="M -10.5 -37 Q -11.5 -50 0 -50 Q 11.5 -50 10.5 -37 Q 4 -44 -3 -43 Q -8 -41 -10.5 -37 Z" fill={c} />;
    case 'bun':
      return <path d="M -10 -37 Q -10.5 -48.5 0 -48.5 Q 10.5 -48.5 10 -37 Q 6 -43 0 -42.5 Q -6 -43 -10 -37 Z" fill={c} />;
    case 'curly':
      return (
        <g fill={c}>
          {[[-9, -41], [-5.5, -46], [0, -47.5], [5.5, -46], [9, -41], [-2.5, -43.5], [3, -43.5]].map(([x, y]) => (
            <circle key={`${x}${y}`} cx={x} cy={y} r={4.6} />
          ))}
        </g>
      );
  }
}

function OutfitDetail({ look, color }: { look: Appearance; color: string }) {
  const dark = shade(color, -0.35);
  switch (look.outfit) {
    case 'hoodie':
      return (
        <g>
          <path d="M -9 -27 Q 0 -21 9 -27 Q 7 -30 0 -30 Q -7 -30 -9 -27 Z" fill={dark} />
          <path d="M -2.5 -23 L -2.5 -15 M 2.5 -23 L 2.5 -15" stroke={look.accent} strokeWidth={1} strokeLinecap="round" />
          <path d="M -8 -6 L 8 -6" stroke={dark} strokeWidth={1.2} opacity={0.6} />
        </g>
      );
    case 'shirt-tie':
      return (
        <g>
          <path d="M -6.5 -27.5 L 0 -21 L 6.5 -27.5 Z" fill={look.accent} />
          <path d="M -1.6 -22.5 L 1.6 -22.5 L 2.4 -9 L 0 -6.5 L -2.4 -9 Z" fill={dark} />
        </g>
      );
    case 'cardigan':
      return (
        <g>
          <path d="M -4.5 -27.5 L 4.5 -27.5 L 3 0 L -3 0 Z" fill={look.accent} />
          {[-20, -13, -6].map((y) => (
            <circle key={y} cx={-4.2} cy={y} r={0.9} fill={dark} />
          ))}
        </g>
      );
    case 'jacket':
      return (
        <g>
          <path d="M -7 -27.5 L 0 -13 L 7 -27.5 Z" fill={look.accent} />
          <path d="M -7 -27.5 L -2.5 -15 L -5 -10 M 7 -27.5 L 2.5 -15 L 5 -10" stroke={dark} strokeWidth={1.1} fill="none" />
        </g>
      );
  }
}

function Accessory({ look }: { look: Appearance }) {
  switch (look.accessory) {
    case 'glasses':
      return (
        <g fill="none" stroke="#2b2b2b" strokeWidth={0.9}>
          <circle cx={-3.6} cy={-38} r={2.8} />
          <circle cx={3.6} cy={-38} r={2.8} />
          <path d="M -0.8 -38.2 L 0.8 -38.2" />
        </g>
      );
    case 'headphones':
      return (
        <g>
          <path d="M -11 -38 Q -12 -54 0 -54 Q 12 -54 11 -38" fill="none" stroke="#2a2f3a" strokeWidth={2.4} />
          <rect x={-14} y={-42} width={4.5} height={8} rx={2} fill="#e0603a" />
          <rect x={9.5} y={-42} width={4.5} height={8} rx={2} fill="#e0603a" />
        </g>
      );
    case 'earring':
      return <circle cx={-9.6} cy={-33.5} r={1.3} fill="#e2b33c" />;
    case 'scarf':
      return <path d="M -8.5 -30 Q 0 -26 8.5 -30 L 8.5 -26.5 Q 0 -22.5 -8.5 -26.5 Z M 3 -26 L 5.5 -17 L 1.5 -17.5 Z" fill="#c2553b" />;
    default:
      return null;
  }
}

/** 着席した人物。working のときだけ画面の光が顔に当たり、肩が小さく動く。 */
export function Character({ look, outfitColor, working = false, blinkDelay = 0 }: Props) {
  return (
    <g className={`character ${working ? 'is-working' : ''}`}>
      <g className="char-body">
        <BackHair look={look} />
        <path d="M -13 0 L -13.5 -18 Q -13 -28 0 -28.5 Q 13 -28 13.5 -18 L 13 0 Z" fill={outfitColor} />
        <OutfitDetail look={look} color={outfitColor} />
        <rect x={-15.5} y={-23} width={5} height={19} rx={2.5} fill={shade(outfitColor, -0.12)} />
        <rect x={10.5} y={-23} width={5} height={19} rx={2.5} fill={shade(outfitColor, -0.12)} />
        <rect x={-3} y={-31} width={6} height={4} fill={shade(look.skin, -0.08)} />
        <circle cx={-9.6} cy={-37} r={2} fill={shade(look.skin, -0.05)} />
        <circle cx={9.6} cy={-37} r={2} fill={shade(look.skin, -0.05)} />
        <circle cx={0} cy={-38} r={9.6} fill={look.skin} />
        <g className="eyes" style={{ animationDelay: `${blinkDelay}s` }}>
          <ellipse cx={-3.6} cy={-38} rx={1.15} ry={1.6} fill="#2a2522" />
          <ellipse cx={3.6} cy={-38} rx={1.15} ry={1.6} fill="#2a2522" />
        </g>
        <circle cx={-6.2} cy={-34.6} r={1.6} fill="#e8907a" opacity={0.35} />
        <circle cx={6.2} cy={-34.6} r={1.6} fill="#e8907a" opacity={0.35} />
        <path d="M -2 -33.4 Q 0 -32 2 -33.4" fill="none" stroke="#7a4a3a" strokeWidth={0.9} strokeLinecap="round" />
        <FrontHair look={look} />
        <Accessory look={look} />
        {working && <ellipse className="screen-light" cx={0} cy={-34} rx={10} ry={8} fill="#9fd4ff" opacity={0.22} />}
      </g>
    </g>
  );
}

/** 詳細パネル用の顔アイコン。 */
export function Portrait({ look, outfitColor, size = 72 }: { look: Appearance; outfitColor: string; size?: number }) {
  const clipId = `portrait-${useId().replace(/:/g, '')}`;
  return (
    <svg className="portrait" viewBox="-22 -60 44 44" width={size} height={size} aria-hidden>
      <circle cx={0} cy={-38} r={21} fill="#f3e6cf" />
      <clipPath id={clipId}>
        <circle cx={0} cy={-38} r={21} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <Character look={look} outfitColor={outfitColor} />
      </g>
    </svg>
  );
}
