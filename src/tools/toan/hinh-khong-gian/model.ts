/** Dữ liệu của hình không gian: khối đa diện lồi và khối tròn, điểm và đoạn thẳng thêm vào, màu sắc, lịch sử hoàn tác. */
import { add, cross, dot, length, lerp, scale, sub, type Vec3 } from './vec';

export type { Vec3 };

export type RoundKind = 'cau' | 'non' | 'tru';
export type SolidKind = 'chop-tu-giac' | 'chop-tam-giac' | 'hop-chu-nhat' | 'lap-phuong' | 'lang-tru' | RoundKind;

export const isRound = (kind: SolidKind): kind is RoundKind => kind === 'cau' || kind === 'non' || kind === 'tru';

export interface Dims {
  /** Cạnh đáy (hoặc chiều dài); bán kính với khối tròn */
  a: number;
  /** Chiều rộng (chỉ hình hộp chữ nhật) */
  b: number;
  /** Chiều cao */
  h: number;
}

/**
 * Điểm thêm vào. Bốn cách xác định (điểm phụ thuộc tự chạy theo khi hình thay đổi):
 * - trọng tâm của các điểm `of` (2 điểm = trung điểm) — không có `type`
 * - 'free': điểm tự do, tọa độ `at`
 * - 'on': nằm trên đoạn nối hai điểm `of`, vị trí `t` từ 0 đến 1
 * - 'face': nằm trên mặt đi qua ba điểm `of` = [O, I, J]: O + u·OI + v·OJ
 *           (`open`: được đi ra ngoài mặt của khối, chỉ cần thuộc mặt phẳng đó)
 * - 'line-line': giao điểm đường thẳng of[0]of[1] và of[2]of[3]
 * - 'line-plane': giao điểm đường thẳng of[0]of[1] với mặt phẳng (of[2] of[3] of[4])
 * Chỉ có ở khối tròn, với of[0] là tâm của đường tròn:
 * - 'rim': nằm trên đường tròn, góc `t` tính theo vòng (0 đến 1)
 * - 'disk': nằm trên mặt phẳng ngang qua tâm: tâm + bán kính × (u, 0, v)
 */
export type ExtraPoint = { id: string; name: string } & (
  | { type?: undefined; of: string[] }
  | { type: 'free'; of: []; at: Vec3 }
  | { type: 'on'; of: string[]; t: number }
  | { type: 'face'; of: string[]; u: number; v: number; open?: boolean }
  | { type: 'line-line' | 'line-plane'; of: string[] }
  | { type: 'rim'; of: string[]; t: number }
  | { type: 'disk'; of: string[]; u: number; v: number; open?: boolean }
);

/** Cách xác định một điểm, chưa có mã và tên */
export type PointSpec = ExtraPoint extends infer P ? (P extends ExtraPoint ? Omit<P, 'id' | 'name'> : never) : never;

/** Giới hạn tọa độ điểm tự do */
export const MAX_COORD = 15;

export interface Segment {
  id: string;
  from: string;
  to: string;
}

export interface SolidDoc {
  kind: SolidKind;
  dims: Dims;
  /** Tên đỉnh người dùng đặt lại, theo mã đỉnh */
  names: Record<string, string>;
  points: ExtraPoint[];
  segments: Segment[];
  /** Độ dời nhãn do người dùng kéo, tính theo đơn vị của hình */
  labelOffsets: Record<string, { x: number; y: number }>;
  /** Màu và trạng thái ẩn của điểm, đoạn, đường cong; khóa tạo bởi pointKey, lineKey, curveKey */
  looks: Record<string, Look>;
  /** Màu tô của các mặt; khóa tạo bởi faceKey */
  fills: Record<string, string>;
}

export interface Look {
  color?: string;
  hidden?: boolean;
}

export const pointKey = (id: string) => `p:${id}`;
export const lineKey = (a: string, b: string) => `l:${[a, b].sort().join('|')}`;
export const curveKey = (name: string) => `c:${name}`;
export const faceKey = (...ids: string[]) => `f:${[...ids].sort().join('|')}`;

/** Đổi màu hoặc ẩn/hiện một đối tượng. `color: null` là trở về màu mặc định. */
export function setLook(doc: SolidDoc, key: string, change: { color?: string | null; hidden?: boolean }): SolidDoc {
  const old = doc.looks[key] ?? {};
  const color = change.color === undefined ? old.color : (change.color ?? undefined);
  const hidden = change.hidden ?? old.hidden ?? false;
  if (color === old.color && hidden === (old.hidden ?? false)) return doc;
  const looks = { ...doc.looks };
  if (color === undefined && !hidden) delete looks[key];
  else looks[key] = { ...(color ? { color } : {}), ...(hidden ? { hidden } : {}) };
  return { ...doc, looks };
}

/** Tô hoặc bỏ tô (`color: null`) nhiều mặt cùng lúc */
export function setFills(doc: SolidDoc, keys: string[], color: string | null): SolidDoc {
  if (keys.every((key) => (doc.fills[key] ?? null) === color)) return doc;
  const fills = { ...doc.fills };
  for (const key of keys) {
    if (color) fills[key] = color;
    else delete fills[key];
  }
  return { ...doc, fills };
}

export const hasHidden = (doc: SolidDoc) => Object.values(doc.looks).some((look) => look.hidden);

/** Hiện lại mọi thứ đang ẩn, giữ nguyên màu */
export const showAll = (doc: SolidDoc): SolidDoc => Object.keys(doc.looks).reduce((d, key) => setLook(d, key, { hidden: false }), doc);

export interface SolidMesh {
  vertices: { id: string; name: string; p: Vec3 }[];
  faces: number[][];
  /** Các đỉnh của mặt đáy (để thêm tâm đáy) */
  base: number[];
  /** Đoạn vẽ sẵn của khối tròn (trục, bán kính) */
  lines: [string, string][];
  /** Có khi là khối tròn: trục đứng đi qua gốc tọa độ, đáy ở y0, đỉnh ở y1 */
  round?: RoundShape;
}

export interface RoundShape {
  type: RoundKind;
  r: number;
  y0: number;
  y1: number;
}

export const SOLIDS: { kind: SolidKind; label: string; dims: { key: keyof Dims; label: string }[] }[] = [
  { kind: 'chop-tu-giac', label: 'Chóp tứ giác đều', dims: [{ key: 'a', label: 'Cạnh đáy' }, { key: 'h', label: 'Chiều cao' }] },
  { kind: 'chop-tam-giac', label: 'Chóp tam giác đều', dims: [{ key: 'a', label: 'Cạnh đáy' }, { key: 'h', label: 'Chiều cao' }] },
  { kind: 'hop-chu-nhat', label: 'Hình hộp chữ nhật', dims: [{ key: 'a', label: 'Chiều dài' }, { key: 'b', label: 'Chiều rộng' }, { key: 'h', label: 'Chiều cao' }] },
  { kind: 'lap-phuong', label: 'Hình lập phương', dims: [{ key: 'a', label: 'Cạnh' }] },
  { kind: 'lang-tru', label: 'Lăng trụ tam giác đứng', dims: [{ key: 'a', label: 'Cạnh đáy' }, { key: 'h', label: 'Chiều cao' }] },
  { kind: 'cau', label: 'Hình cầu', dims: [{ key: 'a', label: 'Bán kính' }] },
  { kind: 'non', label: 'Hình nón', dims: [{ key: 'a', label: 'Bán kính đáy' }, { key: 'h', label: 'Chiều cao' }] },
  { kind: 'tru', label: 'Hình trụ', dims: [{ key: 'a', label: 'Bán kính đáy' }, { key: 'h', label: 'Chiều cao' }] },
];

export const MIN_DIM = 1;
export const MAX_DIM = 10;

const DEFAULT_DIMS: Record<SolidKind, Dims> = {
  'chop-tu-giac': { a: 5, b: 5, h: 5 },
  'chop-tam-giac': { a: 6, b: 6, h: 5 },
  'hop-chu-nhat': { a: 6, b: 4, h: 4 },
  'lap-phuong': { a: 4.5, b: 4.5, h: 4.5 },
  'lang-tru': { a: 5, b: 5, h: 5.5 },
  cau: { a: 3.5, b: 3.5, h: 7 },
  non: { a: 3, b: 3, h: 6 },
  tru: { a: 3, b: 3, h: 5 },
};

export function createDoc(kind: SolidKind): SolidDoc {
  return { kind, dims: { ...DEFAULT_DIMS[kind] }, names: {}, points: [], segments: [], labelOffsets: {}, looks: {}, fills: {} };
}

/**
 * Tọa độ các đỉnh (y hướng lên, z hướng về phía người nhìn).
 * Thứ tự đỉnh theo sách giáo khoa: đáy ABCD có A ở phía sau bên trái (đỉnh bị khuất).
 */
export function buildMesh(doc: SolidDoc): SolidMesh {
  const { a } = doc.dims;
  const b = doc.kind === 'hop-chu-nhat' ? doc.dims.b : a;
  const h = doc.kind === 'lap-phuong' ? a : doc.dims.h;
  const y0 = -h / 2;
  const y1 = h / 2;
  const v = (id: string, p: Vec3) => ({ id, name: doc.names[id] ?? id, p });

  const square = (y: number): Vec3[] => [
    [-a / 2, y, -b / 2],
    [-a / 2, y, b / 2],
    [a / 2, y, b / 2],
    [a / 2, y, -b / 2],
  ];
  // Tam giác đều cạnh a: B ở phía trước, cạnh AC ở phía sau
  const radius = a / Math.sqrt(3);
  const triangle = (y: number): Vec3[] => [
    [-a / 2, y, -radius / 2],
    [0, y, radius],
    [a / 2, y, -radius / 2],
  ];

  const round = (type: RoundKind, y0: number, y1: number, points: [string, Vec3][], lines: [string, string][]): SolidMesh => ({
    vertices: points.map(([id, p]) => v(id, p)),
    faces: [],
    base: [],
    lines,
    round: { type, r: a, y0, y1 },
  });

  switch (doc.kind) {
    case 'cau':
      return round('cau', -a, a, [['O', [0, 0, 0]], ['A', [-a, 0, 0]], ['B', [a, 0, 0]]], [['O', 'B']]);
    case 'non':
      return round('non', y0, y1, [['O', [0, y0, 0]], ['A', [-a, y0, 0]], ['B', [a, y0, 0]], ['S', [0, y1, 0]]], [['S', 'O'], ['O', 'B']]);
    case 'tru':
      return round(
        'tru',
        y0,
        y1,
        [['O', [0, y0, 0]], ["O'", [0, y1, 0]], ['A', [-a, y0, 0]], ['B', [a, y0, 0]], ["A'", [-a, y1, 0]], ["B'", [a, y1, 0]]],
        [['O', "O'"], ['O', 'B']],
      );
    case 'chop-tu-giac':
    case 'chop-tam-giac': {
      const ring = doc.kind === 'chop-tu-giac' ? square(y0) : triangle(y0);
      const n = ring.length;
      const base = ring.map((_, i) => i);
      return {
        vertices: [...ring.map((p, i) => v('ABCD'[i], p)), v('S', [0, y1, 0])],
        faces: [base, ...base.map((i) => [i, (i + 1) % n, n])],
        base,
        lines: [],
      };
    }
    default: {
      const ring = doc.kind === 'lang-tru' ? triangle : square;
      const bottom = ring(y0);
      const top = ring(y1);
      const n = bottom.length;
      const base = bottom.map((_, i) => i);
      return {
        vertices: [...bottom.map((p, i) => v('ABCD'[i], p)), ...top.map((p, i) => v(`${'ABCD'[i]}'`, p))],
        faces: [base, base.map((i) => i + n), ...base.map((i) => [i, (i + 1) % n, ((i + 1) % n) + n, i + n])],
        base,
        lines: [],
      };
    }
  }
}

export interface RoundCurve {
  id: 'base' | 'top' | 'equator';
  label: string;
  /** Mã điểm tâm */
  center: string;
}

/** Các đường tròn vẽ sẵn của khối tròn */
export function roundCurves(mesh: SolidMesh): RoundCurve[] {
  switch (mesh.round?.type) {
    case 'cau':
      return [{ id: 'equator', label: 'Đường tròn lớn (ngang)', center: 'O' }];
    case 'non':
      return [{ id: 'base', label: 'Đường tròn đáy', center: 'O' }];
    case 'tru':
      return [
        { id: 'base', label: 'Đường tròn đáy dưới', center: 'O' },
        { id: 'top', label: 'Đường tròn đáy trên', center: "O'" },
      ];
    default:
      return [];
  }
}

/** Nét bao quanh khối tròn, thay đổi theo góc nhìn */
export const outlineLabel = (type: RoundKind) => (type === 'cau' ? 'Đường tròn bao' : 'Đường sinh ở hai bên');

export interface SolidFace {
  key: string;
  label: string;
  /** Mã đỉnh theo thứ tự quanh mặt (chỉ khối đa diện) */
  ids?: string[];
  /** Phần của khối tròn */
  part?: 'base' | 'top' | 'side' | 'surface';
}

/** Mọi mặt tô màu được */
export function solidFaces(mesh: SolidMesh): SolidFace[] {
  const part = (name: NonNullable<SolidFace['part']>, label: string): SolidFace => ({ key: faceKey(name), label, part: name });
  switch (mesh.round?.type) {
    case 'cau':
      return [part('surface', 'Mặt cầu')];
    case 'non':
      return [part('side', 'Mặt xung quanh'), part('base', 'Mặt đáy')];
    case 'tru':
      return [part('side', 'Mặt xung quanh'), part('base', 'Đáy dưới'), part('top', 'Đáy trên')];
    default:
      return mesh.faces.map((face) => {
        const ids = face.map((i) => mesh.vertices[i].id);
        return { key: faceKey(...ids), label: `Mặt (${face.map((i) => mesh.vertices[i].name).join('')})`, ids };
      });
  }
}

export interface ScenePoint {
  id: string;
  name: string;
  p: Vec3;
  extra: boolean;
}

/** Vị trí của một điểm; null nếu không xác định được (vd: hai đường không còn cắt nhau) */
function locate(spec: PointSpec, refs: Vec3[], round?: RoundShape): Vec3 | null {
  switch (spec.type) {
    case 'rim': {
      if (!round) return null;
      const angle = spec.t * 2 * Math.PI;
      return add(refs[0], [round.r * Math.cos(angle), 0, round.r * Math.sin(angle)]);
    }
    case 'disk':
      return round ? add(refs[0], [round.r * spec.u, 0, round.r * spec.v]) : null;
    case 'free':
      return spec.at;
    case 'on':
      return lerp(refs[0], refs[1], spec.t);
    case 'face': {
      const [o, i, j] = refs;
      return add(o, add(scale(sub(i, o), spec.u), scale(sub(j, o), spec.v)));
    }
    case 'line-line': {
      const hit = intersectLines(refs[0], refs[1], refs[2], refs[3]);
      return hit.ok ? hit.p : null;
    }
    case 'line-plane': {
      const hit = intersectLinePlane(refs[0], refs[1], refs[2], refs[3], refs[4]);
      return hit.ok ? hit.p : null;
    }
    default:
      return scale(refs.reduce(add, [0, 0, 0] as Vec3), 1 / refs.length);
  }
}

/** Số điểm tham chiếu mỗi loại điểm cần có */
export const refCountOk = (type: ExtraPoint['type'], count: number) =>
  type === undefined ? count >= 2 : count === { free: 0, on: 2, face: 3, 'line-line': 4, 'line-plane': 5, rim: 1, disk: 1 }[type];

/** Tọa độ mọi điểm: đỉnh của khối và các điểm thêm vào (điểm sau có thể tham chiếu điểm trước) */
export function resolvePoints(doc: SolidDoc, mesh: SolidMesh = buildMesh(doc)): ScenePoint[] {
  const out: ScenePoint[] = mesh.vertices.map((v) => ({ ...v, extra: false }));
  const byId = new Map(out.map((p) => [p.id, p]));
  for (const extra of doc.points) {
    const refs = (extra.of as string[]).map((id) => byId.get(id));
    if (!refCountOk(extra.type, refs.length) || refs.some((r) => !r)) continue;
    const p = locate(extra, refs.map((r) => r!.p), mesh.round);
    if (!p) continue;
    const point = { id: extra.id, name: extra.name, p, extra: true };
    out.push(point);
    byId.set(point.id, point);
  }
  return out;
}

const samePlace = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-6;

const nextName = (used: Set<string>, preferred: string[]) => {
  for (const name of preferred) if (!used.has(name)) return name;
  for (let i = 1; ; i++) if (!used.has(`M${i}`)) return `M${i}`;
};

const POINT_NAMES = ['M', 'N', 'P', 'Q', 'I', 'J', 'K', 'E', 'F', 'H'];

export interface AddResult {
  doc: SolidDoc;
  /** Mã điểm vừa thêm, hoặc điểm đã có sẵn ở vị trí đó */
  id: string | null;
  added: boolean;
}

/** Thêm một điểm. Không thêm nếu không xác định được vị trí hoặc chỗ đó đã có điểm. */
export function addPoint(doc: SolidDoc, spec: PointSpec, preferred: string[] = POINT_NAMES): AddResult {
  const mesh = buildMesh(doc);
  const points = resolvePoints(doc, mesh);
  const refs = (spec.of as string[]).map((id) => points.find((p) => p.id === id));
  const failed = { doc, id: null, added: false };
  if (!refCountOk(spec.type, refs.length) || refs.some((r) => !r)) return failed;
  const p = locate(spec, refs.map((r) => r!.p), mesh.round);
  if (!p) return failed;
  const existing = points.find((q) => samePlace(q.p, p));
  if (existing) return { doc, id: existing.id, added: false };
  const used = new Set([...points.map((q) => q.name), ...doc.points.map((q) => q.name)]);
  let n = doc.points.length + 1;
  while (doc.points.some((q) => q.id === `p${n}`)) n++;
  const point = { ...spec, id: `p${n}`, name: nextName(used, preferred) } as ExtraPoint;
  return { doc: { ...doc, points: [...doc.points, point] }, id: point.id, added: true };
}

/** Thêm trung điểm (2 điểm) hoặc tâm (3 điểm trở lên). Trả về doc cũ nếu chỗ đó đã có điểm. */
export function addCenterPoint(doc: SolidDoc, of: string[]): SolidDoc {
  if (new Set(of).size < 2) return doc;
  return addPoint(doc, { of: [...of] }, of.length > 2 ? ['O', 'G', 'H', 'I'] : POINT_NAMES).doc;
}

/** Thêm tâm mặt đáy */
export function addBaseCenter(doc: SolidDoc): SolidDoc {
  const mesh = buildMesh(doc);
  return addCenterPoint(doc, mesh.base.map((i) => mesh.vertices[i].id));
}

/** Đổi vị trí điểm tự do, điểm trên đoạn hoặc điểm trên mặt */
export function movePoint(doc: SolidDoc, id: string, change: { at?: Vec3; t?: number; u?: number; v?: number }): SolidDoc {
  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
  return {
    ...doc,
    points: doc.points.map((p) => {
      if (p.id !== id) return p;
      if (p.type === 'free' && change.at) return { ...p, at: change.at.map((n) => clamp(n, -MAX_COORD, MAX_COORD)) as Vec3 };
      if (p.type === 'on' && change.t !== undefined) return { ...p, t: clamp(change.t, 0, 1) };
      if (p.type === 'face' || p.type === 'disk') return { ...p, u: change.u ?? p.u, v: change.v ?? p.v };
      // Góc trên đường tròn đi vòng quanh được
      if (p.type === 'rim' && change.t !== undefined) return { ...p, t: ((change.t % 1) + 1) % 1 };
      return p;
    }),
  };
}

export type IntersectProblem = 'parallel' | 'skew' | 'same' | 'in-plane' | 'degenerate';
export type Intersection = { ok: true; p: Vec3; t: number; s: number } | { ok: false; reason: IntersectProblem };

/** Giao điểm hai đường thẳng AB và CD trong không gian; t, s là vị trí trên AB và CD */
export function intersectLines(a: Vec3, b: Vec3, c: Vec3, d: Vec3): Intersection {
  const u = sub(b, a);
  const v = sub(d, c);
  const w = sub(c, a);
  if (length(u) < 1e-9 || length(v) < 1e-9) return { ok: false, reason: 'degenerate' };
  const n = cross(u, v);
  const n2 = dot(n, n);
  if (n2 < 1e-12 * dot(u, u) * dot(v, v)) {
    return { ok: false, reason: length(cross(w, u)) < 1e-6 * length(u) ? 'same' : 'parallel' };
  }
  // Khoảng cách giữa hai đường: khác 0 nghĩa là chéo nhau
  if (Math.abs(dot(w, n)) / Math.sqrt(n2) > 1e-6) return { ok: false, reason: 'skew' };
  const t = dot(cross(w, v), n) / n2;
  const s = dot(cross(w, u), n) / n2;
  return { ok: true, p: add(a, scale(u, t)), t, s };
}

/** Giao điểm đường thẳng AB với mặt phẳng (CDE); t là vị trí trên AB */
export function intersectLinePlane(a: Vec3, b: Vec3, c: Vec3, d: Vec3, e: Vec3): Intersection {
  const u = sub(b, a);
  const n = cross(sub(d, c), sub(e, c));
  if (length(u) < 1e-9 || length(n) < 1e-9) return { ok: false, reason: 'degenerate' };
  const speed = dot(n, u);
  const room = dot(n, sub(c, a));
  if (Math.abs(speed) < 1e-9 * length(n) * length(u)) {
    return { ok: false, reason: Math.abs(room) < 1e-6 * length(n) ? 'in-plane' : 'parallel' };
  }
  const t = room / speed;
  return { ok: true, p: add(a, scale(u, t)), t, s: 0 };
}

/** Các cặp đỉnh đã được vẽ sẵn: cạnh của khối đa diện, trục và bán kính của khối tròn */
export function meshEdges(mesh: SolidMesh): [string, string][] {
  const seen = new Map<string, [string, string]>();
  for (const face of mesh.faces) {
    face.forEach((i, k) => {
      const j = face[(k + 1) % face.length];
      const [lo, hi] = i < j ? [i, j] : [j, i];
      seen.set(`${lo}-${hi}`, [mesh.vertices[lo].id, mesh.vertices[hi].id]);
    });
  }
  return [...seen.values(), ...mesh.lines];
}

/** Nối hai điểm. Bỏ qua nếu trùng cạnh của khối hoặc đoạn đã có. */
export function addSegment(doc: SolidDoc, from: string, to: string): SolidDoc {
  if (from === to) return doc;
  const same = (x: string, y: string) => (x === from && y === to) || (x === to && y === from);
  if (meshEdges(buildMesh(doc)).some(([x, y]) => same(x, y))) return doc;
  if (doc.segments.some((s) => same(s.from, s.to))) return doc;
  let n = doc.segments.length + 1;
  while (doc.segments.some((s) => s.id === `s${n}`)) n++;
  return { ...doc, segments: [...doc.segments, { id: `s${n}`, from, to }] };
}

/** Xóa điểm thêm vào cùng mọi điểm và đoạn phụ thuộc vào nó */
export function removePoint(doc: SolidDoc, id: string): SolidDoc {
  const gone = new Set([id]);
  for (const p of doc.points) if ((p.of as string[]).some((ref) => gone.has(ref))) gone.add(p.id);
  const labelOffsets = Object.fromEntries(Object.entries(doc.labelOffsets).filter(([key]) => !gone.has(key)));
  // Mã điểm có thể được dùng lại, nên phải bỏ cả màu và trạng thái ẩn của những thứ vừa xóa
  const looks = Object.fromEntries(Object.entries(doc.looks).filter(([key]) => !key.slice(2).split('|').some((ref) => gone.has(ref))));
  return {
    ...doc,
    points: doc.points.filter((p) => !gone.has(p.id)),
    segments: doc.segments.filter((s) => !gone.has(s.from) && !gone.has(s.to)),
    labelOffsets,
    looks,
  };
}

export function removeSegment(doc: SolidDoc, id: string): SolidDoc {
  const segment = doc.segments.find((s) => s.id === id);
  if (!segment) return doc;
  const looks = { ...doc.looks };
  delete looks[lineKey(segment.from, segment.to)];
  return { ...doc, segments: doc.segments.filter((s) => s.id !== id), looks };
}

/* ------------------------------ Lịch sử ------------------------------ */

export interface History {
  past: SolidDoc[];
  doc: SolidDoc;
  future: SolidDoc[];
  lastKey: string | null;
  lastTime: number;
}

export type HistoryAction =
  | { type: 'change'; update: (doc: SolidDoc) => SolidDoc; key?: string; time: number }
  | { type: 'undo' }
  | { type: 'redo' };

export const initHistory = (doc: SolidDoc): History => ({ past: [], doc, future: [], lastKey: null, lastTime: 0 });

export function historyReducer(state: History, action: HistoryAction): History {
  if (action.type === 'undo') {
    if (state.past.length === 0) return state;
    return { past: state.past.slice(0, -1), doc: state.past[state.past.length - 1], future: [state.doc, ...state.future], lastKey: null, lastTime: 0 };
  }
  if (action.type === 'redo') {
    if (state.future.length === 0) return state;
    return { past: [...state.past, state.doc], doc: state.future[0], future: state.future.slice(1), lastKey: null, lastTime: 0 };
  }
  const doc = action.update(state.doc);
  if (doc === state.doc) return state;
  // Kéo thanh trượt, kéo nhãn, gõ tên: gộp các thay đổi liên tiếp cùng loại thành một bước hoàn tác
  const merge = action.key !== undefined && action.key === state.lastKey && action.time - state.lastTime < 800;
  return {
    past: merge ? state.past : [...state.past, state.doc].slice(-100),
    doc,
    future: [],
    lastKey: action.key ?? null,
    lastTime: action.time,
  };
}
