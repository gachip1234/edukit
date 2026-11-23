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
): VisibleLine {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const at = (t: number) => ({ x: x1 + t * dx, y: y1 + t * dy });

  const clip = clipToBox(x1, y1, x2, y2, width, height);
  // Mặc định (đường nằm ngoài khung): vẽ dài 2000px
  let tStart = isRay ? 0 : -2000 / len;
  let tEnd = 2000 / len;
  if (clip) {
    tEnd = Math.max(clip.tMax, isRay ? 1 : clip.tMax);
    tStart = isRay ? 0 : clip.tMin;
  }
  if (isRay) {
    // Tia vẽ một đoạn vừa phải để quan sát: vượt qua điểm (x2,y2) 60px, dài tối thiểu 200px,
    // và không quá mép khung (chứ không kéo hết khung vẽ)
    const moderate = Math.max(1 + 60 / len, 200 / len);
    tEnd = clip ? Math.min(Math.max(clip.tMax, 1), moderate) : moderate;
  }
  const a = at(tStart);
  const b = at(tEnd);

  // Pháp tuyến để đặt nhãn lệch sang bên 12px
  const nx = -uy;
  const ny = ux;
  // Nếu khung chứa điểm (x2,y2) nhưng tia/đường ra ngoài quá xa, giữ nhãn trong khung
  const clampIn = (p: { x: number; y: number }) => ({
    x: Math.min(Math.max(p.x, 6), width - 16),
    y: Math.min(Math.max(p.y, 6), height - 20),
  });

  // Nhãn đặt gần phần hình chính (không đẩy ra tận mép khung — mép phải có thể bị khung chat che):
  //  - cuối: vượt qua điểm (x2,y2) 50px, và cách gốc tia ít nhất 180px; nhưng không quá mép khung
  //  - đầu (chỉ đường thẳng): lùi trước điểm (x1,y1) 50px; nhưng không quá mép khung
  const edgeMargin = 22 / len;
  // Tia: nhãn đặt ngay sau đầu tia; đường thẳng: vượt qua (x2,y2) 50px
  const tEndLabel = isRay ? tEnd + 10 / len : Math.min(tEnd - edgeMargin, Math.max(1 + 50 / len, 180 / len));
  const tStartLabel = Math.max(tStart + edgeMargin, -50 / len);
  const nearEnd = at(tEndLabel);
  const nearStart = at(tStartLabel);
  const offset = (p: { x: number; y: number }) => ({ x: p.x + nx * 12 - 4, y: p.y + ny * 12 - 8 });

  return {
    points: [a.x, a.y, b.x, b.y],
    start: isRay ? undefined : clampIn(offset(nearStart)),
    end: clampIn(offset(nearEnd)),
  };
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
