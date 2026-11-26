/** Chuyển dữ liệu hình thành mô tả cho mô hình 3D, và phép chiếu khớp với máy quay. Toàn bộ là hàm thuần. */
import { buildMesh, curveKey, faceKey, lineKey, meshEdges, pointKey, resolvePoints, roundCurves, type RoundShape, type SolidDoc, type SolidKind } from '../model';
import { boundingRadius, facePlanes, type Frame, type View, type XY } from '../scene';
import { cross, dot, sub, type Vec3 } from '../vec';
import { INK } from '../exportImage';

export interface Face3 {
  key: string;
  /** Màu người dùng tô */
  fill?: string;
  /** Đa giác (đỉnh xếp ngược chiều kim đồng hồ khi nhìn từ ngoài), mặt tròn, mặt xung quanh hoặc mặt cầu */
  shape: { type: 'polygon'; points: Vec3[] } | { type: 'cap'; y: number; up: boolean } | { type: 'side' } | { type: 'sphere' };
}

export interface Model3 {
  round?: RoundShape;
  /** Màu của khối khi chưa tô mặt nào */
  color: string;
  faces: Face3[];
  edges: { key: string; color: string; from: Vec3; to: Vec3 }[];
  circles: { key: string; color: string; center: Vec3; r: number }[];
  points: { id: string; name: string; p: Vec3; color: string; offset: { x: number; y: number } }[];
  /** Tâm của khối trong không gian, để đặt nhãn hướng ra ngoài */
  middle: Vec3[];
  /** Độ cao mặt sàn (đáy khối) */
  floor: number;
  /** Bán kính hình cầu bao khối */
  radius: number;
  /** Khoảng cách xa nhất từ gốc tới một điểm đang vẽ */
  reach: number;
}

const KIND_COLOR: Record<SolidKind, string> = {
  'chop-tu-giac': '#3b82f6',
  'chop-tam-giac': '#6366f1',
  'hop-chu-nhat': '#14b8a6',
  'lap-phuong': '#10b981',
  'lang-tru': '#f59e0b',
  cau: '#06b6d4',
  non: '#8b5cf6',
  tru: '#f97316',
};

export function model3d(doc: SolidDoc): Model3 {
  const mesh = buildMesh(doc);
  const { round } = mesh;
  const points = resolvePoints(doc, mesh);
  const byId = new Map(points.map((p) => [p.id, p.p]));
  const shown = (key: string) => !doc.looks[key]?.hidden;
  const colorOf = (key: string) => doc.looks[key]?.color ?? INK;

  let faces: Face3[];
  if (round) {
    const part = (name: string, shape: Face3['shape']): Face3 => ({ key: faceKey(name), fill: doc.fills[faceKey(name)], shape });
    if (round.type === 'cau') faces = [part('surface', { type: 'sphere' })];
    else {
      faces = [part('side', { type: 'side' }), part('base', { type: 'cap', y: round.y0, up: false })];
      if (round.type === 'tru') faces.push(part('top', { type: 'cap', y: round.y1, up: true }));
    }
  } else {
    const planes = facePlanes(mesh);
    faces = mesh.faces.map((face, index) => {
      const corners = face.map((i) => mesh.vertices[i].p);
      const [a, b, c] = corners;
      if (dot(cross(sub(b, a), sub(c, a)), planes[index].n) < 0) corners.reverse();
      const key = faceKey(...face.map((i) => mesh.vertices[i].id));
      return { key, fill: doc.fills[key], shape: { type: 'polygon', points: corners } };
    });
  }

  const pairs = [...meshEdges(mesh), ...doc.segments.map((s) => [s.from, s.to] as [string, string])];
  const edges = pairs.flatMap(([a, b]) => {
    const key = lineKey(a, b);
    const from = byId.get(a);
    const to = byId.get(b);
    return from && to && shown(key) ? [{ key, color: colorOf(key), from, to }] : [];
  });
  const circles = round
    ? roundCurves(mesh)
        .filter((c) => shown(curveKey(c.id)))
        .map((c) => ({ key: curveKey(c.id), color: colorOf(curveKey(c.id)), center: byId.get(c.center)!, r: round.r }))
    : [];

  return {
    round,
    color: KIND_COLOR[doc.kind],
    faces,
    edges,
    circles,
    points: points
      .filter((p) => shown(pointKey(p.id)))
      .map((p) => ({ id: p.id, name: p.name, p: p.p, color: colorOf(pointKey(p.id)), offset: doc.labelOffsets[p.id] ?? { x: 0, y: 0 } })),
    middle: round ? [[0, 0, 0]] : mesh.vertices.map((v) => v.p),
    floor: Math.min(...(round ? [round.y0] : mesh.vertices.map((v) => v.p[1]))),
    radius: boundingRadius(mesh),
    reach: Math.max(boundingRadius(mesh), ...points.map((p) => Math.hypot(...p.p))),
  };
}

/** Khoảng cách từ máy quay tới tâm khối: đủ xa để mọi điểm đều ở phía trước */
export const cameraDistance = (model: Pick<Model3, 'radius' | 'reach'>) => Math.max(model.radius * 5, model.reach * 2.5);

/** Hướng của máy quay (cùng quy ước với hình vẽ nét) và hai trục ngang, dọc của khung hình */
export function cameraAxes(view: View): { toViewer: Vec3; right: Vec3; up: Vec3 } {
  const a = (view.yaw * Math.PI) / 180;
  const e = (view.tilt * Math.PI) / 180;
  return {
    toViewer: [-Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)],
    right: [Math.cos(a), 0, Math.sin(a)],
    up: [Math.sin(a) * Math.sin(e), Math.cos(e), -Math.cos(a) * Math.sin(e)],
  };
}

/**
 * Vị trí trên màn hình của điểm P, khớp với máy quay nhìn vào gốc tọa độ.
 * `frame.scale` là số điểm ảnh cho một đơn vị tại mặt phẳng đi qua tâm khối.
 */
export function project3d(p: Vec3, view: View, frame: Frame, distance: number, perspective: boolean): XY {
  const { toViewer, right, up } = cameraAxes(view);
  const near = perspective ? distance / Math.max(distance * 0.02, distance - dot(p, toViewer)) : 1;
  return { x: frame.cx + dot(p, right) * near * frame.scale, y: frame.cy - dot(p, up) * near * frame.scale };
}

export interface Label3 extends XY {
  id: string;
  text: string;
  color: string;
}

/** Nhãn đặt lệch ra phía ngoài khối, giống hình vẽ nét */
export function labels3d(model: Model3, view: View, frame: Frame, perspective: boolean): Label3[] {
  const distance = cameraDistance(model);
  const screen = (p: Vec3) => project3d(p, view, frame, distance, perspective);
  const around = model.middle.map(screen);
  const middle = { x: around.reduce((s, p) => s + p.x, 0) / around.length, y: around.reduce((s, p) => s + p.y, 0) / around.length };
  return model.points.map((point) => {
    const s = screen(point.p);
    let dx = s.x - middle.x;
    let dy = s.y - middle.y;
    if (Math.hypot(dx, dy) < frame.scale * 0.8) [dx, dy] = [1, 1];
    const length = Math.hypot(dx, dy) || 1;
    // Tên có dấu phẩy hoặc chỉ số thì rộng hơn, đẩy ra thêm để không đè lên chấm điểm
    const gap = frame.fontSize * (point.name.length > 1 ? 1.15 : 0.95);
    return {
      id: point.id,
      text: point.name,
      color: point.color,
      x: s.x + (dx / length) * gap + point.offset.x * frame.scale,
      y: s.y + (dy / length) * gap + point.offset.y * frame.scale,
    };
  });
}
