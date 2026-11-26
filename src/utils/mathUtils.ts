import type {
  GeoElement,
  CircleElement,
  PointElement,
  PolygonElement,
  StrokeStyle,
} from '../types/geometry';
import { computeVisibleLine, lineExtentPoints } from './lineLabels';

export interface EdgeTarget {
  elementId: string;
  type: 'segment' | 'polygon_edge' | 'line';
  edgeIndex?: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  p1Id?: string;
  p2Id?: string;
  label?: string;
}

export interface EdgeAngleResult {
  v: { x: number; y: number; id?: string };
  p1: { x: number; y: number; id?: string };
  p2: { x: number; y: number; id?: string };
  label?: string;
}

export const getDashArray = (style: StrokeStyle, strokeWidth: number): number[] => {
  switch (style) {
    case 'dashed':
      return [strokeWidth * 3, strokeWidth * 2];
    case 'dotted':
      return [strokeWidth, strokeWidth * 2];
    case 'solid':
    default:
      return [];
  }
};

export const snapCoordinate = (val: number, gridSize: number = 20): number => {
  return Math.round(val / gridSize) * gridSize;
};

export const distance = (x1: number, y1: number, x2: number, y2: number): number => {
  return Math.hypot(x2 - x1, y2 - y1);
};

export interface AngleDetails {
  isRightAngle: boolean;
  degrees: number;
  strokePoints: number[];
  fillPoints: number[];
  labelPos: { x: number; y: number };
  k1: { x: number; y: number };
  k2: { x: number; y: number };
  extraStrokeLines?: number[][];
}

/**
 * Computes angle geometry:
 * - If angle is ~90 degrees (|deg - 90| <= 1.5): returns standard square corner symbol.
 * - Otherwise: returns an arc connecting the two arms exactly at distance `size`.
 * - k1 lies exactly on arm 1, k2 lies exactly on arm 2.
 * - fillPoints provides a closed circular wedge tightly hugging both edges and vertex.
 * - Supports arcType: 'single', 'double', 'triple', 'tick', 'double_tick'.
 */
export const computeAngleDetails = (
  vx: number,
  vy: number,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  size: number = 24,
  arcType: string = 'single'
): AngleDetails => {
  const dx1 = p1x - vx;
  const dy1 = p1y - vy;
  const len1 = Math.hypot(dx1, dy1);
  const u1x = len1 > 1e-4 ? dx1 / len1 : 1;
  const u1y = len1 > 1e-4 ? dy1 / len1 : 0;

  const dx2 = p2x - vx;
  const dy2 = p2y - vy;
  const len2 = Math.hypot(dx2, dy2);
  const u2x = len2 > 1e-4 ? dx2 / len2 : 0;
  const u2y = len2 > 1e-4 ? dy2 / len2 : -1;

  // Clamp effective radius to not exceed arm lengths
  const minArmLen = Math.min(len1, len2);
  const effectiveSize = minArmLen > 8 ? Math.min(size, minArmLen * 0.9) : size;

  const dot = Math.max(-1, Math.min(1, u1x * u2x + u1y * u2y));
  const rad = Math.acos(dot);
  const deg = (rad * 180) / Math.PI;

  const isRightAngle = Math.abs(deg - 90) <= 1.5;

  if (isRightAngle) {
    const k1x = vx + effectiveSize * u1x;
    const k1y = vy + effectiveSize * u1y;
    const k2x = vx + effectiveSize * u2x;
    const k2y = vy + effectiveSize * u2y;
    const k3x = vx + effectiveSize * u1x + effectiveSize * u2x;
    const k3y = vy + effectiveSize * u1y + effectiveSize * u2y;

    const strokePoints = [k1x, k1y, k3x, k3y, k2x, k2y];
    const fillPoints = [vx, vy, k1x, k1y, k3x, k3y, k2x, k2y, vx, vy];
    const labelPos = {
      x: vx + (effectiveSize + 14) * 0.707 * (u1x + u2x),
      y: vy + (effectiveSize + 14) * 0.707 * (u1y + u2y),
    };

    const extraStrokeLines: number[][] = [];
    if (arcType === 'double') {
      const s2 = Math.max(8, effectiveSize - 5);
      extraStrokeLines.push([
        vx + s2 * u1x,
        vy + s2 * u1y,
        vx + s2 * u1x + s2 * u2x,
        vy + s2 * u1y + s2 * u2y,
        vx + s2 * u2x,
        vy + s2 * u2y,
      ]);
    } else if (arcType === 'tick' || arcType === 'double_tick') {
      const midX = vx + effectiveSize * 0.5 * (u1x + u2x);
      const midY = vy + effectiveSize * 0.5 * (u1y + u2y);
      const normX = (u1x - u2x) * 0.707;
      const normY = (u1y - u2y) * 0.707;
      extraStrokeLines.push([midX - 5 * normX, midY - 5 * normY, midX + 5 * normX, midY + 5 * normY]);
    }

    return {
      isRightAngle: true,
      degrees: 90,
      strokePoints,
      fillPoints,
      labelPos,
      k1: { x: k1x, y: k1y },
      k2: { x: k2x, y: k2y },
      extraStrokeLines,
    };
  }

  // Not 90 degrees: circular arc connecting the two arms
  const a1 = Math.atan2(u1y, u1x);
  const a2 = Math.atan2(u2y, u2x);
  let sweep = a2 - a1;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  while (sweep < -Math.PI) sweep += 2 * Math.PI;

  const steps = Math.max(16, Math.min(48, Math.round(Math.abs(deg) / 3)));
  const strokePoints: number[] = [];

  // Point K1 exactly on Arm 1
  const k1x = vx + effectiveSize * u1x;
  const k1y = vy + effectiveSize * u1y;
  strokePoints.push(k1x, k1y);

  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const ang = a1 + t * sweep;
    const px = vx + effectiveSize * Math.cos(ang);
    const py = vy + effectiveSize * Math.sin(ang);
    strokePoints.push(px, py);
  }

  // Point K2 exactly on Arm 2
  const k2x = vx + effectiveSize * u2x;
  const k2y = vy + effectiveSize * u2y;
  strokePoints.push(k2x, k2y);

  // Closed wedge starting at Vertex V, along arm 1 to K1, arc to K2, along arm 2 back to V
  const fillPoints = [vx, vy, ...strokePoints, vx, vy];
  const midAng = a1 + 0.5 * sweep;
  const labelPos = {
    x: vx + (effectiveSize + 14) * Math.cos(midAng),
    y: vy + (effectiveSize + 14) * Math.sin(midAng),
  };

  const extraStrokeLines: number[][] = [];
  const generateArc = (r: number): number[] => {
    const pts: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const ang = a1 + t * sweep;
      pts.push(vx + r * Math.cos(ang), vy + r * Math.sin(ang));
    }
    return pts;
  };

  if (arcType === 'double') {
    const r2 = Math.max(8, effectiveSize - 5);
    extraStrokeLines.push(generateArc(r2));
  } else if (arcType === 'triple') {
    const r2 = Math.max(8, effectiveSize - 5);
    const r3 = effectiveSize + 5;
    extraStrokeLines.push(generateArc(r2), generateArc(r3));
  } else if (arcType === 'tick') {
    const mx = vx + effectiveSize * Math.cos(midAng);
    const my = vy + effectiveSize * Math.sin(midAng);
    const nx = Math.cos(midAng);
    const ny = Math.sin(midAng);
    extraStrokeLines.push([mx - 6 * nx, my - 6 * ny, mx + 6 * nx, my + 6 * ny]);
  } else if (arcType === 'double_tick') {
    const offsetAng = Math.min(0.12, Math.abs(sweep) * 0.15);
    const angA = midAng - offsetAng;
    const angB = midAng + offsetAng;

    const mxA = vx + effectiveSize * Math.cos(angA);
    const myA = vy + effectiveSize * Math.sin(angA);
    const nxA = Math.cos(angA);
    const nyA = Math.sin(angA);
    extraStrokeLines.push([mxA - 6 * nxA, myA - 6 * nyA, mxA + 6 * nxA, myA + 6 * nyA]);

    const mxB = vx + effectiveSize * Math.cos(angB);
    const myB = vy + effectiveSize * Math.sin(angB);
    const nxB = Math.cos(angB);
    const nyB = Math.sin(angB);
    extraStrokeLines.push([mxB - 6 * nxB, myB - 6 * nyB, mxB + 6 * nxB, myB + 6 * nyB]);
  }

  return {
    isRightAngle: false,
    degrees: deg,
    strokePoints,
    fillPoints,
    labelPos,
    k1: { x: k1x, y: k1y },
    k2: { x: k2x, y: k2y },
    extraStrokeLines,
  };
};

// Computes the 3 vertices defining the right angle corner symbol [K1, K3, K2]
export const computeRightAnglePoints = (
  vx: number,
  vy: number,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  size: number = 14
): [number, number, number, number, number, number] => {
  const details = computeAngleDetails(vx, vy, p1x, p1y, p2x, p2y, size);
  if (details.strokePoints.length >= 6) {
    return [
      details.strokePoints[0],
      details.strokePoints[1],
      details.strokePoints[2],
      details.strokePoints[3],
      details.strokePoints[4],
      details.strokePoints[5],
    ];
  }
  return [vx, vy, vx + size, vy, vx + size, vy + size];
};

/** Đoạn thẳng (x1,y1)-(x2,y2) có cắt hình chữ nhật [minX,minY,maxX,maxY] không (Liang–Barsky) */
const segmentHitsBox = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  box: [number, number, number, number],
): boolean => {
  const [minX, minY, maxX, maxY] = box;
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, x1 - minX) && clip(dx, maxX - x1) && clip(-dy, y1 - minY) && clip(dy, maxY - y1);
};

/**
 * Vị trí nhãn của điểm (góc trên-trái của khung chữ, tính từ tâm điểm).
 *
 * - Khoảng cách từ điểm tới mép gần nhất của chữ = độ rộng chữ (tối thiểu 8px, tối đa 1.2 × cỡ chữ).
 * - Thử 16 hướng quanh điểm; chấm điểm mỗi hướng theo: độ xa so với các đường đi ra từ điểm,
 *   và phạt nặng nếu khung chữ đè lên đoạn thẳng, cạnh đa giác, đường thẳng/tia, đường tròn,
 *   hoặc điểm khác. Ưu tiên nhẹ các hướng quen thuộc (trên, trên-phải, trên-trái).
 * - Nếu người dùng đã tự kéo nhãn (labelOffset), giữ nguyên vị trí đó.
 */
export const computeSmartPointLabelOffset = (
  pt: PointElement,
  elements: GeoElement[],
  distancePx?: number
): { x: number; y: number } => {
  if (pt.labelOffset && (pt.labelOffset.x !== 0 || pt.labelOffset.y !== 0)) {
    return pt.labelOffset;
  }

  const fSize = pt.labelFontSize || 15;
  const label = pt.label || 'A';
  // Ước lượng kích thước chữ (chữ nghiêng có chân, ~0.62 cỡ chữ mỗi ký tự)
  const w = Math.max(fSize * 0.62, label.length * fSize * 0.62);
  const h = fSize * 1.05;
  const r = pt.radius || 4.5;
  const gap = distancePx !== undefined ? distancePx : Math.min(Math.max(8, w), fSize * 1.2);

  // Hướng các đường đi ra từ điểm, và các vật cản (đoạn thẳng, đường tròn, điểm khác)
  const rayAngles: number[] = [];
  const obstacles: [number, number, number, number][] = [];
  const circles: { cx: number; cy: number; r: number }[] = [];
  const otherPoints: { x: number; y: number }[] = [];
  const addRaysFromSegment = (x1: number, y1: number, x2: number, y2: number) => {
    obstacles.push([x1, y1, x2, y2]);
    if (Math.hypot(x1 - pt.x, y1 - pt.y) < 8) rayAngles.push(Math.atan2(y2 - pt.y, x2 - pt.x));
    else if (Math.hypot(x2 - pt.x, y2 - pt.y) < 8) rayAngles.push(Math.atan2(y1 - pt.y, x1 - pt.x));
    else {
      // Điểm nằm giữa đoạn (vd: trung điểm) → cả hai hướng của đoạn
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const t = ((pt.x - x1) * dx + (pt.y - y1) * dy) / (len * len);
      const dist = Math.abs((pt.x - x1) * dy - (pt.y - y1) * dx) / len;
      if (t > 0 && t < 1 && dist < 6) {
        const a = Math.atan2(dy, dx);
        rayAngles.push(a, a + Math.PI);
      }
    }
  };

  for (const el of elements) {
    if (el.id === pt.id) continue;
    switch (el.type) {
      case 'segment':
        addRaysFromSegment(el.x1, el.y1, el.x2, el.y2);
        break;
      case 'polygon': {
        const n = el.points.length / 2;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          addRaysFromSegment(el.points[2 * i], el.points[2 * i + 1], el.points[2 * j], el.points[2 * j + 1]);
        }
        break;
      }
      case 'line': {
        const dx = el.x2 - el.x1;
        const dy = el.y2 - el.y1;
        const len = Math.hypot(dx, dy);
        if (len < 1e-4) break;
        const ux = dx / len;
        const uy = dy / len;
        const L = 3000;
        const sx = el.isRay ? el.x1 : el.x1 - ux * L;
        const sy = el.isRay ? el.y1 : el.y1 - uy * L;
        obstacles.push([sx, sy, el.x1 + ux * L, el.y1 + uy * L]);
        const d = Math.abs((pt.x - el.x1) * dy - (pt.y - el.y1) * dx) / len;
        if (d < 8) {
          const a = Math.atan2(dy, dx);
          const atOrigin = el.isRay && Math.hypot(pt.x - el.x1, pt.y - el.y1) < 8;
          rayAngles.push(a);
          if (!atOrigin) rayAngles.push(a + Math.PI);
        }
        break;
      }
      case 'circle': {
        circles.push({ cx: el.cx, cy: el.cy, r: el.radius });
        const dc = Math.hypot(pt.x - el.cx, pt.y - el.cy);
        if (Math.abs(dc - el.radius) < 8 && dc > 1) {
          // Điểm trên đường tròn: tránh hai hướng tiếp tuyến và hướng vào trong tâm
          const toCenter = Math.atan2(el.cy - pt.y, el.cx - pt.x);
          rayAngles.push(toCenter + Math.PI / 2, toCenter - Math.PI / 2, toCenter);
        }
        break;
      }
      case 'point':
        otherPoints.push({ x: el.x, y: el.y });
        break;
    }
  }

  const prefs: Record<number, number> = { [-90]: 1.12, [-45]: 1.15, [-135]: 1.1, 0: 1, 180: 1, 45: 0.95, 135: 0.95, 90: 0.92 };
  let best = { score: -Infinity, x: 0, y: 0 };
  for (let k = 0; k < 16; k++) {
    const deg = -90 + k * 22.5;
    const ang = (deg * Math.PI) / 180;
    const dirX = Math.cos(ang);
    const dirY = Math.sin(ang);
    // Tâm khung chữ: mép gần nhất của chữ cách mép điểm đúng "gap"
    const reach = r + gap + Math.abs(dirX) * (w / 2) + Math.abs(dirY) * (h / 2);
    const cx = pt.x + dirX * reach;
    const cy = pt.y + dirY * reach;
    const box: [number, number, number, number] = [cx - w / 2 - 2, cy - h / 2 - 2, cx + w / 2 + 2, cy + h / 2 + 2];

    let clearance = Math.PI;
    for (const ray of rayAngles) {
      let diff = Math.abs(ang - ray) % (2 * Math.PI);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      clearance = Math.min(clearance, diff);
    }
    let penalty = 0;
    for (const [x1, y1, x2, y2] of obstacles) if (segmentHitsBox(x1, y1, x2, y2, box)) penalty += 1;
    for (const c of circles) {
      // Đường tròn cắt khung chữ nếu khoảng cách từ tâm tới khung nằm giữa (gần nhất, xa nhất) quanh bán kính
      const nx = Math.max(box[0], Math.min(c.cx, box[2]));
      const ny = Math.max(box[1], Math.min(c.cy, box[3]));
      const near = Math.hypot(c.cx - nx, c.cy - ny);
      const far = Math.max(
        Math.hypot(c.cx - box[0], c.cy - box[1]),
        Math.hypot(c.cx - box[2], c.cy - box[1]),
        Math.hypot(c.cx - box[0], c.cy - box[3]),
        Math.hypot(c.cx - box[2], c.cy - box[3]),
      );
      if (near <= c.r && far >= c.r) penalty += 1;
    }
    for (const o of otherPoints) {
      if (o.x > box[0] - 6 && o.x < box[2] + 6 && o.y > box[1] - 6 && o.y < box[3] + 6) penalty += 1.5;
    }
    const pref = prefs[Math.round(deg)] ?? 0.97;
    const score = Math.min(clearance, Math.PI / 2) * pref - penalty * 2;
    if (score > best.score) best = { score, x: cx - w / 2 - pt.x, y: cy - h / 2 - pt.y };
  }
  return { x: Math.round(best.x), y: Math.round(best.y) };
};

// Compute infinite line across canvas bounds [0, 0, width, height] passing through (x1, y1) and (x2, y2)
export const computeInfiniteLinePoints = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  canvasWidth: number = 3000,
  canvasHeight: number = 2000
): [number, number, number, number] => {
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
    return [x1 - 1000, y1, x1 + 1000, y1];
  }

  // Large multiplier to span well beyond any canvas boundary
  const L = Math.max(canvasWidth, canvasHeight) * 3;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;

  return [x1 - ux * L, y1 - uy * L, x1 + ux * L, y1 + uy * L];
};

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export const getElementsBoundingBox = (
  elements: GeoElement[],
  padding: number = 20
): BoundingBox | null => {
  if (elements.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    switch (el.type) {
      case 'point': {
        const r = el.radius + 15; // extra for label
        minX = Math.min(minX, el.x - r);
        minY = Math.min(minY, el.y - r);
        maxX = Math.max(maxX, el.x + r);
        maxY = Math.max(maxY, el.y + r);
        break;
      }
      case 'segment': {
        minX = Math.min(minX, el.x1, el.x2);
        minY = Math.min(minY, el.y1, el.y2);
        maxX = Math.max(maxX, el.x1, el.x2);
        maxY = Math.max(maxY, el.y1, el.y2);
        break;
      }
      case 'line': {
        // Đường thẳng / tia: lấy đúng phần đang hiển thị (vẽ vừa đủ) cùng nhãn ở hai đầu
        const vis = computeVisibleLine(el.x1, el.y1, el.x2, el.y2, 100000, 100000, Boolean(el.isRay), lineExtentPoints(el, elements));
        const [ax, ay, bx, by] = vis.points;
        const xs = [ax, bx, vis.end.x + 14, ...(vis.start ? [vis.start.x, vis.start.x + 14] : [])];
        const ys = [ay, by, vis.end.y + 18, ...(vis.start ? [vis.start.y, vis.start.y + 18] : [])];
        minX = Math.min(minX, ...xs);
        minY = Math.min(minY, ...ys);
        maxX = Math.max(maxX, ...xs);
        maxY = Math.max(maxY, ...ys);
        break;
      }
      case 'circle': {
        minX = Math.min(minX, el.cx - el.radius);
        minY = Math.min(minY, el.cy - el.radius);
        maxX = Math.max(maxX, el.cx + el.radius);
        maxY = Math.max(maxY, el.cy + el.radius);
        break;
      }
      case 'polygon': {
        for (let i = 0; i < el.points.length; i += 2) {
          const px = el.points[i];
          const py = el.points[i + 1];
          minX = Math.min(minX, px);
          minY = Math.min(minY, py);
          maxX = Math.max(maxX, px);
          maxY = Math.max(maxY, py);
        }
        break;
      }
      case 'latex': {
        // Approximate LaTeX box based on font size and length
        const estW = Math.max(el.latex.length * (el.fontSize * 0.65), 50);
        const estH = el.fontSize * 1.5;
        minX = Math.min(minX, el.x);
        minY = Math.min(minY, el.y);
        maxX = Math.max(maxX, el.x + estW);
        maxY = Math.max(maxY, el.y + estH);
        break;
      }
      case 'angle':
      case 'right_angle': {
        const s = el.size || 24;
        minX = Math.min(minX, el.vx - s);
        minY = Math.min(minY, el.vy - s);
        maxX = Math.max(maxX, el.vx + s);
        maxY = Math.max(maxY, el.vy + s);
        break;
      }
    }
  }

  if (minX === Infinity) return null;

  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(maxX - minX, 10),
    height: Math.max(maxY - minY, 10),
  };
};

export const generateLabel = (index: number): string => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (index < letters.length) {
    return letters[index];
  }
  const primary = letters[index % letters.length];
  const count = Math.floor(index / letters.length);
  return `${primary}${count}`;
};

/**
 * Returns the next available alphabet label ('A', 'B', 'C'..., skipping existing ones like GSP)
 */
export const getNextAvailableLabel = (elements: GeoElement[]): string => {
  const usedLabels = new Set(
    elements
      .filter((el): el is PointElement => el.type === 'point' && !!el.label)
      .map((p) => p.label!)
  );

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let cycle = 0; cycle < 100; cycle++) {
    for (let i = 0; i < letters.length; i++) {
      const candidate = cycle === 0 ? letters[i] : `${letters[i]}${cycle}`;
      if (!usedLabels.has(candidate)) {
        return candidate;
      }
    }
  }
  return `P${elements.length + 1}`;
};

/**
 * Returns count consecutive available alphabet labels
 */
export const getNextAvailableLabels = (elements: GeoElement[], count: number): string[] => {
  const usedLabels = new Set(
    elements
      .filter((el): el is PointElement => el.type === 'point' && !!el.label)
      .map((p) => p.label!)
  );
  const result: string[] = [];
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let cycle = 0;
  while (result.length < count) {
    for (let i = 0; i < letters.length && result.length < count; i++) {
      const candidate = cycle === 0 ? letters[i] : `${letters[i]}${cycle}`;
      if (!usedLabels.has(candidate)) {
        usedLabels.add(candidate);
        result.push(candidate);
      }
    }
    cycle++;
  }
  return result;
};

export interface SnapTargetResult {
  x: number;
  y: number;
  dist: number;
  targetElement: GeoElement;
  attachedTo: {
    elementId: string;
    type: 'line' | 'segment' | 'circle' | 'polygon';
    t?: number;
    edgeIndex?: number;
    angle?: number;
    offset?: { dx: number; dy: number };
  };
  desc: string;
}

/**
 * Finds the closest geometry object (line, segment, circle, polygon) to snap onto
 */
export const findSnapTarget = (
  pos: { x: number; y: number },
  elements: GeoElement[],
  threshold: number = 14,
  ignoreId?: string
): SnapTargetResult | null => {
  let closest: SnapTargetResult | null = null;
  let minDist = threshold;

  for (const el of elements) {
    if (el.id === ignoreId) continue;

    // 1. Line snap (infinite line)
    if (el.type === 'line') {
      const dx = el.x2 - el.x1;
      const dy = el.y2 - el.y1;
      const len2 = dx * dx + dy * dy;
      if (len2 > 1e-4) {
        const u = ((pos.x - el.x1) * dx + (pos.y - el.y1) * dy) / len2;
        const px = el.x1 + u * dx;
        const py = el.y1 + u * dy;
        const d = Math.hypot(pos.x - px, pos.y - py);
        if (d < minDist) {
          minDist = d;
          closest = {
            x: px,
            y: py,
            dist: d,
            targetElement: el,
            attachedTo: {
              elementId: el.id,
              type: 'line',
              offset: { dx: px - el.x1, dy: py - el.y1 },
            },
            desc: 'Đường thẳng',
          };
        }
      }
    }

    // 2. Segment snap
    if (el.type === 'segment') {
      const dx = el.x2 - el.x1;
      const dy = el.y2 - el.y1;
      const len2 = dx * dx + dy * dy;
      if (len2 > 1e-4) {
        const u = Math.max(0, Math.min(1, ((pos.x - el.x1) * dx + (pos.y - el.y1) * dy) / len2));
        const px = el.x1 + u * dx;
        const py = el.y1 + u * dy;
        const d = Math.hypot(pos.x - px, pos.y - py);
        if (d < minDist) {
          minDist = d;
          closest = {
            x: px,
            y: py,
            dist: d,
            targetElement: el,
            attachedTo: {
              elementId: el.id,
              type: 'segment',
              t: u,
            },
            desc: 'Đoạn thẳng',
          };
        }
      }
    }

    // 3. Circle snap
    if (el.type === 'circle') {
      const dToCenter = Math.hypot(pos.x - el.cx, pos.y - el.cy);
      const d = Math.abs(dToCenter - el.radius);
      if (d < minDist && dToCenter > 1e-4) {
        const px = el.cx + (el.radius * (pos.x - el.cx)) / dToCenter;
        const py = el.cy + (el.radius * (pos.y - el.cy)) / dToCenter;
        minDist = d;
        closest = {
          x: px,
          y: py,
          dist: d,
          targetElement: el,
          attachedTo: {
            elementId: el.id,
            type: 'circle',
            angle: Math.atan2(py - el.cy, px - el.cx),
          },
          desc: 'Đường tròn',
        };
      }
    }

    // 4. Polygon edge snap
    if (el.type === 'polygon' && el.points.length >= 6) {
      const pts = el.points;
      const numPts = pts.length / 2;
      for (let i = 0; i < numPts; i++) {
        const x1 = pts[i * 2];
        const y1 = pts[i * 2 + 1];
        const nextIdx = (i + 1) % numPts;
        const x2 = pts[nextIdx * 2];
        const y2 = pts[nextIdx * 2 + 1];

        const dx = x2 - x1;
        const dy = y2 - y1;
        const len2 = dx * dx + dy * dy;
        if (len2 > 1e-4) {
          const u = Math.max(0, Math.min(1, ((pos.x - x1) * dx + (pos.y - y1) * dy) / len2));
          const px = x1 + u * dx;
          const py = y1 + u * dy;
          const d = Math.hypot(pos.x - px, pos.y - py);
          if (d < minDist) {
            minDist = d;
            closest = {
              x: px,
              y: py,
              dist: d,
              targetElement: el,
              attachedTo: {
                elementId: el.id,
                type: 'polygon',
                edgeIndex: i,
                t: u,
              },
              desc: 'Cạnh đa giác',
            };
          }
        }
      }
    }
  }

  return closest;
};

/**
 * Calculates distance from point to line segment (x1, y1) - (x2, y2)
 */
export const distanceToSegment = (
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { dist: number; u: number; projX: number; projY: number } => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) {
    return {
      dist: Math.hypot(px - x1, py - y1),
      u: 0,
      projX: x1,
      projY: y1,
    };
  }
  const u = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  const projX = x1 + u * dx;
  const projY = y1 + u * dy;
  return {
    dist: Math.hypot(px - projX, py - projY),
    u,
    projX,
    projY,
  };
};

/**
 * Checks if a point is near any edge of a polygon
 */
export const isPointNearPolygonEdge = (
  pt: { x: number; y: number },
  poly: PolygonElement,
  threshold: number = 25
): boolean => {
  const pts = poly.points;
  const numPts = pts.length / 2;
  for (let i = 0; i < numPts; i++) {
    const x1 = pts[i * 2];
    const y1 = pts[i * 2 + 1];
    const nextIdx = (i + 1) % numPts;
    const x2 = pts[nextIdx * 2];
    const y2 = pts[nextIdx * 2 + 1];
    const res = distanceToSegment(pt.x, pt.y, x1, y1, x2, y2);
    if (res.dist < threshold && res.u > 0.03 && res.u < 0.97) {
      return true;
    }
  }
  return false;
};

/**
 * Inserts a point into a polygon edge, transforming an N-gon into an (N+1)-gon (e.g. triangle into quadrilateral)
 */
export const insertPointIntoPolygon = (
  poly: PolygonElement,
  pt: { x: number; y: number }
): { newPoly: PolygonElement; insertedEdgeIndex: number; projected: { x: number; y: number } } | null => {
  const pts = [...poly.points];
  const numPts = pts.length / 2;
  if (numPts < 3) return null;

  // Check if point is already close to an existing vertex
  for (let i = 0; i < numPts; i++) {
    if (Math.hypot(pt.x - pts[i * 2], pt.y - pts[i * 2 + 1]) < 8) {
      return null; // Already a vertex
    }
  }

  // Find the edge closest to the point
  let bestEdge = -1;
  let minDist = 30; // threshold
  let bestProj = { x: pt.x, y: pt.y };

  for (let i = 0; i < numPts; i++) {
    const x1 = pts[i * 2];
    const y1 = pts[i * 2 + 1];
    const nextIdx = (i + 1) % numPts;
    const x2 = pts[nextIdx * 2];
    const y2 = pts[nextIdx * 2 + 1];

    const res = distanceToSegment(pt.x, pt.y, x1, y1, x2, y2);
    if (res.dist < minDist && res.u > 0.02 && res.u < 0.98) {
      minDist = res.dist;
      bestEdge = i;
      bestProj = { x: res.projX, y: res.projY };
    }
  }

  if (bestEdge === -1) return null;

  // Insert point into pts after vertex bestEdge, which is index (bestEdge + 1) * 2
  const insertIndex = (bestEdge + 1) * 2;
  pts.splice(insertIndex, 0, Math.round(bestProj.x), Math.round(bestProj.y));

  return {
    newPoly: {
      ...poly,
      points: pts,
    },
    insertedEdgeIndex: bestEdge,
    projected: { x: Math.round(bestProj.x), y: Math.round(bestProj.y) },
  };
};

/**
 * Finds the geometric edge (segment, polygon edge, or line) closest to a point.
 */
export const findEdgeAt = (
  pos: { x: number; y: number },
  elements: GeoElement[],
  threshold: number = 18
): EdgeTarget | null => {
  let bestEdge: EdgeTarget | null = null;
  let minDistance = threshold;

  const findPtIdAt = (x: number, y: number): string | undefined => {
    const pt = elements.find(
      (el): el is PointElement => el.type === 'point' && Math.hypot(el.x - x, el.y - y) < 10
    );
    return pt?.id;
  };

  const getPointLabelAt = (x: number, y: number): string | undefined => {
    const pt = elements.find(
      (el): el is PointElement => el.type === 'point' && Math.hypot(el.x - x, el.y - y) < 10
    );
    return pt?.label;
  };

  for (const el of elements) {
    if (el.type === 'segment') {
      const res = distanceToSegment(pos.x, pos.y, el.x1, el.y1, el.x2, el.y2);
      if (res.dist < minDistance && res.u >= -0.05 && res.u <= 1.05) {
        minDistance = res.dist;
        const p1Id = findPtIdAt(el.x1, el.y1);
        const p2Id = findPtIdAt(el.x2, el.y2);
        const l1 = getPointLabelAt(el.x1, el.y1);
        const l2 = getPointLabelAt(el.x2, el.y2);
        const label = l1 && l2 ? `${l1}${l2}` : undefined;
        bestEdge = {
          elementId: el.id,
          type: 'segment',
          x1: el.x1,
          y1: el.y1,
          x2: el.x2,
          y2: el.y2,
          p1Id,
          p2Id,
          label,
        };
      }
    } else if (el.type === 'polygon') {
      const pts = el.points;
      const numPts = pts.length / 2;
      for (let i = 0; i < numPts; i++) {
        const x1 = pts[i * 2];
        const y1 = pts[i * 2 + 1];
        const nextIdx = (i + 1) % numPts;
        const x2 = pts[nextIdx * 2];
        const y2 = pts[nextIdx * 2 + 1];

        const res = distanceToSegment(pos.x, pos.y, x1, y1, x2, y2);
        if (res.dist < minDistance && res.u >= -0.05 && res.u <= 1.05) {
          minDistance = res.dist;
          const p1Id = findPtIdAt(x1, y1);
          const p2Id = findPtIdAt(x2, y2);
          const l1 = getPointLabelAt(x1, y1);
          const l2 = getPointLabelAt(x2, y2);
          const label = l1 && l2 ? `${l1}${l2}` : `cạnh ${i + 1}`;
          bestEdge = {
            elementId: el.id,
            type: 'polygon_edge',
            edgeIndex: i,
            x1,
            y1,
            x2,
            y2,
            p1Id,
            p2Id,
            label,
          };
        }
      }
    } else if (el.type === 'line') {
      const dx = el.x2 - el.x1;
      const dy = el.y2 - el.y1;
      const len = Math.hypot(dx, dy);
      if (len > 1e-4) {
        const dist = Math.abs((pos.x - el.x1) * dy - (pos.y - el.y1) * dx) / len;
        if (dist < minDistance) {
          minDistance = dist;
          bestEdge = {
            elementId: el.id,
            type: 'line',
            x1: el.x1,
            y1: el.y1,
            x2: el.x2,
            y2: el.y2,
          };
        }
      }
    }
  }

  return bestEdge;
};

/**
 * Computes intersection vertex V and arm points P1 and P2 between two edges.
 */
export const getEdgesIntersectionAndArms = (
  edge1: EdgeTarget,
  edge2: EdgeTarget,
  click1?: { x: number; y: number },
  click2?: { x: number; y: number }
): EdgeAngleResult | null => {
  const A = { x: edge1.x1, y: edge1.y1, id: edge1.p1Id };
  const B = { x: edge1.x2, y: edge1.y2, id: edge1.p2Id };
  const C = { x: edge2.x1, y: edge2.y1, id: edge2.p1Id };
  const D = { x: edge2.x2, y: edge2.y2, id: edge2.p2Id };

  const close = (p: { x: number; y: number }, q: { x: number; y: number }) =>
    Math.hypot(p.x - q.x, p.y - q.y) < 14;

  // Case 1: Shared endpoint (standard polygon or joined segments)
  if (close(A, C)) {
    return { v: { x: A.x, y: A.y, id: A.id || C.id }, p1: B, p2: D };
  }
  if (close(A, D)) {
    return { v: { x: A.x, y: A.y, id: A.id || D.id }, p1: B, p2: C };
  }
  if (close(B, C)) {
    return { v: { x: B.x, y: B.y, id: B.id || C.id }, p1: A, p2: D };
  }
  if (close(B, D)) {
    return { v: { x: B.x, y: B.y, id: B.id || D.id }, p1: A, p2: C };
  }

  // Case 2: Lines intersection
  const dx1 = B.x - A.x;
  const dy1 = B.y - A.y;
  const dx2 = D.x - C.x;
  const dy2 = D.y - C.y;
  const denom = dx1 * dy2 - dy1 * dx2;

  if (Math.abs(denom) < 1e-5) {
    return null; // Parallel edges
  }

  const t = ((C.x - A.x) * dy2 - (C.y - A.y) * dx2) / denom;
  const ix = A.x + t * dx1;
  const iy = A.y + t * dy1;
  const V = { x: ix, y: iy };

  // Determine direction along Edge 1 based on click position
  let p1x = B.x;
  let p1y = B.y;
  if (click1) {
    const dot1 = (click1.x - V.x) * dx1 + (click1.y - V.y) * dy1;
    if (dot1 > 0) {
      p1x = V.x + dx1;
      p1y = V.y + dy1;
    } else {
      p1x = V.x - dx1;
      p1y = V.y - dy1;
    }
  }

  // Determine direction along Edge 2 based on click position
  let p2x = D.x;
  let p2y = D.y;
  if (click2) {
    const dot2 = (click2.x - V.x) * dx2 + (click2.y - V.y) * dy2;
    if (dot2 > 0) {
      p2x = V.x + dx2;
      p2y = V.y + dy2;
    } else {
      p2x = V.x - dx2;
      p2y = V.y - dy2;
    }
  }

  return {
    v: { x: V.x, y: V.y },
    p1: { x: p1x, y: p1y, id: edge1.p1Id || edge1.p2Id },
    p2: { x: p2x, y: p2y, id: edge2.p1Id || edge2.p2Id },
  };
};

/**
 * Di chuyển một tập hợp các đối tượng hình học (hoặc toàn bộ các đối tượng được chọn)
 * theo vector (dx, dy), bảo toàn 100% vị trí tương đối giữa các đối tượng.
 */
/** Điểm có phải tâm của đường tròn (trùng vị trí) */
export const isCenterOf = (circle: { cx: number; cy: number }, point: { x: number; y: number }) =>
  Math.hypot(point.x - circle.cx, point.y - circle.cy) < 1.5;

/** Các đường tròn nhận điểm này làm tâm */
export const circlesCenteredAt = (elements: GeoElement[], point: { x: number; y: number }) =>
  elements.filter((el): el is CircleElement => el.type === 'circle' && isCenterOf(el, point));

/** Điểm gần vị trí cho trước nhất, trong phạm vi `range` điểm ảnh */
export function findPointNear(elements: GeoElement[], pos: { x: number; y: number }, range: number): PointElement | undefined {
  let best: PointElement | undefined;
  let bestDistance = range;
  for (const el of elements) {
    if (el.type !== 'point') continue;
    const d = Math.hypot(el.x - pos.x, el.y - pos.y);
    if (d <= bestDistance) {
      best = el;
      bestDistance = d;
    }
  }
  return best;
}

export function moveElements(
  elements: GeoElement[],
  targetIds: string[],
  dx: number,
  dy: number
): GeoElement[] {
  if ((dx === 0 && dy === 0) || targetIds.length === 0) return elements;
  const targetSet = new Set(targetIds);

  // 1. Nhận diện các điểm cần di chuyển:
  // - Điểm được chọn trực tiếp
  // - Điểm mút của đoạn thẳng được chọn
  // - Đỉnh của đa giác được chọn
  // - Tâm của hình tròn được chọn
  // - Điểm chia sẻ groupId hoặc neo vào đối tượng được chọn
  const movingPointIds = new Set<string>();
  const movingElementsSet = new Set<string>(targetIds);

  elements.forEach((el) => {
    if (el.type === 'point' && targetSet.has(el.id)) {
      movingPointIds.add(el.id);
    }
    if (el.type === 'segment' && targetSet.has(el.id)) {
      elements.forEach((p) => {
        if (p.type === 'point') {
          if (
            (el.groupId && p.groupId === el.groupId) ||
            Math.hypot(p.x - el.x1, p.y - el.y1) < 10 ||
            Math.hypot(p.x - el.x2, p.y - el.y2) < 10 ||
            p.attachedTo?.elementId === el.id
          ) {
            movingPointIds.add(p.id);
            movingElementsSet.add(p.id);
          }
        }
      });
    }
    if (el.type === 'polygon' && targetSet.has(el.id)) {
      elements.forEach((p) => {
        if (p.type === 'point') {
          const isVertex = el.points.some((_, idx) => {
            if (idx % 2 === 0) {
              return Math.hypot(p.x - el.points[idx], p.y - el.points[idx + 1]) < 10;
            }
            return false;
          });
          if (isVertex || (el.groupId && p.groupId === el.groupId) || p.attachedTo?.elementId === el.id) {
            movingPointIds.add(p.id);
            movingElementsSet.add(p.id);
          }
        }
      });
    }
    if (el.type === 'circle' && targetSet.has(el.id)) {
      elements.forEach((p) => {
        if (p.type === 'point') {
          if (
            (el.groupId && p.groupId === el.groupId) ||
            Math.hypot(p.x - el.cx, p.y - el.cy) < 10 ||
            p.attachedTo?.elementId === el.id
          ) {
            movingPointIds.add(p.id);
            movingElementsSet.add(p.id);
          }
        }
      });
    }
  });

  // Tâm di chuyển thì đường tròn và các điểm gắn trên nó đi theo
  elements.forEach((el) => {
    if (el.type !== 'circle' || movingElementsSet.has(el.id)) return;
    const centerMoves = elements.some((p) => p.type === 'point' && movingPointIds.has(p.id) && isCenterOf(el, p));
    if (!centerMoves) return;
    movingElementsSet.add(el.id);
    elements.forEach((p) => {
      if (p.type === 'point' && p.attachedTo?.elementId === el.id) movingPointIds.add(p.id);
    });
  });

  // Bản đồ các điểm di chuyển để cập nhật đối tượng phụ thuộc chưa được chọn
  const movedPointMap = new Map<string, { oldX: number; oldY: number; newX: number; newY: number }>();
  elements.forEach((el) => {
    if (el.type === 'point' && movingPointIds.has(el.id)) {
      movedPointMap.set(el.id, {
        oldX: el.x,
        oldY: el.y,
        newX: el.x + dx,
        newY: el.y + dy,
      });
    }
  });

  return elements.map((el) => {
    // A. Điểm
    if (el.type === 'point') {
      const isLabelSelected = targetSet.has('label-' + el.id);
      const isPointSelected = movingPointIds.has(el.id);

      // Nếu chỉ chọn riêng nhãn của điểm để di chuyển bằng bàn phím hoặc chuột
      if (isLabelSelected && !isPointSelected) {
        const curOffset = computeSmartPointLabelOffset(el, elements);
        return {
          ...el,
          labelOffset: {
            x: Math.round(curOffset.x + dx),
            y: Math.round(curOffset.y + dy),
          },
        };
      }

      if (isPointSelected) {
        return {
          ...el,
          x: el.x + dx,
          y: el.y + dy,
        };
      }
      return el;
    }

    // B. Đoạn thẳng
    if (el.type === 'segment') {
      if (movingElementsSet.has(el.id)) {
        return {
          ...el,
          x1: el.x1 + dx,
          y1: el.y1 + dy,
          x2: el.x2 + dx,
          y2: el.y2 + dy,
        };
      }
      // Nếu đoạn thẳng không được chọn nhưng có mút gắn vào điểm di chuyển -> co dãn theo
      let nx1 = el.x1;
      let ny1 = el.y1;
      let nx2 = el.x2;
      let ny2 = el.y2;
      let changed = false;

      movedPointMap.forEach(({ oldX, oldY, newX, newY }) => {
        if (Math.hypot(el.x1 - oldX, el.y1 - oldY) < 10) {
          nx1 = newX;
          ny1 = newY;
          changed = true;
        }
        if (Math.hypot(el.x2 - oldX, el.y2 - oldY) < 10) {
          nx2 = newX;
          ny2 = newY;
          changed = true;
        }
      });

      if (changed) {
        return { ...el, x1: nx1, y1: ny1, x2: nx2, y2: ny2 };
      }
      return el;
    }

    // C. Đường thẳng
    if (el.type === 'line') {
      if (movingElementsSet.has(el.id)) {
        return {
          ...el,
          x1: el.x1 + dx,
          y1: el.y1 + dy,
          x2: el.x2 + dx,
          y2: el.y2 + dy,
        };
      }
      return el;
    }

    // D. Đường tròn
    if (el.type === 'circle') {
      if (movingElementsSet.has(el.id)) {
        return {
          ...el,
          cx: el.cx + dx,
          cy: el.cy + dy,
        };
      }
      return el;
    }

    // E. Đa giác
    if (el.type === 'polygon') {
      if (movingElementsSet.has(el.id)) {
        return {
          ...el,
          points: el.points.map((p, i) => (i % 2 === 0 ? p + dx : p + dy)),
        };
      }
      // Nếu đa giác không được chọn nhưng có đỉnh thuộc điểm di chuyển
      const newPts = [...el.points];
      let changed = false;
      movedPointMap.forEach(({ oldX, oldY, newX, newY }) => {
        for (let i = 0; i < newPts.length; i += 2) {
          if (Math.hypot(newPts[i] - oldX, newPts[i + 1] - oldY) < 10) {
            newPts[i] = newX;
            newPts[i + 1] = newY;
            changed = true;
          }
        }
      });
      if (changed) {
        return { ...el, points: newPts };
      }
      return el;
    }

    // F. Ký hiệu góc
    if (el.type === 'angle' || el.type === 'right_angle') {
      if (movingElementsSet.has(el.id)) {
        return {
          ...el,
          vx: el.vx + dx,
          vy: el.vy + dy,
          p1x: el.p1x + dx,
          p1y: el.p1y + dy,
          p2x: el.p2x + dx,
          p2y: el.p2y + dy,
        };
      }
      let nvx = el.vx;
      let nvy = el.vy;
      let np1x = el.p1x;
      let np1y = el.p1y;
      let np2x = el.p2x;
      let np2y = el.p2y;
      let changed = false;

      movedPointMap.forEach(({ oldX, oldY, newX, newY }) => {
        if (Math.hypot(el.vx - oldX, el.vy - oldY) < 10) {
          nvx = newX;
          nvy = newY;
          changed = true;
        }
        if (Math.hypot(el.p1x - oldX, el.p1y - oldY) < 10) {
          np1x = newX;
          np1y = newY;
          changed = true;
        }
        if (Math.hypot(el.p2x - oldX, el.p2y - oldY) < 10) {
          np2x = newX;
          np2y = newY;
          changed = true;
        }
      });

      if (changed) {
        return {
          ...el,
          vx: nvx,
          vy: nvy,
          p1x: np1x,
          p1y: np1y,
          p2x: np2x,
          p2y: np2y,
        };
      }
      return el;
    }

    // G. Công thức LaTeX
    if (el.type === 'latex') {
      if (movingElementsSet.has(el.id)) {
        return {
          ...el,
          x: el.x + dx,
          y: el.y + dy,
        };
      }
      return el;
    }

    return el;
  });
}
