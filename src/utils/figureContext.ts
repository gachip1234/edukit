/**
 * Ngữ cảnh "vẽ tiếp" cho khung chat Gemini.
 *
 * - canvasToFigureSpec: đọc hình đang có trên bảng (điểm, đoạn, đa giác, đường tròn,
 *   đường thẳng/tia, ký hiệu góc) thành dữ liệu hình học giống định dạng AI trả về.
 * - mergeFigures: gộp phần AI vẽ thêm vào hình cũ (điểm cũ giữ nguyên tọa độ).
 * - describeFigureForPrompt: tóm tắt hình cũ gửi kèm yêu cầu mới cho AI.
 */
import type { GeoElement, PointElement } from '../types/geometry';
import { UNIT_STEP } from './coordinateSystem';

export interface FigureSpec {
  points: { name: string; x: number; y: number; label?: string }[];
  circles: { name: string; center: string; r: number }[];
  segments: { from: string; to: string; dashed?: boolean }[];
  polygons: { vertices: string[]; fill?: string; stroke?: string }[];
  lines: {
    from?: string;
    through?: string;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
    isRay?: boolean;
    startLabel?: string;
    endLabel?: string;
    dashed?: boolean;
  }[];
  angles: { vertex: string; p1: string; p2: string; isRight?: boolean }[];
  commands?: any[];
  [key: string]: any;
}

export interface CanvasFigure {
  spec: FigureSpec;
  /** Các đối tượng không chuyển được thành dữ liệu hình học (vd: chữ/LaTeX) — giữ nguyên trên bảng */
  untouched: GeoElement[];
}

const round = (v: number) => Math.round(v * 100) / 100;

/**
 * Chuyển hình trên bảng vẽ thành dữ liệu hình học (tọa độ toán học, 1 đơn vị = 50px).
 * `origin`: vị trí gốc trục Oxy trên màn hình, để tọa độ gửi AI khớp với trục tọa độ đang hiển thị.
 */
export function canvasToFigureSpec(elements: GeoElement[], origin: { x: number; y: number } = { x: 0, y: 0 }): CanvasFigure {
  const spec: FigureSpec = { points: [], circles: [], segments: [], polygons: [], lines: [], angles: [] };
  const untouched: GeoElement[] = [];
  const toMath = (x: number, y: number) => ({ x: round((x - origin.x) / UNIT_STEP), y: round((origin.y - y) / UNIT_STEP) });

  // 1. Điểm: điểm có tên giữ tên; điểm không tên đặt tên ẩn _P1, _P2... (nhãn rỗng để không hiện)
  const named: { name: string; x: number; y: number }[] = [];
  const usedNames = new Set<string>();
  let anon = 0;
  const newAnonName = () => {
    let n: string;
    do n = `_P${++anon}`;
    while (usedNames.has(n));
    return n;
  };
  const addPoint = (x: number, y: number, label?: string) => {
    let name = (label || '').trim();
    const hidden = !name;
    if (!name || usedNames.has(name)) name = hidden ? newAnonName() : `${name}${++anon}`;
    usedNames.add(name);
    named.push({ name, x, y });
    const m = toMath(x, y);
    spec.points.push({ name, x: m.x, y: m.y, ...(hidden ? { label: '' } : {}) });
    return name;
  };
  for (const el of elements) {
    if (el.type === 'point') addPoint(el.x, el.y, (el as PointElement).label);
  }
  /** Tìm điểm trùng vị trí (sai số 4px); không có thì tạo điểm ẩn tên */
  const pointAt = (x: number, y: number) => {
    const hit = named.find((p) => Math.hypot(p.x - x, p.y - y) < 4);
    return hit ? hit.name : addPoint(x, y);
  };

  // 2. Các đối tượng còn lại
  for (const el of elements) {
    switch (el.type) {
      case 'point':
        break;
      case 'segment':
        spec.segments.push({
          from: pointAt(el.x1, el.y1),
          to: pointAt(el.x2, el.y2),
          ...(el.strokeStyle === 'dashed' ? { dashed: true } : {}),
        });
        break;
      case 'polygon': {
        const vertices: string[] = [];
        for (let i = 0; i + 1 < el.points.length; i += 2) vertices.push(pointAt(el.points[i], el.points[i + 1]));
        if (vertices.length >= 3) spec.polygons.push({ vertices, fill: el.fill, stroke: el.stroke });
        break;
      }
      case 'circle': {
        const center = pointAt(el.cx, el.cy);
        spec.circles.push({ name: `c_${center}`, center, r: round(el.radius / UNIT_STEP) });
        break;
      }
      case 'line': {
        // Dùng điểm có tên nếu đường đi qua đúng điểm đó, nếu không thì giữ tọa độ
        const fromHit = named.find((p) => Math.hypot(p.x - el.x1, p.y - el.y1) < 4);
        const throughHit = named.find((p) => Math.hypot(p.x - el.x2, p.y - el.y2) < 4);
        const a = toMath(el.x1, el.y1);
        const b = toMath(el.x2, el.y2);
        spec.lines.push({
          ...(fromHit ? { from: fromHit.name } : { x1: a.x, y1: a.y }),
          ...(throughHit ? { through: throughHit.name } : { x2: b.x, y2: b.y }),
          ...(el.isRay ? { isRay: true } : {}),
          ...(el.startLabel ? { startLabel: el.startLabel } : {}),
          ...(el.endLabel ? { endLabel: el.endLabel } : {}),
          ...(el.strokeStyle === 'dashed' ? { dashed: true } : {}),
        });
        break;
      }
      case 'angle':
      case 'right_angle': {
        const vertex = named.find((p) => Math.hypot(p.x - el.vx, p.y - el.vy) < 4)?.name;
        // Hai cạnh góc: tìm điểm có tên nằm trên tia từ đỉnh theo hướng p1 / p2
        const onArm = (ax: number, ay: number) => {
          const ux = ax - el.vx;
          const uy = ay - el.vy;
          const len = Math.hypot(ux, uy) || 1;
          return named.find((p) => {
            if (p.name === vertex) return false;
            const px = p.x - el.vx;
            const py = p.y - el.vy;
            const along = (px * ux + py * uy) / len;
            const off = Math.abs(px * uy - py * ux) / len;
            return along > 1 && off < 4;
          })?.name;
        };
        const p1 = onArm(el.p1x, el.p1y);
        const p2 = onArm(el.p2x, el.p2y);
        if (vertex && p1 && p2) spec.angles.push({ vertex, p1, p2, isRight: el.type === 'right_angle' });
        else untouched.push(el);
        break;
      }
      default:
        untouched.push(el);
    }
  }
  return { spec, untouched };
}

/** Gộp phần AI vẽ thêm vào hình cũ: điểm/đường tròn cũ giữ nguyên, các đối tượng mới được nối thêm */
export function mergeFigures(base: FigureSpec, addition: any): FigureSpec {
  const add = addition && typeof addition === 'object' ? addition : {};
  const merged: FigureSpec = {
    ...add,
    points: [...base.points],
    circles: [...base.circles],
    segments: [...base.segments],
    polygons: [...base.polygons],
    lines: [...base.lines],
    angles: [...base.angles],
    commands: [...(base.commands || [])],
  };
  const pointNames = new Set(merged.points.map((p) => p.name));
  for (const p of Array.isArray(add.points) ? add.points : []) {
    const name = String(p?.name || p?.label || '').trim();
    if (name && !pointNames.has(name)) {
      merged.points.push(p);
      pointNames.add(name);
    }
  }
  for (const c of Array.isArray(add.circles) ? add.circles : []) {
    const same = merged.circles.some((o) => o.center === c?.center && Math.abs(o.r - Number(c?.r ?? c?.radius)) < 0.01);
    if (c && !same) merged.circles.push(c);
  }
  const polyKey = (v: string[]) => [...v].sort().join(',');
  const polyKeys = new Set(merged.polygons.map((p) => polyKey(p.vertices)));
  for (const p of Array.isArray(add.polygons) ? add.polygons : []) {
    const v = Array.isArray(p?.vertices) ? p.vertices.map(String) : [];
    if (v.length >= 3 && !polyKeys.has(polyKey(v))) {
      merged.polygons.push(p);
      polyKeys.add(polyKey(v));
    }
  }
  if (Array.isArray(add.segments)) merged.segments.push(...add.segments);
  if (Array.isArray(add.lines)) merged.lines.push(...add.lines);
  if (Array.isArray(add.angles)) merged.angles.push(...add.angles);
  if (Array.isArray(add.commands)) merged.commands!.push(...add.commands);
  return merged;
}

/** Tóm tắt hình cũ (gọn, dễ đọc) để gửi kèm yêu cầu mới cho AI */
export function describeFigureForPrompt(spec: FigureSpec): string {
  const pts = spec.points.filter((p) => !p.name.startsWith('_'));
  const lines: string[] = [];
  if (pts.length) lines.push(`- Điểm (tọa độ Oxy): ${pts.map((p) => `${p.name}(${p.x}, ${p.y})`).join(', ')}`);
  const segs = spec.segments.filter((s) => !s.from.startsWith('_') && !s.to.startsWith('_'));
  if (segs.length) lines.push(`- Đoạn thẳng: ${segs.map((s) => s.from + s.to + (s.dashed ? ' (nét đứt)' : '')).join(', ')}`);
  if (spec.polygons.length) lines.push(`- Đa giác: ${spec.polygons.map((p) => p.vertices.join('')).join(', ')}`);
  if (spec.circles.length) lines.push(`- Đường tròn: ${spec.circles.map((c) => `(${c.center}; R = ${c.r})`).join(', ')}`);
  const named = spec.lines.filter((l) => l.endLabel || l.startLabel || (l.from && l.through));
  if (named.length) {
    lines.push(
      `- Đường thẳng / tia: ${named
        .map((l) =>
          l.isRay
            ? `tia ${l.from && !l.from.startsWith('_') ? l.from : ''}${l.endLabel || l.through || ''}`
            : `đường thẳng ${l.startLabel && l.endLabel ? l.startLabel + l.endLabel : l.endLabel || `${l.from}${l.through}`}`,
        )
        .join(', ')}`,
    );
  }
  if (spec.angles.length) lines.push(`- Ký hiệu góc: ${spec.angles.map((a) => `${a.isRight ? 'góc vuông ' : 'góc '}${a.p1}${a.vertex}${a.p2}`).join(', ')}`);
  return lines.join('\n');
}
