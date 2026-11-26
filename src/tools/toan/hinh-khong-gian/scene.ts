/** Chiếu hình 3D xuống mặt phẳng, xác định nét khuất và đặt nhãn. */
import { buildMesh, curveKey, isRound, lineKey, meshEdges, pointKey, resolvePoints, roundCurves, solidFaces, type SolidDoc, type SolidKind, type SolidMesh } from './model';
import { circlePoint, hiddenByRound, sideLines, splitByVisibility, type Piece } from './round';
import { cross, dot, lerp, sub, type Vec3 } from './vec';

export interface View {
  /** 'sgk': phép chiếu xiên như hình trong sách giáo khoa; 'free': xoay tự do */
  mode: 'sgk' | 'free';
  /** Góc xoay ngang (độ), chỉ dùng khi xoay tự do */
  yaw: number;
  /** Góc nhìn từ trên xuống (độ), chỉ dùng khi xoay tự do */
  tilt: number;
}

export const SGK_VIEW: View = { mode: 'sgk', yaw: -25, tilt: 20 };

/**
 * Góc nhìn thật sự dùng để vẽ. Khối tròn trong sách giáo khoa được vẽ nhìn chính diện hơi từ trên xuống
 * (đường tròn thành elip nằm ngang), không dùng phép chiếu xiên.
 */
export const effectiveView = (kind: SolidKind, view: View): View =>
  isRound(kind) && view.mode === 'sgk' ? { mode: 'free', yaw: 0, tilt: 18 } : view;

/** Phép chiếu xiên: cạnh theo chiều sâu vẽ nghiêng 45° và dài bằng một nửa */
const DEPTH_SCALE = 0.5;
const DEPTH_ANGLE = Math.PI / 4;

/**
 * Xoay thêm quanh trục đứng đi qua tâm khối (trục không được vẽ ra).
 * Hình kiểu sách giáo khoa là phép chiếu xiên nên khi xoay phải chuyển sang xoay tự do.
 */
export const spinView = (view: View, degrees: number): View => ({
  mode: 'free',
  yaw: ((((view.yaw + degrees + 180) % 360) + 360) % 360) - 180,
  tilt: view.tilt,
});

/** Làm tròn góc xoay sau khi tự xoay (giữ nguyên đối tượng nếu góc đã tròn) */
export const roundYaw = (view: View): View => (Number.isInteger(view.yaw) ? view : { ...view, yaw: Math.round(view.yaw) });

export interface Projection {
  /** Tọa độ trên màn hình (y hướng xuống) */
  project: (p: Vec3) => { x: number; y: number };
  /** Véc-tơ hướng từ hình về phía người nhìn (trong hệ tọa độ của hình) */
  toViewer: Vec3;
}

export function makeProjection(view: View): Projection {
  if (view.mode === 'sgk') {
    const dx = DEPTH_SCALE * Math.cos(DEPTH_ANGLE);
    const dy = DEPTH_SCALE * Math.sin(DEPTH_ANGLE);
    return {
      project: ([x, y, z]) => ({ x: x - z * dx, y: -(y - z * dy) }),
      toViewer: [dx, dy, 1],
    };
  }
  const a = (view.yaw * Math.PI) / 180;
  const e = (view.tilt * Math.PI) / 180;
  return {
    project: ([x, y, z]) => {
      const rx = x * Math.cos(a) + z * Math.sin(a);
      const rz = -x * Math.sin(a) + z * Math.cos(a);
      return { x: rx, y: -(y * Math.cos(e) - rz * Math.sin(e)) };
    },
    toViewer: [-Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)],
  };
}

export interface Plane {
  /** Pháp tuyến đơn vị hướng ra ngoài */
  n: Vec3;
  /** Điểm P nằm trong khối khi n·P <= c */
  c: number;
}

export function facePlanes(mesh: SolidMesh): Plane[] {
  const center = [0, 1, 2].map((k) => mesh.vertices.reduce((s, v) => s + v.p[k], 0) / mesh.vertices.length) as Vec3;
  return mesh.faces.map((face) => {
    const [p, q, r] = face.map((i) => mesh.vertices[i].p);
    let n = cross(sub(q, p), sub(r, p));
    const length = Math.hypot(...n);
    n = [n[0] / length, n[1] / length, n[2] / length];
    if (dot(n, sub(p, center)) < 0) n = [-n[0], -n[1], -n[2]];
    return { n, c: dot(n, p) };
  });
}

/**
 * Phần bị khối che của đoạn PQ, dạng [s0, s1] với 0 = P, 1 = Q (null: thấy toàn bộ).
 *
 * Điểm X(s) trên đoạn bị che khi tia X(s) + t·toViewer (t ≥ 0) đi bên trong khối một quãng dài hơn 0.
 * Mỗi mặt cho một chặn trên hoặc chặn dưới của t, đều là hàm bậc nhất theo s; tia cắt khối khi mọi
 * chặn trên lớn hơn mọi chặn dưới. Khối lồi nên tập các s thỏa mãn là một khoảng liên tục.
 * Cách này đúng cả khi điểm nằm ngoài khối (điểm tự do, đường kéo dài).
 */
export function hiddenRange(p: Vec3, q: Vec3, planes: Plane[], toViewer: Vec3): [number, number] | null {
  const EPS = 1e-7;
  const GAP = 1e-6;
  let s0 = 0;
  let s1 = 1;
  // Giữ lại các s sao cho f(s) > min, với f(0) = f0, f(1) = f1
  const require = (f0: number, f1: number, min: number) => {
    const a = f0 - min;
    const b = f1 - min;
    if (a <= 0 && b <= 0) s1 = -1;
    else if (a <= 0) s0 = Math.max(s0, a / (a - b));
    else if (b <= 0) s1 = Math.min(s1, a / (a - b));
  };
  const upper: [number, number][] = [];
  const lower: [number, number][] = [[0, 0]]; // t ≥ 0
  for (const { n, c } of planes) {
    const speed = dot(n, toViewer);
    const room0 = c - dot(n, p);
    const room1 = c - dot(n, q);
    if (Math.abs(speed) < EPS) require(room0, room1, EPS); // tia chạy dọc theo mặt: phải ở hẳn phía trong
    else (speed > 0 ? upper : lower).push([room0 / speed, room1 / speed]);
  }
  for (const [u0, u1] of upper) for (const [l0, l1] of lower) require(u0 - l0, u1 - l1, GAP);
  return s1 - s0 > 1e-4 ? [s0, s1] : null;
}

/** Điểm P có bị khối che không */
export const isHidden = (p: Vec3, planes: Plane[], toViewer: Vec3) => hiddenRange(p, p, planes, toViewer) !== null;

/** Các khúc thấy / khuất của đoạn PQ do khối che */
export function segmentPieces(mesh: SolidMesh, planes: Plane[], toViewer: Vec3, p: Vec3, q: Vec3): Piece[] {
  const { round } = mesh;
  if (round) return splitByVisibility((s) => hiddenByRound(lerp(p, q, s), round, toViewer));
  // Khối đa diện: tính chính xác, một đoạn bị cắt thành tối đa ba khúc
  const range = hiddenRange(p, q, planes, toViewer);
  const snap = (s: number) => (s < 2e-3 ? 0 : s > 1 - 2e-3 ? 1 : s);
  const [s0, s1] = range ? [snap(range[0]), snap(range[1])] : [1, 1];
  return [
    { from: 0, to: s0, hidden: false },
    { from: s0, to: s1, hidden: true },
    { from: s1, to: 1, hidden: false },
  ].filter((piece) => piece.to > piece.from);
}

export interface XY {
  x: number;
  y: number;
}

/** Màu riêng (nếu có) và trạng thái người dùng cho ẩn */
interface Styled {
  /** Khóa trong doc.looks */
  look: string;
  color?: string;
  off: boolean;
}

export interface SceneLine extends Styled {
  key: string;
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Nét khuất (vẽ đứt) */
  hidden: boolean;
}

/** Một khúc của đường tròn hoặc nét bao khối tròn */
export interface SceneCurve extends Styled {
  key: string;
  points: XY[];
  hidden: boolean;
}

export interface SceneFace {
  key: string;
  points: XY[];
  color?: string;
  /** Mặt nằm trên thì được bấm trúng trước: 2 mặt phẳng quay về người nhìn, 1 mặt cong, 0 mặt khuất */
  rank: number;
}

export interface SceneDot extends Styled {
  id: string;
  name: string;
  extra: boolean;
  x: number;
  y: number;
  labelX: number;
  labelY: number;
}

export interface Scene {
  faces: SceneFace[];
  curves: SceneCurve[];
  lines: SceneLine[];
  dots: SceneDot[];
}

export interface Frame {
  /** Số điểm ảnh cho một đơn vị của hình */
  scale: number;
  cx: number;
  cy: number;
  fontSize: number;
}

/** Bán kính hình cầu bao quanh khối (dùng để canh tỉ lệ ổn định khi xoay) */
export function boundingRadius({ vertices, round }: SolidMesh) {
  if (!round) return Math.max(...vertices.map((v) => Math.hypot(...v.p)));
  return round.type === 'cau' ? round.r : Math.hypot(round.r, (round.y1 - round.y0) / 2);
}

/** Bao lồi của các điểm trên màn hình */
function hull(points: XY[]): XY[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const turn = (o: XY, a: XY, b: XY) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: XY[]) => {
    const out: XY[] = [];
    for (const p of list) {
      while (out.length > 1 && turn(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half(sorted.reverse())];
}

const CIRCLE_STEPS = 180;
const turns = (n: number) => Array.from({ length: n }, (_, i) => i / n);

export function buildScene(doc: SolidDoc, view: View, frame: Frame): Scene {
  const mesh = buildMesh(doc);
  const { round } = mesh;
  const planes = facePlanes(mesh);
  const projection = makeProjection(view);
  const { toViewer } = projection;
  const points = resolvePoints(doc, mesh);
  const byId = new Map(points.map((p) => [p.id, p]));
  const screen = (p: Vec3) => {
    const q = projection.project(p);
    return { x: frame.cx + q.x * frame.scale, y: frame.cy + q.y * frame.scale };
  };
  const styled = (look: string): Styled => ({ look, color: doc.looks[look]?.color, off: doc.looks[look]?.hidden === true });

  const pairs = [
    ...meshEdges(mesh).map(([from, to]) => ({ key: `edge-${from}-${to}`, from, to })),
    ...doc.segments.map((s) => ({ key: s.id, from: s.from, to: s.to })),
  ];
  const lines: SceneLine[] = [];
  for (const { key, from, to } of pairs) {
    const p = byId.get(from);
    const q = byId.get(to);
    if (!p || !q) continue;
    const pieces = segmentPieces(mesh, planes, toViewer, p.p, q.p);
    pieces.forEach((piece, i) => {
      const a = screen(lerp(p.p, q.p, piece.from));
      const b = screen(lerp(p.p, q.p, piece.to));
      lines.push({ key: pieces.length > 1 ? `${key}#${i}` : key, from, to, x1: a.x, y1: a.y, x2: b.x, y2: b.y, hidden: piece.hidden, ...styled(lineKey(from, to)) });
    });
  }
  // Nét khuất vẽ trước để nét thấy nằm đè lên trên
  lines.sort((a, b) => Number(b.hidden) - Number(a.hidden));

  const curves: SceneCurve[] = [];
  if (round) {
    for (const curve of roundCurves(mesh)) {
      const center = byId.get(curve.center)!.p;
      const at = (t: number) => circlePoint(center, round.r, t);
      const pieces = splitByVisibility((t) => hiddenByRound(at(t), round, toViewer), CIRCLE_STEPS);
      // Đường tròn khép kín: nối khúc cuối với khúc đầu nếu cùng thấy hoặc cùng khuất
      if (pieces.length > 1 && pieces[0].hidden === pieces[pieces.length - 1].hidden) {
        const last = pieces.pop()!;
        pieces[0] = { ...pieces[0], from: last.from - 1 };
      }
      pieces.forEach(({ from, to, hidden }, i) => {
        const steps = Math.max(2, Math.ceil((to - from) * CIRCLE_STEPS));
        const path = Array.from({ length: steps + 1 }, (_, k) => screen(at(from + ((to - from) * k) / steps)));
        curves.push({ key: `${curve.id}#${i}`, points: path, hidden, ...styled(curveKey(curve.id)) });
      });
    }
    if (round.type === 'cau') {
      const c = screen([0, 0, 0]);
      const R = round.r * frame.scale;
      const path = [...turns(CIRCLE_STEPS), 1].map((t) => ({ x: c.x + R * Math.cos(2 * Math.PI * t), y: c.y + R * Math.sin(2 * Math.PI * t) }));
      curves.push({ key: 'outline#0', points: path, hidden: false, ...styled(curveKey('outline')) });
    } else {
      sideLines(round, toViewer).forEach(([a, b], i) => {
        curves.push({ key: `outline#${i}`, points: [screen(a), screen(b)], hidden: false, ...styled(curveKey('outline')) });
      });
    }
    curves.sort((a, b) => Number(b.hidden) - Number(a.hidden));
  }

  const faces: SceneFace[] = solidFaces(mesh).map((face, index) => {
    const color = doc.fills[face.key];
    if (face.ids) {
      const front = dot(planes[index].n, toViewer) > 1e-6;
      return { key: face.key, color, points: face.ids.map((id) => screen(byId.get(id)!.p)), rank: front ? 2 : 0 };
    }
    const { r, y0, y1 } = round!;
    const ring = (y: number) => turns(90).map((t) => screen(circlePoint([0, y, 0], r, t)));
    if (face.part === 'base' || face.part === 'top') {
      const front = face.part === 'top' ? toViewer[1] > 1e-6 : toViewer[1] < -1e-6;
      return { key: face.key, color, points: ring(face.part === 'top' ? y1 : y0), rank: front ? 2 : 0 };
    }
    let outline: XY[];
    if (face.part === 'surface') {
      const c = screen([0, 0, 0]);
      outline = turns(120).map((t) => ({ x: c.x + r * frame.scale * Math.cos(2 * Math.PI * t), y: c.y + r * frame.scale * Math.sin(2 * Math.PI * t) }));
    } else {
      outline = hull([...ring(y0), ...(round!.type === 'tru' ? ring(y1) : [screen([0, y1, 0])])]);
    }
    return { key: face.key, color, points: outline, rank: 1 };
  });
  // Mặt phía sau tô trước
  faces.sort((a, b) => a.rank - b.rank);

  const vertexScreen = mesh.vertices.map((v) => screen(v.p));
  const middle = round
    ? screen([0, 0, 0])
    : {
        x: vertexScreen.reduce((s, p) => s + p.x, 0) / vertexScreen.length,
        y: vertexScreen.reduce((s, p) => s + p.y, 0) / vertexScreen.length,
      };
  const dots: SceneDot[] = points.map((p) => {
    const s = screen(p.p);
    let dx = s.x - middle.x;
    let dy = s.y - middle.y;
    // Điểm bên trong hình (tâm, trung điểm): đặt nhãn chéo xuống phải
    if ((p.extra || round) && Math.hypot(dx, dy) < frame.scale * 0.8) [dx, dy] = [1, 1];
    const length = Math.hypot(dx, dy) || 1;
    const gap = frame.fontSize * 0.95;
    const offset = doc.labelOffsets[p.id] ?? { x: 0, y: 0 };
    return {
      id: p.id,
      name: p.name,
      extra: p.extra,
      x: s.x,
      y: s.y,
      labelX: s.x + (dx / length) * gap + offset.x * frame.scale,
      labelY: s.y + (dy / length) * gap + offset.y * frame.scale,
      ...styled(pointKey(p.id)),
    };
  });

  return { faces, curves, lines, dots };
}
