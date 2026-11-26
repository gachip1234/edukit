/** Đổi vị trí bấm trên màn hình thành điểm, đoạn, mặt của hình không gian. Toàn bộ là hàm thuần. */
import { MAX_COORD, buildMesh, lineKey, meshEdges, resolvePoints, roundCurves, type ExtraPoint, type PointSpec, type SolidDoc, type SolidMesh } from './model';
import { circlePoint, hiddenByRound } from './round';
import { facePlanes, makeProjection, segmentPieces, type Frame, type Scene, type View, type XY } from './scene';
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
  if (mesh.round) {
    const hit = diskHit(mesh, view, frame, target, 'O');
    return hit && Math.abs(hit.u) <= 6 && Math.abs(hit.v) <= 6 ? { type: 'disk', of: ['O'], ...hit, open: true } : null;
  }
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

/** Vị trí (u, v) của `target` trên mặt phẳng ngang qua tâm `center` của khối tròn, đơn vị là bán kính */
function diskHit(mesh: SolidMesh, view: View, frame: Frame, target: ScreenPoint, center: string) {
  const o = mesh.vertices.find((v) => v.id === center)!.p;
  const { r } = mesh.round!;
  return unproject(view, frame, target, o, [r, 0, 0], [0, 0, r]);
}

/** Điểm trên đường tròn ngang tâm `center` gần chỗ bấm nhất */
function nearestOnCircle(view: View, frame: Frame, target: ScreenPoint, center: Vec3, r: number) {
  const screen = toScreen(view, frame);
  const distance = (t: number) => {
    const p = screen(circlePoint(center, r, t));
    return Math.hypot(p.x - target.x, p.y - target.y);
  };
  let best = 0;
  let bestDistance = distance(0);
  // Dò thô rồi thu hẹp quanh vị trí tốt nhất
  for (let step = 1 / 90, from = 0, count = 90; step > 1e-5; step /= 10, from = best - step * 10, count = 20) {
    for (let i = 0; i <= count; i++) {
      const t = from + i * step;
      const d = distance(t);
      if (d < bestDistance) [best, bestDistance] = [t, d];
    }
  }
  return { t: ((best % 1) + 1) % 1, distance: bestDistance };
}

/** Cạnh hoặc đoạn thẳng gần chỗ bấm nhất (ưu tiên nét thấy khi hai nét sát nhau); bỏ qua đoạn đang ẩn */
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
    if (doc.looks[lineKey(from, to)]?.hidden) continue;
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
    const behind = segmentPieces(mesh, planes, toViewer, p.p, q.p).some((piece) => piece.hidden && t >= piece.from && t <= piece.to);
    const score = distance + (behind ? 3 : 0);
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
  const mesh = buildMesh(doc);
  if (mesh.round) return pickOnRound(doc, mesh, view, frame, target);
  const face = pickFace(doc, view, frame, target);
  if (face) return { type: 'face', of: [face.ids[0], face.ids[1], face.ids[face.ids.length - 1]], u: face.u, v: face.v };
  return null;
}

/** Khối tròn: ưu tiên đường tròn, sau đó tới các mặt tròn */
function pickOnRound(doc: SolidDoc, mesh: SolidMesh, view: View, frame: Frame, target: ScreenPoint, reach = 12): PointSpec | null {
  const round = mesh.round!;
  const { toViewer } = makeProjection(view);
  const centerOf = (id: string) => mesh.vertices.find((v) => v.id === id)!.p;
  let best: PointSpec | null = null;
  let bestScore = reach;
  for (const curve of roundCurves(mesh)) {
    if (doc.looks[`c:${curve.id}`]?.hidden) continue;
    const center = centerOf(curve.center);
    const hit = nearestOnCircle(view, frame, target, center, round.r);
    if (hit.distance >= reach) continue;
    const score = hit.distance + (hiddenByRound(circlePoint(center, round.r, hit.t), round, toViewer) ? 3 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = { type: 'rim', of: [curve.center], t: hit.t };
    }
  }
  if (best) return best;
  // Mặt đáy trên của hình trụ nằm trước khi nhìn từ trên xuống
  const centers = round.type === 'tru' ? (toViewer[1] > 0 ? ["O'", 'O'] : ['O', "O'"]) : ['O'];
  for (const center of centers) {
    const hit = diskHit(mesh, view, frame, target, center);
    if (hit && Math.hypot(hit.u, hit.v) <= 1 + 1e-9) return { type: 'disk', of: [center], ...hit };
  }
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
  if (point.type === 'rim') {
    const center = byId.get(point.of[0]);
    return center && mesh.round ? { t: nearestOnCircle(view, frame, target, center, mesh.round.r).t } : null;
  }
  if (point.type === 'disk') {
    if (!mesh.round) return null;
    const hit = diskHit(mesh, view, frame, target, point.of[0]);
    if (!hit) return null;
    if (point.open) return Math.abs(hit.u) <= 6 && Math.abs(hit.v) <= 6 ? hit : null;
    // Giữ điểm ở trong mặt tròn
    const over = Math.max(1, Math.hypot(hit.u, hit.v));
    return { u: hit.u / over, v: hit.v / over };
  }
  return null;
}

export interface ItemHit {
  type: 'point' | 'line' | 'curve' | 'face';
  /** Khóa trong doc.looks hoặc doc.fills */
  key: string;
}

const toSegment = (p: XY, a: XY, b: XY) => {
  const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2)) : 0;
  return Math.hypot(p.x - a.x - t * (b.x - a.x), p.y - a.y - t * (b.y - a.y));
};

const insidePolygon = (p: XY, polygon: XY[]) =>
  polygon.reduce((inside, a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x) ? !inside : inside;
  }, false);

/**
 * Đối tượng trên hình đang vẽ tại chỗ bấm, cho công cụ tô màu và ẩn/hiện.
 * Ưu tiên điểm, rồi tới đoạn và đường cong, cuối cùng là mặt. `includeOff`: tính cả thứ đang ẩn.
 */
export function pickItem(scene: Scene, target: ScreenPoint, { includeOff = false, faces = true, fontSize = 22 } = {}): ItemHit | null {
  const usable = <T extends { off: boolean }>(list: T[]) => list.filter((item) => includeOff || !item.off);
  let key: string | null = null;
  let best = 13;
  for (const d of usable(scene.dots)) {
    // Bấm trúng chữ cũng tính là bấm điểm đó
    const onLabel = Math.hypot(target.x - d.labelX, target.y - d.labelY) <= fontSize * 0.5;
    const distance = Math.min(Math.hypot(target.x - d.x, target.y - d.y), onLabel ? 8 : Infinity);
    if (distance < best) [key, best] = [d.look, distance];
  }
  if (key) return { type: 'point', key };

  let hit: ItemHit | null = null;
  best = 10;
  // Nét khuất bị trừ điểm để nét thấy được chọn khi hai nét sát nhau
  const consider = (type: 'line' | 'curve', look: string, distance: number, behind: boolean) => {
    const score = distance + (behind ? 3 : 0);
    if (score < best) [hit, best] = [{ type, key: look }, score];
  };
  for (const l of usable(scene.lines)) consider('line', l.look, toSegment(target, { x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }), l.hidden);
  for (const c of usable(scene.curves)) {
    consider('curve', c.look, Math.min(...c.points.slice(1).map((b, i) => toSegment(target, c.points[i], b))), c.hidden);
  }
  if (hit || !faces) return hit;

  // scene.faces xếp từ sau ra trước
  const face = [...scene.faces].reverse().find((f) => insidePolygon(target, f.points));
  return face ? { type: 'face', key: face.key } : null;
}
