// 座っているAI社員とCEOのSVGスプライト。原点は椅子の座面中央、上方向がマイナス。
// facing='front' は手前を向く（顔が見える）、'back' は画面に向かう後ろ姿。
// まばたき・呼吸は装飾として常時表示してよいが、作業中の演出（画面の光・肩の動き）は working のときだけ。
import { useId } from 'react';
import { shade } from './iso.ts';
import type { Appearance } from './appearance.ts';

type Props = {
  look: Appearance;
  facing?: 'front' | 'back';
  working?: boolean;
  /** まばたきの開始をずらして、全員が同時にまばたきしないようにする。 */
  blinkDelay?: number;
};

const TORSO = 'M -12.5 0 L -13 -17 Q -12.5 -27.5 0 -28 Q 12.5 -27.5 13 -17 L 12.5 0 Z';

function BackHair({ look }: { look: Appearance }) {
  if (look.hairStyle === 'long') return <path d="M -10.5 -40 L -12 -17 Q 0 -13 12 -17 L 10.5 -40 Z" fill={look.hairColor} />;
  if (look.hairStyle === 'bun') return <circle cx={0} cy={-49} r={5} fill={look.hairColor} />;
  return null;
}

function FrontHair({ look }: { look: Appearance }) {
  const c = look.hairColor;
  switch (look.hairStyle) {
    case 'short':
      return <path d="M -9.6 -37 Q -10 -48.5 0 -49 Q 10 -48.5 9.6 -37 Q 7 -43 0 -42.6 Q -7 -43 -9.6 -37 Z" fill={c} />;
    case 'side':
      return <path d="M -9.6 -35.5 Q -11 -49 1 -49 Q 11 -48 9.8 -37 Q 8 -42 -1.5 -43.5 Q -6 -40.5 -9.6 -35.5 Z" fill={c} />;
    case 'bob':
      return <path d="M -10.6 -38 Q -11.5 -50 0 -50 Q 11.5 -50 10.6 -38 L 10.8 -31 Q 9 -30 8 -33 L 8 -40 Q 0 -44.5 -8 -40 L -8 -33 Q -9 -30 -10.8 -31 Z" fill={c} />;
    case 'long':
      return <path d="M -10 -37 Q -11 -49.5 0 -49.5 Q 11 -49.5 10 -37 Q 4 -43.5 -3 -42.5 Q -7.5 -40.5 -10 -37 Z" fill={c} />;
    case 'bun':
      return <path d="M -9.6 -37 Q -10 -48 0 -48 Q 10 -48 9.6 -37 Q 6 -42.5 0 -42.2 Q -6 -42.5 -9.6 -37 Z" fill={c} />;
    case 'curly':
      return (
        <g fill={c}>
          {[[-8.6, -41], [-5.2, -45.5], [0, -47], [5.2, -45.5], [8.6, -41], [-2.5, -43], [3, -43]].map(([x, y]) => (
            <circle key={`${x}${y}`} cx={x} cy={y} r={4.4} />
          ))}
        </g>
      );
  }
}

/** 後ろ姿の髪（頭全体を覆う）。 */
function HairFromBack({ look }: { look: Appearance }) {
  const c = look.hairColor;
  switch (look.hairStyle) {
    case 'bob':
      return <path d="M -10.8 -38 Q -11.5 -50 0 -50 Q 11.5 -50 10.8 -38 L 11 -30.5 Q 0 -28.5 -11 -30.5 Z" fill={c} />;
    case 'long':
      return <path d="M -10.5 -38 Q -11.5 -50 0 -50 Q 11.5 -50 10.5 -38 L 11.5 -17 Q 0 -13 -11.5 -17 Z" fill={c} />;
    case 'curly':
      return (
        <g fill={c}>
          {[[-8.6, -41], [-5.2, -45.5], [0, -47], [5.2, -45.5], [8.6, -41], [-7, -35.5], [0, -36], [7, -35.5], [-3.5, -40], [3.5, -40]].map(([x, y]) => (
            <circle key={`${x}${y}`} cx={x} cy={y} r={4.6} />
          ))}
        </g>
      );
    case 'bun':
      return (
        <g fill={c}>
          <path d="M -9.8 -37 Q -10.2 -48.5 0 -48.5 Q 10.2 -48.5 9.8 -37 Q 9 -32 0 -31.5 Q -9 -32 -9.8 -37 Z" />
          <circle cx={0} cy={-49} r={5} />
        </g>
      );
    default:
      return <path d="M -9.8 -37 Q -10.2 -49 0 -49.2 Q 10.2 -49 9.8 -37 Q 9 -31.5 0 -31 Q -9 -31.5 -9.8 -37 Z" fill={c} />;
  }
}

function OutfitFront({ look }: { look: Appearance }) {
  const c = look.outfitColor;
  const dark = shade(c, -0.3);
  switch (look.outfit) {
    case 'tee':
      return <path d="M -5.5 -27.6 Q 0 -23.5 5.5 -27.6" fill="none" stroke={shade(c, -0.2)} strokeWidth={1.4} />;
    case 'shirt':
      return (
        <g>
          <path d="M -6 -27.6 L -1.5 -22 L 0 -24.5 L 1.5 -22 L 6 -27.6 Z" fill={shade(c, 0.35)} />
          <path d="M 0 -24 L 0 0" stroke={dark} strokeWidth={0.7} opacity={0.6} />
          {[-18, -12, -6].map((y) => (
            <circle key={y} cx={0.9} cy={y} r={0.65} fill={dark} />
          ))}
        </g>
      );
    case 'hoodie':
      return (
        <g>
          <path d="M -9 -27 Q 0 -20.5 9 -27 Q 7 -30 0 -30 Q -7 -30 -9 -27 Z" fill={dark} />
          <path d="M -2.4 -23 L -2.4 -15.5 M 2.4 -23 L 2.4 -15.5" stroke={look.inner} strokeWidth={0.9} strokeLinecap="round" />
          <path d="M -7 -8 L 7 -8 L 6 -2 L -6 -2 Z" fill={shade(c, -0.12)} />
        </g>
      );
    case 'knit':
      return (
        <g>
          <path d="M -6 -27.8 Q 0 -23 6 -27.8" fill="none" stroke={shade(c, -0.18)} strokeWidth={2.2} />
          {[-11, -7, -3, 1, 5, 9].map((x) => (
            <path key={x} d={`M ${x} -1.5 L ${x} -4.5`} stroke={shade(c, -0.15)} strokeWidth={0.8} />
          ))}
        </g>
      );
    case 'overshirt':
      return (
        <g>
          <path d="M -5 -28 L 5 -28 L 4 0 L -4 0 Z" fill={look.inner} />
          <path d="M -5 -28 Q 0 -24.5 5 -28" fill="none" stroke={shade(look.inner, -0.15)} strokeWidth={1} />
          <path d="M -6.5 -27.8 L -4 -20 M 6.5 -27.8 L 4 -20" stroke={shade(c, 0.25)} strokeWidth={1.1} />
          <rect x={-10} y={-17} width={4.5} height={3.2} rx={0.6} fill={shade(c, 0.12)} />
        </g>
      );
  }
}

function OutfitBack({ look }: { look: Appearance }) {
  const c = look.outfitColor;
  switch (look.outfit) {
    case 'hoodie':
      return <path d="M -8 -28 Q 0 -31 8 -28 L 6 -18 Q 0 -15.5 -6 -18 Z" fill={shade(c, -0.18)} />;
    case 'shirt':
    case 'overshirt':
      return <path d="M -6 -27.5 Q 0 -25.5 6 -27.5 M 0 -25 L 0 -2" fill="none" stroke={shade(c, -0.22)} strokeWidth={0.9} />;
    case 'knit':
      return <path d="M -12 -3 L 12 -3" stroke={shade(c, -0.15)} strokeWidth={2.2} />;
    default:
      return <path d="M -5 -27.5 Q 0 -26 5 -27.5" fill="none" stroke={shade(c, -0.2)} strokeWidth={1.2} />;
  }
}

function Accessory({ look, facing }: { look: Appearance; facing: 'front' | 'back' }) {
  switch (look.accessory) {
    case 'glasses':
      return facing === 'front' ? (
        <g fill="none" stroke="#1f201c" strokeWidth={0.9}>
          <rect x={-6.4} y={-40} width={5.4} height={4.2} rx={1.6} />
          <rect x={1} y={-40} width={5.4} height={4.2} rx={1.6} />
          <path d="M -1 -38.4 L 1 -38.4" />
        </g>
      ) : (
        <path d="M -10 -38.5 L -7 -38.5 M 10 -38.5 L 7 -38.5" stroke="#1f201c" strokeWidth={0.9} />
      );
    case 'headphones':
      return (
        <g>
          <path d="M -10.5 -38 Q -11.5 -53.5 0 -53.5 Q 11.5 -53.5 10.5 -38" fill="none" stroke="#1d1e1a" strokeWidth={2.3} />
          <rect x={-13.4} y={-42} width={4.4} height={8} rx={2} fill="#2b2d27" />
          <rect x={9} y={-42} width={4.4} height={8} rx={2} fill="#2b2d27" />
        </g>
      );
    case 'earring':
      return <circle cx={facing === 'front' ? -9.4 : 9.4} cy={-33.6} r={1.2} fill="#c9b27a" />;
    case 'watch':
      return <rect x={10.6} y={-7} width={5.5} height={2.4} rx={0.8} fill="#1d1e1a" />;
    default:
      return null;
  }
}

/** 着席した人物。 */
export function Character({ look, facing = 'front', working = false, blinkDelay = 0 }: Props) {
  const sleeve = shade(look.outfitColor, -0.1);
  return (
    <g className={`character ${working ? 'is-working' : ''}`}>
      <g className="char-body">
        {facing === 'front' && <BackHair look={look} />}
        <path d={TORSO} fill={look.outfitColor} />
        {facing === 'front' ? <OutfitFront look={look} /> : <OutfitBack look={look} />}
        <rect x={-15} y={-23} width={4.8} height={19} rx={2.4} fill={sleeve} />
        <rect x={10.2} y={-23} width={4.8} height={19} rx={2.4} fill={sleeve} />
        <rect x={-15} y={-6} width={4.8} height={3.2} rx={1.5} fill={look.skin} />
        <rect x={10.2} y={-6} width={4.8} height={3.2} rx={1.5} fill={look.skin} />
        <rect x={-2.9} y={-31} width={5.8} height={4} fill={shade(look.skin, -0.08)} />
        <circle cx={-9.3} cy={-37} r={1.9} fill={shade(look.skin, -0.05)} />
        <circle cx={9.3} cy={-37} r={1.9} fill={shade(look.skin, -0.05)} />
        <circle cx={0} cy={-38} r={9.3} fill={look.skin} />
        {facing === 'front' ? (
          <>
            <g className="eyes" style={{ animationDelay: `${blinkDelay}s` }}>
              <ellipse cx={-3.5} cy={-38} rx={1.05} ry={1.5} fill="#1f1d1a" />
              <ellipse cx={3.5} cy={-38} rx={1.05} ry={1.5} fill="#1f1d1a" />
            </g>
            <path d="M -1.8 -33.4 Q 0 -32.2 1.8 -33.4" fill="none" stroke="#6e4537" strokeWidth={0.85} strokeLinecap="round" />
            <circle cx={-6} cy={-34.8} r={1.5} fill="#e39b84" opacity={0.28} />
            <circle cx={6} cy={-34.8} r={1.5} fill="#e39b84" opacity={0.28} />
            <FrontHair look={look} />
          </>
        ) : (
          <HairFromBack look={look} />
        )}
        <Accessory look={look} facing={facing} />
        {working && facing === 'front' && <ellipse className="screen-light" cx={0} cy={-34} rx={10} ry={8} fill="#cfe6f2" opacity={0.2} />}
      </g>
    </g>
  );
}

/** 詳細パネル用の顔アイコン。 */
export function Portrait({ look, size = 72 }: { look: Appearance; size?: number }) {
  const clipId = `portrait-${useId().replace(/:/g, '')}`;
  return (
    <svg className="portrait" viewBox="-22 -60 44 44" width={size} height={size} aria-hidden>
      <circle cx={0} cy={-38} r={21} fill="#e4e2d8" />
      <clipPath id={clipId}>
        <circle cx={0} cy={-38} r={21} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <Character look={look} />
      </g>
    </svg>
  );
}
