/** Đổi vị trí bấm trên màn hình thành điểm, đoạn, mặt của hình không gian. Toàn bộ là hàm thuần. */
import { MAX_COORD, buildMesh, meshEdges, resolvePoints, type ExtraPoint, type PointSpec, type SolidDoc, type SolidMesh } from './model';
import { facePlanes, hiddenRange, makeProjection, type Frame, type View } from './scene';
import { add, dot, scale, sub, type Vec3 } from './vec';

export interface ScreenPoint {
  x: number;
  y: number;
}

const toScreen = (view: View, frame: Frame) => {
  const { project } = makeProjection(view);
  return (p: Vec3): ScreenPoint => {
    const q = project(p);
    return { x: frame.cx + q.x * frame.scale, y: frame.cy + q.y * frame.scale };
  };
};

/** Tìm (u, v) sao cho điểm origin + u·e1 + v·e2 hiện đúng tại `target`; null nếu mặt phẳng nhìn gần như nghiêng cạnh */
export function unproject(view: View, frame: Frame, target: ScreenPoint, origin: Vec3, e1: Vec3, e2: Vec3) {
  const screen = toScreen(view, frame);
  const o = screen(origin);
  const a = screen(add(origin, e1));
  const b = screen(add(origin, e2));
  const [ax, ay, bx, by] = [a.x - o.x, a.y - o.y, b.x - o.x, b.y - o.y];
  const det = ax * by - ay * bx;
  // So với diện tích lớn nhất có thể: gần 0 nghĩa là bấm một chút điểm đã nhảy rất xa
  if (Math.abs(det) < 0.08 * Math.hypot(ax, ay) * Math.hypot(bx, by) || Math.abs(det) < 1e-9) return null;
  const dx = target.x - o.x;
  const dy = target.y - o.y;
  return { u: (dx * by - dy * bx) / det, v: (ax * dy - ay * dx) / det };
}

/** Hai véc-tơ của mặt phẳng đối diện người nhìn (kiểu sách giáo khoa: mặt phẳng đứng song song màn hình) */
export function facingAxes(view: View): [Vec3, Vec3] {
  if (view.mode === 'sgk') return [[1, 0, 0], [0, 1, 0]];
  const a = (view.yaw * Math.PI) / 180;
  const e = (view.tilt * Math.PI) / 180;
  return [
    [Math.cos(a), 0, Math.sin(a)],
    [Math.sin(a) * Math.sin(e), Math.cos(e), -Math.cos(a) * Math.sin(e)],
  ];
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Đưa điểm tự do tới vị trí `target`, trượt trên mặt phẳng đối diện người nhìn đi qua `from` */
export function freePosition(view: View, frame: Frame, target: ScreenPoint, from: Vec3 = [0, 0, 0]): Vec3 | null {
  const [e1, e2] = facingAxes(view);
  const hit = unproject(view, frame, target, from, e1, e2);
  if (!hit) return null;
  return add(from, add(scale(e1, hit.u), scale(e2, hit.v))).map((n) => round(Math.min(MAX_COORD, Math.max(-MAX_COORD, n)))) as Vec3;
}

/** Điểm mới trên mặt phẳng đáy (có thể ở ngoài đáy); null nếu đang nhìn ngang mặt đáy */
export function basePlanePoint(doc: SolidDoc, view: View, frame: Frame, target: ScreenPoint): PointSpec | null {
  const mesh = buildMesh(doc);
  const ids = mesh.base.map((i) => mesh.vertices[i].id);
  const of = [ids[0], ids[1], ids[ids.length - 1]];
  const [o, i, j] = of.map((id) => mesh.vertices.find((v) => v.id === id)!.p);
  const hit = unproject(view, frame, target, o, sub(i, o), sub(j, o));
  if (!hit || Math.abs(hit.u) > 6 || Math.abs(hit.v) > 6) return null;
  return { type: 'face', of, u: hit.u, v: hit.v, open: true };
}

export interface LineHit {
  from: string;
  to: string;
  /** Vị trí trên đoạn, 0 tại `from` */
  t: number;
}

/** Cạnh hoặc đoạn thẳng gần chỗ bấm nhất (ưu tiên nét thấy khi hai nét sát nhau) */
export function pickLine(doc: SolidDoc, view: View, frame: Frame, target: ScreenPoint, reach = 12): LineHit | null {
  const mesh = buildMesh(doc);
  const planes = facePlanes(mesh);
  const { toViewer } = makeProjection(view);
  const screen = toScreen(view, frame);
  const byId = new Map(resolvePoints(doc, mesh).map((p) => [p.id, p]));
  const pairs = [...meshEdges(mesh), ...doc.segments.map((s) => [s.from, s.to] as [string, string])];
  let best: LineHit | null = null;
  let bestScore = reach;
  for (const [from, to] of pairs) {
    const p = byId.get(from);
    const q = byId.get(to);
    if (!p || !q) continue;
    const a = screen(p.p);
    const b = screen(q.p);
    const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    if (len2 < 1) continue;
    const t = Math.min(1, Math.max(0, ((target.x - a.x) * (b.x - a.x) + (target.y - a.y) * (b.y - a.y)) / len2));
    const distance = Math.hypot(target.x - a.x - t * (b.x - a.x), target.y - a.y - t * (b.y - a.y));
    if (distance >= reach) continue;
    const range = hiddenRange(p.p, q.p, planes, toViewer);
    const score = distance + (range && t >= range[0] && t <= range[1] ? 3 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = { from, to, t };
    }
  }
  return best;
}

export interface FaceHit {
  /** Mã các đỉnh của mặt, theo thứ tự quanh mặt */
  ids: string[];
  u: number;
  v: number;
}

const insideFace = (corners: number, u: number, v: number) =>
  u >= -1e-9 && v >= -1e-9 && (corners === 3 ? u + v <= 1 + 1e-9 : u <= 1 + 1e-9 && v <= 1 + 1e-9);

/** Mặt quay về phía người nhìn chứa chỗ bấm */
export function pickFace(doc: SolidDoc, view: View, frame: Frame, target: ScreenPoint): FaceHit | null {
  const mesh = buildMesh(doc);
  const planes = facePlanes(mesh);
  const { toViewer } = makeProjection(view);
  for (const [index, face] of mesh.faces.entries()) {
    if (dot(planes[index].n, toViewer) <= 1e-6) continue;
    const [o, i, j] = [face[0], face[1], face[face.length - 1]].map((k) => mesh.vertices[k].p);
    const hit = unproject(view, frame, target, o, sub(i, o), sub(j, o));
    if (hit && insideFace(face.length, hit.u, hit.v)) return { ids: face.map((k) => mesh.vertices[k].id), ...hit };
  }
  return null;
}

/** Điểm sẽ được tạo khi bấm vào `target` bằng công cụ "điểm trên đối tượng" */
export function pickOnObject(doc: SolidDoc, view: View, frame: Frame, target: ScreenPoint): PointSpec | null {
  const line = pickLine(doc, view, frame, target);
  if (line) return { type: 'on', of: [line.from, line.to], t: line.t };
  const face = pickFace(doc, view, frame, target);
  if (face) return { type: 'face', of: [face.ids[0], face.ids[1], face.ids[face.ids.length - 1]], u: face.u, v: face.v };
  return null;
}

/** Số đỉnh của mặt chứa ba điểm này (mặt tam giác hay hình bình hành) */
const cornersOf = (mesh: SolidMesh, ids: string[]) =>
  mesh.faces.find((face) => ids.every((id) => face.some((k) => mesh.vertices[k].id === id)))?.length ?? 4;

/** Vị trí mới khi kéo một điểm (tự do, trên đoạn hoặc trên mặt) tới `target` */
export function dragPoint(doc: SolidDoc, view: View, frame: Frame, point: ExtraPoint, target: ScreenPoint, start: Vec3) {
  const mesh = buildMesh(doc);
  const byId = new Map(resolvePoints(doc, mesh).map((p) => [p.id, p.p]));
  if (point.type === 'free') {
    const at = freePosition(view, frame, target, start);
    return at ? { at } : null;
  }
  if (point.type === 'on') {
    const [p, q] = point.of.map((id) => byId.get(id));
    if (!p || !q) return null;
    const screen = toScreen(view, frame);
    const a = screen(p);
    const b = screen(q);
    const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    if (len2 < 1) return null;
    return { t: ((target.x - a.x) * (b.x - a.x) + (target.y - a.y) * (b.y - a.y)) / len2 };
  }
  if (point.type === 'face') {
    const [o, i, j] = point.of.map((id) => byId.get(id));
    if (!o || !i || !j) return null;
    const hit = unproject(view, frame, target, o, sub(i, o), sub(j, o));
    if (!hit) return null;
    let { u, v } = hit;
    if (point.open) return Math.abs(u) <= 6 && Math.abs(v) <= 6 ? { u, v } : null;
    // Giữ điểm ở trong mặt
    u = Math.max(0, u);
    v = Math.max(0, v);
    if (cornersOf(mesh, point.of) === 3) {
      const over = u + v;
      if (over > 1) [u, v] = [u / over, v / over];
    } else {
      [u, v] = [Math.min(1, u), Math.min(1, v)];
    }
    return { u, v };
  }
  return null;
}
