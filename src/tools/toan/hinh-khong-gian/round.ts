/** Hình học của khối tròn: phần bị che, đường tròn và đường sinh ở hai bên. Toàn bộ là hàm thuần. */
import type { RoundShape } from './model';
import type { Vec3 } from './vec';

/**
 * Điểm P có bị khối tròn che không: tia P + t·toViewer (t ≥ 0) đi bên trong khối một quãng dài hơn 0.
 * Bên trong mỗi khối là miền f(t) = A·t² + 2B·t + C < 0, với khối nón và trụ còn kẹp giữa hai mặt y = y0, y = y1.
 */
export function hiddenByRound(p: Vec3, round: RoundShape, toViewer: Vec3): boolean {
  const size = Math.hypot(...toViewer);
  const [vx, vy, vz] = [toViewer[0] / size, toViewer[1] / size, toViewer[2] / size];
  const [x, y, z] = p;
  const { type, r, y0, y1 } = round;
  let lo = 0;
  let hi = Infinity;
  let A: number;
  let B: number;
  let C: number;
  if (type === 'cau') {
    A = 1;
    B = x * vx + y * vy + z * vz;
    C = x * x + y * y + z * z - r * r;
  } else {
    if (Math.abs(vy) < 1e-9) {
      if (y <= y0 + 1e-7 || y >= y1 - 1e-7) return false;
    } else {
      const [t0, t1] = [(y0 - y) / vy, (y1 - y) / vy];
      lo = Math.max(lo, Math.min(t0, t1));
      hi = Math.min(hi, Math.max(t0, t1));
    }
    if (type === 'tru') {
      A = vx * vx + vz * vz;
      B = x * vx + z * vz;
      C = x * x + z * z - r * r;
    } else {
      const k2 = (r / (y1 - y0)) ** 2;
      const below = y1 - y;
      A = vx * vx + vz * vz - k2 * vy * vy;
      B = x * vx + z * vz + k2 * below * vy;
      C = x * x + z * z - k2 * below * below;
    }
  }
  if (hi - lo < 1e-6) return false;
  const roots: number[] = [];
  if (Math.abs(A) < 1e-12) {
    if (Math.abs(B) > 1e-12) roots.push(-C / (2 * B));
  } else if (B * B - A * C > 0) {
    const root = Math.sqrt(B * B - A * C);
    roots.push((-B - root) / A, (-B + root) / A);
  }
  const cuts = [lo, ...roots.filter((t) => t > lo && t < hi).sort((a, b) => a - b), hi];
  return cuts.slice(1).some((end, i) => {
    const start = cuts[i];
    if (end - start < 1e-6) return false;
    const middle = Number.isFinite(end) ? (start + end) / 2 : start + 1;
    return A * middle * middle + 2 * B * middle + C < -1e-9;
  });
}

export interface Piece {
  from: number;
  to: number;
  hidden: boolean;
}

/** Chia đường s ∈ [0, 1] thành các khúc thấy / khuất: lấy mẫu rồi chia đôi để tìm đúng chỗ đổi */
export function splitByVisibility(hiddenAt: (s: number) => boolean, samples = 120): Piece[] {
  const pieces: Piece[] = [];
  let from = 0;
  let last = 0.5 / samples;
  let state = hiddenAt(last);
  for (let i = 1; i < samples; i++) {
    const s = (i + 0.5) / samples;
    const next = hiddenAt(s);
    if (next !== state) {
      let [a, b] = [last, s];
      for (let k = 0; k < 24; k++) {
        const m = (a + b) / 2;
        if (hiddenAt(m) === state) a = m;
        else b = m;
      }
      const edge = (a + b) / 2;
      pieces.push({ from, to: edge, hidden: state });
      from = edge;
      state = next;
    }
    last = s;
  }
  pieces.push({ from, to: 1, hidden: state });
  return pieces;
}

/** Điểm trên đường tròn ngang tâm `center`, `t` tính theo vòng */
export const circlePoint = (center: Vec3, r: number, t: number): Vec3 => [
  center[0] + r * Math.cos(2 * Math.PI * t),
  center[1],
  center[2] + r * Math.sin(2 * Math.PI * t),
];

/** Hai đường sinh ở hai bên của khối nón, khối trụ theo góc nhìn (rỗng khi nhìn gần thẳng từ trên hoặc dưới) */
export function sideLines(round: RoundShape, toViewer: Vec3): [Vec3, Vec3][] {
  const [vx, vy, vz] = toViewer;
  const flat = Math.hypot(vx, vz);
  const { type, r, y0, y1 } = round;
  if (type === 'cau' || flat < 1e-9) return [];
  // Đường sinh nằm ở bên khi pháp tuyến tại đó vuông góc với hướng nhìn
  const ratio = type === 'tru' ? 0 : (-r * vy) / ((y1 - y0) * flat);
  if (Math.abs(ratio) >= 1) return [];
  const middle = Math.atan2(vz, vx);
  return [-1, 1].map((side) => {
    const t = (middle + side * Math.acos(ratio)) / (2 * Math.PI);
    const foot = circlePoint([0, y0, 0], r, t);
    const head: Vec3 = type === 'tru' ? circlePoint([0, y1, 0], r, t) : [0, y1, 0];
    return [foot, head];
  });
}
