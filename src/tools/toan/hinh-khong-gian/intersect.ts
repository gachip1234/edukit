/** Công cụ giao điểm: gom dần các lựa chọn (đường, điểm, mặt) rồi dựng giao điểm. */
import {
  MAX_COORD,
  addPoint,
  addSegment,
  intersectLinePlane,
  intersectLines,
  resolvePoints,
  type IntersectProblem,
  type SolidDoc,
} from './model';

export type IntersectMode = 'line-line' | 'line-plane';

export interface IntersectPick {
  /** Đường thẳng thứ nhất đã chọn xong */
  first: [string, string] | null;
  /** Các điểm đang chọn dở cho đối tượng tiếp theo */
  points: string[];
}

export const EMPTY_PICK: IntersectPick = { first: null, points: [] };

export type PickInput = { point: string } | { line: [string, string] } | { face: string[] };

export type PickResult =
  | { done: false; pick: IntersectPick; message?: string }
  | { done: true; doc: SolidDoc; message: string; error: boolean };

const PREFERRED = ['I', 'J', 'K', 'M', 'N', 'P', 'Q', 'E', 'F', 'H'];
const MAX_REACH = MAX_COORD * 2;

export function intersectHint(mode: IntersectMode, pick: IntersectPick): string {
  if (!pick.first) {
    return pick.points.length === 0 ? 'Đường thứ nhất: bấm một cạnh/đoạn, hoặc hai điểm' : 'Đường thứ nhất: bấm điểm thứ hai';
  }
  if (mode === 'line-line') {
    return pick.points.length === 0 ? 'Đường thứ hai: bấm một cạnh/đoạn, hoặc hai điểm' : 'Đường thứ hai: bấm điểm thứ hai';
  }
  return pick.points.length === 0 ? 'Mặt phẳng: bấm một mặt của khối, hoặc ba điểm' : `Mặt phẳng: còn ${3 - pick.points.length} điểm`;
}

export function applyPick(doc: SolidDoc, mode: IntersectMode, pick: IntersectPick, input: PickInput): PickResult {
  const stay = (next: IntersectPick, message?: string): PickResult => ({ done: false, pick: next, message });
  const wantsPlane = pick.first !== null && mode === 'line-plane';

  if ('point' in input) {
    if (pick.points.includes(input.point)) return stay({ ...pick, points: pick.points.filter((id) => id !== input.point) });
    const points = [...pick.points, input.point];
    if (points.length < (wantsPlane ? 3 : 2)) return stay({ ...pick, points });
    if (!pick.first) return stay({ first: [points[0], points[1]], points: [] });
    return solve(doc, pick.first, points);
  }
  if ('line' in input) {
    if (!pick.first) return stay({ first: input.line, points: [] });
    if (wantsPlane) return stay(pick, 'Hãy chọn mặt phẳng: bấm một mặt của khối hoặc ba điểm');
    return solve(doc, pick.first, input.line);
  }
  if (wantsPlane) return solve(doc, pick.first!, input.face.slice(0, 3));
  return stay(pick);
}

const PROBLEMS: Record<'line-line' | 'line-plane', Record<IntersectProblem, string>> = {
  'line-line': {
    parallel: 'Hai đường thẳng này song song, không có giao điểm',
    skew: 'Hai đường thẳng này chéo nhau, không cắt nhau',
    same: 'Hai đường vừa chọn trùng nhau',
    'in-plane': 'Hai đường vừa chọn trùng nhau',
    degenerate: 'Hai điểm trùng vị trí, chưa xác định được đường thẳng',
  },
  'line-plane': {
    parallel: 'Đường thẳng song song với mặt phẳng, không có giao điểm',
    skew: 'Không có giao điểm',
    same: 'Đường thẳng nằm trong mặt phẳng',
    'in-plane': 'Đường thẳng nằm trong mặt phẳng',
    degenerate: 'Ba điểm này thẳng hàng, chưa xác định được mặt phẳng',
  },
};

/** `other` gồm 2 điểm (đường thứ hai) hoặc 3 điểm (mặt phẳng) */
function solve(doc: SolidDoc, first: [string, string], other: string[]): PickResult {
  const type = other.length === 3 ? 'line-plane' : 'line-line';
  const points = resolvePoints(doc);
  const of = [...first, ...other];
  const found = of.map((id) => points.find((p) => p.id === id));
  const fail = (message: string): PickResult => ({ done: true, doc, message, error: true });
  if (found.some((p) => !p)) return fail('Không tìm thấy điểm đã chọn');
  const [a, b, c, d, e] = found.map((p) => p!.p);
  const hit = type === 'line-line' ? intersectLines(a, b, c, d) : intersectLinePlane(a, b, c, d, e);
  if (!hit.ok) return fail(PROBLEMS[type][hit.reason]);
  if (hit.p.some((n) => Math.abs(n) > MAX_REACH)) return fail('Giao điểm ở quá xa hình, không vẽ được');

  const result = addPoint(doc, { type, of }, PREFERRED);
  if (!result.id) return fail('Không dựng được giao điểm');
  const nameOf = (id: string) => resolvePoints(result.doc).find((p) => p.id === id)?.name ?? '?';

  // Vẽ các đường vừa chọn; giao điểm nằm ngoài đoạn thì vẽ thêm phần kéo dài
  let next = result.doc;
  const draw = (from: string, to: string, t: number) => {
    next = addSegment(next, from, to);
    if (t < -1e-6) next = addSegment(next, from, result.id!);
    else if (t > 1 + 1e-6) next = addSegment(next, to, result.id!);
  };
  draw(first[0], first[1], hit.t);
  if (type === 'line-line') draw(other[0], other[1], hit.s);

  const name = nameOf(result.id);
  if (!result.added) {
    return { done: true, doc: next, message: `Giao điểm trùng với điểm ${name} đã có`, error: next === doc };
  }
  return { done: true, doc: next, message: `Đã dựng giao điểm ${name}`, error: false };
}
