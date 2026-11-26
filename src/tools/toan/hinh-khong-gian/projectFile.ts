/** Lưu và mở tệp hình không gian (.edukit3d) */
import { MAX_COORD, MAX_DIM, MIN_DIM, SOLIDS, addSegment, buildMesh, createDoc, curveKey, lineKey, meshEdges, pointKey, refCountOk, roundCurves, setFills, setLook, solidFaces, type ExtraPoint, type SolidDoc, type Vec3 } from './model';
import { SGK_VIEW, type View } from './scene';

const APP_NAME = 'EduKit Solid';

export const serializeProject = (doc: SolidDoc, view: View) =>
  JSON.stringify({ appName: APP_NAME, version: '1.0', doc, view }, null, 2);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const text = (v: unknown) => (typeof v === 'string' ? v.slice(0, 12) : null);
const colorOf = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null);

/** Đọc một điểm thêm vào; null nếu thiếu dữ liệu */
function parsePoint(item: Record<string, unknown>, known: Set<string>): ExtraPoint | null {
  const { id, type } = item;
  if (typeof id !== 'string' || known.has(id) || !Array.isArray(item.of)) return null;
  const of = item.of.filter((r): r is string => typeof r === 'string' && known.has(r));
  if (of.length !== item.of.length) return null;
  const base = { id, name: text(item.name) ?? 'M' };
  const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  switch (type) {
    case undefined:
      return refCountOk(type, of.length) ? { ...base, of } : null;
    case 'free': {
      const at = item.at;
      if (!Array.isArray(at) || at.length !== 3 || !at.every(number)) return null;
      return { ...base, type, of: [], at: at.map((n) => finite(n, 0, -MAX_COORD, MAX_COORD)) as Vec3 };
    }
    case 'on':
      return refCountOk(type, of.length) && number(item.t) ? { ...base, type, of, t: finite(item.t, 0.5, 0, 1) } : null;
    case 'face':
      return refCountOk(type, of.length) && number(item.u) && number(item.v)
        ? { ...base, type, of, u: finite(item.u, 0, -50, 50), v: finite(item.v, 0, -50, 50), ...(item.open === true ? { open: true } : {}) }
        : null;
    case 'rim':
      return refCountOk(type, of.length) && number(item.t) ? { ...base, type, of, t: finite(item.t, 0, 0, 1) } : null;
    case 'disk':
      return refCountOk(type, of.length) && number(item.u) && number(item.v)
        ? { ...base, type, of, u: finite(item.u, 0, -50, 50), v: finite(item.v, 0, -50, 50), ...(item.open === true ? { open: true } : {}) }
        : null;
    case 'line-line':
    case 'line-plane':
      return refCountOk(type, of.length) ? { ...base, type, of } : null;
    default:
      return null;
  }
}

/** Đọc nội dung tệp, chỉ giữ lại dữ liệu hợp lệ. Ném lỗi nếu không phải tệp hình không gian. */
export function parseProject(content: string): { doc: SolidDoc; view: View } {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    throw new Error('Tệp bị lỗi, không đọc được');
  }
  if (!isRecord(data) || data.appName !== APP_NAME || !isRecord(data.doc)) {
    throw new Error('Đây không phải tệp hình không gian (.edukit3d)');
  }
  const raw = data.doc;
  const solid = SOLIDS.find((s) => s.kind === raw.kind);
  if (!solid) throw new Error('Tệp chứa loại khối chưa được hỗ trợ');

  let doc = createDoc(solid.kind);
  const dims = isRecord(raw.dims) ? raw.dims : {};
  doc.dims = {
    a: finite(dims.a, doc.dims.a, MIN_DIM, MAX_DIM),
    b: finite(dims.b, doc.dims.b, MIN_DIM, MAX_DIM),
    h: finite(dims.h, doc.dims.h, MIN_DIM, MAX_DIM),
  };
  if (isRecord(raw.names)) {
    for (const [id, name] of Object.entries(raw.names)) if (text(name) !== null) doc.names[id] = text(name)!;
  }
  // Mã đã biết gồm cả điểm đang tạm không xác định (vd: giao điểm của hai đường không còn cắt nhau)
  const known = new Set(buildMesh(doc).vertices.map((v) => v.id));
  for (const item of Array.isArray(raw.points) ? raw.points : []) {
    const point = isRecord(item) ? parsePoint(item, known) : null;
    if (!point) continue;
    doc.points.push(point);
    known.add(point.id);
  }
  for (const item of Array.isArray(raw.segments) ? raw.segments : []) {
    if (isRecord(item) && typeof item.from === 'string' && typeof item.to === 'string' && known.has(item.from) && known.has(item.to)) {
      doc = addSegment(doc, item.from, item.to);
    }
  }
  if (isRecord(raw.labelOffsets)) {
    for (const [id, o] of Object.entries(raw.labelOffsets)) {
      if (known.has(id) && isRecord(o)) doc.labelOffsets[id] = { x: finite(o.x, 0, -20, 20), y: finite(o.y, 0, -20, 20) };
    }
  }

  // Màu và trạng thái ẩn: chỉ nhận khóa của những thứ có trên hình
  const mesh = buildMesh(doc);
  const looked = new Set([
    ...[...known].map(pointKey),
    ...[...meshEdges(mesh), ...doc.segments.map((s) => [s.from, s.to] as const)].map(([a, b]) => lineKey(a, b)),
    ...(mesh.round ? [...roundCurves(mesh).map((c) => curveKey(c.id)), curveKey('outline')] : []),
  ]);
  for (const [key, look] of Object.entries(isRecord(raw.looks) ? raw.looks : {})) {
    if (looked.has(key) && isRecord(look)) doc = setLook(doc, key, { color: colorOf(look.color), hidden: look.hidden === true });
  }
  const fills = isRecord(raw.fills) ? raw.fills : {};
  for (const { key } of solidFaces(mesh)) {
    const color = colorOf(fills[key]);
    if (color) doc = setFills(doc, [key], color);
  }

  const v = isRecord(data.view) ? data.view : {};
  const view: View = {
    mode: v.mode === 'free' ? 'free' : 'sgk',
    yaw: finite(v.yaw, SGK_VIEW.yaw, -180, 180),
    tilt: finite(v.tilt, SGK_VIEW.tilt, -60, 60),
  };
  return { doc, view };
}
