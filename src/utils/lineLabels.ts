import type { GeoElement, LineElement } from '../types/geometry';

/**
 * Tính đoạn hiển thị của đường thẳng / tia trong khung vẽ, và vị trí nhãn ở hai đầu.
 */
export interface VisibleLine {
  points: [number, number, number, number];
  /** Vị trí nhãn đầu (phía x1, y1) — chỉ có với đường thẳng */
  start?: { x: number; y: number };
  /** Vị trí nhãn cuối (phía x2, y2) */
  end: { x: number; y: number };
}

/** Giao của đường thẳng qua (x1,y1),(x2,y2) với khung [0,w]x[0,h]: trả về 2 đầu mút theo thứ tự tham số t tăng dần */
function clipToBox(x1: number, y1: number, x2: number, y2: number, w: number, h: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const ts: number[] = [];
  if (Math.abs(dx) > 1e-9) {
    for (const X of [0, w]) {
      const t = (X - x1) / dx;
      const y = y1 + t * dy;
      if (y >= -1e-6 && y <= h + 1e-6) ts.push(t);
    }
  }
  if (Math.abs(dy) > 1e-9) {
    for (const Y of [0, h]) {
      const t = (Y - y1) / dy;
      const x = x1 + t * dx;
      if (x >= -1e-6 && x <= w + 1e-6) ts.push(t);
    }
  }
  if (ts.length < 2) return null;
  return { tMin: Math.min(...ts), tMax: Math.max(...ts) };
}

export function computeVisibleLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  height: number,
  isRay = false,
  /** Các điểm phần nhìn thấy phải đi qua: điểm nằm trên đường, giao với đoạn/đường tròn/đường khác */
  extentPoints: { x: number; y: number }[] = [],
): VisibleLine {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const at = (t: number) => ({ x: x1 + t * dx, y: y1 + t * dy });

  // Khoảng tham số t (0 = điểm thứ nhất, 1 = điểm thứ hai) cần thấy: hai điểm xác định + các điểm/giao điểm trên đường
  let ts = [0, 1, ...extentPoints.map((p) => ((p.x - x1) * dx + (p.y - y1) * dy) / (len * len))];
  if (isRay) ts = ts.filter((t) => t >= -1e-6);
  const lo = Math.min(...ts);
  const hi = Math.max(...ts);

  let tStart: number;
  let tEnd: number;
  if (isRay) {
    // Tia: từ gốc, vượt qua điểm/giao điểm xa nhất 60px, dài tối thiểu 200px
    tStart = 0;
    tEnd = Math.max(hi + 60 / len, 200 / len);
  } else {
    // Đường thẳng: vượt qua điểm/giao điểm ngoài cùng ở mỗi phía 50px, dài tối thiểu 240px
    tStart = lo - 50 / len;
    tEnd = hi + 50 / len;
    const minLen = 240 / len;
    if (tEnd - tStart < minLen) {
      const extra = (minLen - (tEnd - tStart)) / 2;
      tStart -= extra;
      tEnd += extra;
    }
  }
  // Không vượt quá mép khung vẽ
  const clip = clipToBox(x1, y1, x2, y2, width, height);
  if (clip) {
    tStart = Math.max(tStart, isRay ? 0 : clip.tMin);
    tEnd = Math.min(tEnd, Math.max(clip.tMax, isRay ? 1 : clip.tMax));
  }
  const a = at(tStart);
  const b = at(tEnd);

  // Nhãn đặt ngay sau mỗi đầu (lệch sang bên 12px), giữ trong khung
  const nx = -uy;
  const ny = ux;
  const clampIn = (p: { x: number; y: number }) => ({
    x: Math.min(Math.max(p.x, 6), width - 16),
    y: Math.min(Math.max(p.y, 6), height - 20),
  });
  const offset = (p: { x: number; y: number }) => ({ x: p.x + nx * 12 - 4, y: p.y + ny * 12 - 8 });

  return {
    points: [a.x, a.y, b.x, b.y],
    start: isRay ? undefined : clampIn(offset(at(tStart - 10 / len))),
    end: clampIn(offset(at(tEnd + 10 / len))),
  };
}

/**
 * Các điểm mà phần nhìn thấy của đường thẳng / tia nên đi qua:
 * điểm nằm trên nó, giao điểm với đoạn thẳng, cạnh đa giác, đường tròn và đường thẳng / tia khác.
 */
export function lineExtentPoints(line: LineElement, elements: GeoElement[]): { x: number; y: number }[] {
  const { x1, y1, x2, y2 } = line;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return [];
  const out: { x: number; y: number }[] = [];
  // Giao với đoạn (x3,y3)-(x4,y4); infiniteOther = đường kia cũng vô hạn
  const crossWith = (x3: number, y3: number, x4: number, y4: number, infiniteOther = false, otherRay = false) => {
    const ex = x4 - x3;
    const ey = y4 - y3;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) return;
    const t = ((x3 - x1) * ey - (y3 - y1) * ex) / den;
    const u = ((x3 - x1) * dy - (y3 - y1) * dx) / den;
    if (!infiniteOther && (u < -1e-6 || u > 1 + 1e-6)) return;
    if (otherRay && u < -1e-6) return;
    out.push({ x: x1 + t * dx, y: y1 + t * dy });
  };
  for (const el of elements) {
    if (el.id === line.id) continue;
    switch (el.type) {
      case 'point': {
        const d = Math.abs((el.x - x1) * dy - (el.y - y1) * dx) / len;
        if (d < 5) out.push({ x: el.x, y: el.y });
        break;
      }
      case 'segment':
        crossWith(el.x1, el.y1, el.x2, el.y2);
        break;
      case 'polygon': {
        const n = el.points.length / 2;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          crossWith(el.points[2 * i], el.points[2 * i + 1], el.points[2 * j], el.points[2 * j + 1]);
        }
        break;
      }
      case 'line':
        crossWith(el.x1, el.y1, el.x2, el.y2, true, Boolean(el.isRay));
        break;
      case 'circle': {
        const ux = dx / len;
        const uy = dy / len;
        const fx = x1 - el.cx;
        const fy = y1 - el.cy;
        const b = fx * ux + fy * uy;
        const disc = b * b - (fx * fx + fy * fy - el.radius * el.radius);
        if (disc >= 0) {
          const sq = Math.sqrt(disc);
          for (const t of [-b - sq, -b + sq]) out.push({ x: x1 + t * ux, y: y1 + t * uy });
        }
        break;
      }
    }
  }
  // Bỏ giao điểm quá xa (> 3000px) để đường không dài vô lý
  return out.filter((p) => Math.hypot(p.x - x1, p.y - y1) < 3000);
}

/**
 * Các gạch nhỏ ký hiệu "đoạn bằng nhau" ở giữa đoạn thẳng (count = 1, 2, 3 gạch).
 * Mỗi gạch dài 12px, vuông góc với đoạn; các gạch cách nhau 5px.
 */
export function computeTickMarks(x1: number, y1: number, x2: number, y2: number, count: number): number[][] {
  const n = Math.max(0, Math.min(3, Math.round(count || 0)));
  if (n === 0) return [];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const ticks: number[][] = [];
  for (let i = 0; i < n; i++) {
    const shift = (i - (n - 1) / 2) * 5;
    const cx = mx + ux * shift;
    const cy = my + uy * shift;
    ticks.push([cx - nx * 6, cy - ny * 6, cx + nx * 6, cy + ny * 6]);
  }
  return ticks;
}
