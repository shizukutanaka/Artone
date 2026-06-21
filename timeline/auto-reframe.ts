/**
 * Artone v3 — Auto Reframe (アスペクト比リターゲット)
 *
 * 被写体(顔/サリエンシ)の per-frame フォーカス点列から、目標アスペクト比の
 * クロップ矩形列を生成する純関数。横長→縦長(9:16) 等の自動リフレーム用。
 * 競合 (CapCut/Premiere の auto-reframe) パリティ。`ai/` の detectFaces 等の
 * 出力をフォーカス点として渡す想定 (検出は呼び出し側)。
 *
 * 設計: EMA + 速度制限による滑らかな追従 (ジッター抑制) と source 境界へのクランプ。
 * @version 1.0.0
 */

/** 1フレームの注目点 (ピクセル座標)。weight は複数被写体の重み付け平均用。 */
export interface FocusPoint {
  x: number;
  y: number;
  weight?: number;
}

/** クロップ矩形 (ピクセル, source 座標系)。 */
export interface CropWindow {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** オートリフレームのオプション。 */
export interface ReframeOptions {
  sourceWidth: number;
  sourceHeight: number;
  /** 目標アスペクト比 (width / height)。例: 9:16 = 9/16。 */
  targetAspect: number;
  /** 追従の平滑化係数 (0=固定, 1=即追従)。既定 0.15。 */
  smoothing?: number;
  /** 1フレームあたりのクロップ中心移動上限 (ピクセル)。既定 sourceWidth*0.04。 */
  maxSpeed?: number;
}

/** 複数フォーカス点を重み付き平均して1点に集約する。空なら null。 */
export function aggregateFocus(points: FocusPoint[]): FocusPoint | null {
  if (points.length === 0) return null;
  let sx = 0;
  let sy = 0;
  let sw = 0;
  for (const p of points) {
    const w = p.weight ?? 1;
    sx += p.x * w;
    sy += p.y * w;
    sw += w;
  }
  if (sw <= 0) return null;
  return { x: sx / sw, y: sy / sw };
}

/** 目標アスペクトに収まる最大クロップ寸法を source 内で算出する。 */
export function fitCropSize(sourceWidth: number, sourceHeight: number, targetAspect: number): {
  width: number;
  height: number;
} {
  // source に収まる最大の targetAspect 矩形。
  let width = sourceHeight * targetAspect;
  let height = sourceHeight;
  if (width > sourceWidth) {
    width = sourceWidth;
    height = sourceWidth / targetAspect;
  }
  return { width, height };
}

/** 中心 (cx,cy) とクロップ寸法から、source 境界にクランプした矩形を返す。 */
function clampedWindow(
  cx: number,
  cy: number,
  size: { width: number; height: number },
  sourceWidth: number,
  sourceHeight: number
): CropWindow {
  const half = { w: size.width / 2, h: size.height / 2 };
  const x = Math.max(0, Math.min(sourceWidth - size.width, cx - half.w));
  const y = Math.max(0, Math.min(sourceHeight - size.height, cy - half.h));
  return { x, y, width: size.width, height: size.height };
}

/**
 * フォーカス点列からクロップ矩形列を生成する (フレーム数 = focusPerFrame.length)。
 * 各フレームのフォーカス点が空の場合は直前のクロップ中心を維持する。
 *
 * @param focusPerFrame - 各フレームの注目点配列 (ピクセル座標)
 * @param options - source 寸法・目標アスペクト・平滑化
 */
export function computeReframe(
  focusPerFrame: FocusPoint[][],
  options: ReframeOptions
): CropWindow[] {
  const { sourceWidth, sourceHeight, targetAspect } = options;
  const smoothing = Math.max(0, Math.min(1, options.smoothing ?? 0.15));
  const maxSpeed = options.maxSpeed ?? sourceWidth * 0.04;

  const size = fitCropSize(sourceWidth, sourceHeight, targetAspect);
  const centerX = sourceWidth / 2;
  const centerY = sourceHeight / 2;

  const out: CropWindow[] = [];
  // 初期中心: 最初の有効フォーカス、無ければ画面中央。
  let cx = centerX;
  let cy = centerY;
  let initialized = false;

  for (const points of focusPerFrame) {
    const focus = aggregateFocus(points);
    const targetX = focus ? focus.x : cx;
    const targetY = focus ? focus.y : cy;

    if (!initialized) {
      cx = focus ? focus.x : centerX;
      cy = focus ? focus.y : centerY;
      initialized = true;
    } else {
      // EMA で目標へ寄せる。
      let nx = cx + (targetX - cx) * smoothing;
      let ny = cy + (targetY - cy) * smoothing;
      // 速度制限 (ジッター/急移動抑制)。
      const dx = nx - cx;
      const dy = ny - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > maxSpeed && dist > 0) {
        nx = cx + (dx / dist) * maxSpeed;
        ny = cy + (dy / dist) * maxSpeed;
      }
      cx = nx;
      cy = ny;
    }

    out.push(clampedWindow(cx, cy, size, sourceWidth, sourceHeight));
  }

  return out;
}
