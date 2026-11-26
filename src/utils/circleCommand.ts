/**
 * Lệnh vẽ đường tròn bằng tiếng Việt: đọc câu lệnh thành dữ liệu, rồi dựng trên bảng vẽ.
 *
 * Nhận các dạng như:
 *   "vẽ đường tròn tâm A bán kính AB"      "đường tròn (A; AB)"
 *   "đường tròn tâm O bán kính 3,5"        "đường tròn tâm I(1; 2) bán kính 4"
 *   "đường tròn tâm M đi qua N"            "đường tròn đường kính AB"
 *   "đường tròn đi qua ba điểm A, B, C"
 *
 * Chỉ nhận khi hiểu TRỌN câu; câu có thêm yêu cầu khác trả về null để nơi khác (AI) xử lý.
 */
import type { CircleElement, GeoElement, PointElement, StrokeStyle } from '../types/geometry';
import { mathToScreen, UNIT_STEP } from './coordinateSystem';

export type CircleRadius =
  | { kind: 'default' }
  | { kind: 'value'; value: number }
  | { kind: 'segment'; a: string; b: string; factor: number }
  | { kind: 'through'; points: string[] }
  | { kind: 'diameter'; a: string; b: string };

export interface CircleCommand {
  center?: { name: string; at?: { x: number; y: number } };
  radius: CircleRadius;
  stroke?: string;
  strokeStyle?: StrokeStyle;
}

const DEFAULT_RADIUS = 3;

// Tên điểm: một chữ cái, có thể kèm dấu phẩy trên hoặc chỉ số (A, O', I1)
const NAME = "[A-Za-z](?:['′]|[0-9])?";
const END = "(?![\\p{L}\\p{N}'′])";
const NUM = '\\d+(?:[.,]\\d+)?';
const UNIT = `(?:\\s*(?:cm|đơn vị|đv)${END})?`;
const SEGMENT_WORDS = '(?:(?:độ dài\\s+)?(?:đoạn(?:\\s+thẳng)?|cạnh)\\s+|độ dài\\s+)?';

const re = (source: string) => new RegExp(`^${source}`, 'iu');
const toNumber = (s: string) => parseFloat(s.replace(',', '.'));
const toName = (s: string) => s.toUpperCase().replace('′', "'");

const COLORS: Record<string, string> = {
  'đỏ': '#dc2626',
  'xanh dương': '#2563eb',
  'xanh lá': '#16a34a',
  'xanh': '#2563eb',
  'cam': '#ea580c',
  'vàng': '#d97706',
  'tím': '#9333ea',
  'hồng': '#db2777',
  'đen': '#0f172a',
};

/** Đọc phần giá trị bán kính: số, "AB", "2AB", "AB/2", "nửa AB" hoặc chữ R */
function readRadius(text: string): { radius: CircleRadius; length: number } | null {
  // Sau con số không được là phép tính hay tên điểm, tên đoạn ("2AB", "2 R")
  const value = text.match(re(`(${NUM})(?![.,]?\\d)${UNIT}(?!\\s*(?:[/*×:^+\\-]|\\.\\s*[A-Za-z]|(?:độ dài|đoạn|cạnh)${END}|(?:${NAME}\\s?)?${NAME}${END}))`));
  if (value) return { radius: { kind: 'value', value: toNumber(value[1]) }, length: value[0].length };

  const segment = text.match(
    re(`(?:(nửa)\\s+|(${NUM})\\s*[.*×]?\\s*)?${SEGMENT_WORDS}(${NAME})\\s?(${NAME})${END}(?:\\s*[/:]\\s*(${NUM}))?`),
  );
  if (segment) {
    const [all, half, times, a, b, divide] = segment;
    // Biểu thức dài hơn (AB + 1...) thì không tự hiểu
    if (/^\s*[+\-*/×:^]/.test(text.slice(all.length))) return null;
    const factor = ((half ? 0.5 : 1) * (times ? toNumber(times) : 1)) / (divide ? toNumber(divide) : 1);
    if (!(factor > 0 && Number.isFinite(factor)) || toName(a) === toName(b)) return null;
    return { radius: { kind: 'segment', a: toName(a), b: toName(b), factor }, length: all.length };
  }

  const symbol = text.match(re(`r${END}(?!\\s*=)`));
  return symbol ? { radius: { kind: 'default' }, length: symbol[0].length } : null;
}

export function parseCircleCommand(prompt: string): CircleCommand | null {
  let rest = prompt.normalize('NFC').replace(/\s+/g, ' ').trim().replace(/[\s.!]+$/, '');
  /** Bỏ phần đầu câu khớp mẫu và trả về kết quả khớp */
  const take = (source: string) => {
    const m = rest.match(re(source));
    if (m) rest = rest.slice(m[0].length);
    return m;
  };

  take('(?:(?:hãy|bạn|giúp (?:tôi|mình|em))\\s+)*');
  take('(?:(?:vẽ|dựng|tạo|cho|ve)\\s+)?(?:thêm\\s+)?(?:(?:một|1)\\s+)?');
  if (!take(`(?:đường|hình|duong|hinh)\\s+(?:tròn|tron)${END}`)) return null;

  const command: CircleCommand = { radius: { kind: 'default' } };
  let hasRadius = false;
  const setRadius = (radius: CircleRadius) => {
    if (hasRadius) return false;
    hasRadius = true;
    command.radius = radius;
    return true;
  };
  const setCenter = (name: string, x?: string, y?: string) => {
    if (command.center) return false;
    command.center = { name: toName(name), ...(x && y ? { at: { x: toNumber(x), y: toNumber(y) } } : {}) };
    return true;
  };
  const signed = `\\s*(-?${NUM})\\s*`;

  while (rest.trim()) {
    take('[\\s,]*(?:(?:và|có|với)\\s+)*');
    let m: RegExpMatchArray | null;

    // Ký hiệu sách giáo khoa: (O), (O; 3), (A; AB), (O; R = 2)
    if ((m = take(`\\(\\s*(${NAME})\\s*(?=[;,)])`))) {
      if (!setCenter(m[1])) return null;
      if (take('[;,]\\s*(?:r\\s*=\\s*)?')) {
        const found = readRadius(rest);
        if (!found || !setRadius(found.radius)) return null;
        rest = rest.slice(found.length);
      }
      if (!take('\\s*\\)')) return null;
    } else if ((m = take(`tâm\\s+(?:là\\s+)?(?:điểm\\s+)?(${NAME})${END}(?:\\s*\\(${signed}(?:;|,\\s)${signed}\\)|\\s*\\(${signed},${signed}\\))?`))) {
      if (!setCenter(m[1], m[2] ?? m[4], m[3] ?? m[5])) return null;
    } else if (take(`(?:bán kính|bk|r(?=\\s*=))\\s*(?:r\\s*(?==))?(?:(?:=|là${END}|bằng${END})\\s*)?`)) {
      const found = readRadius(rest);
      if (!found || !setRadius(found.radius)) return null;
      rest = rest.slice(found.length);
    } else if ((m = take(`đường kính\\s+(?:là\\s+)?${SEGMENT_WORDS}(${NAME})\\s?(${NAME})${END}`))) {
      if (toName(m[1]) === toName(m[2]) || !setRadius({ kind: 'diameter', a: toName(m[1]), b: toName(m[2]) })) return null;
    } else if (take(`(?:đi\\s+)?qua\\s+(?:(?:các|ba|3)\\s+)?(?:điểm\\s+)?(?=${NAME}${END}|${NAME}${NAME})`)) {
      const points: string[] = [];
      // "A, B, C" / "A và B" / "ABC"
      const joined = take(`(${NAME})(${NAME})(${NAME})${END}`);
      if (joined) points.push(...joined.slice(1).map(toName));
      else {
        let next = take(`(${NAME})${END}`);
        while (next) {
          points.push(toName(next[1]));
          next = take(`(?:\\s*,\\s*|\\s+và\\s+|\\s+)(?:điểm\\s+)?(${NAME})${END}`);
        }
      }
      if ((points.length !== 1 && points.length !== 3) || new Set(points).size !== points.length) return null;
      if (!setRadius({ kind: 'through', points })) return null;
    } else if (command.center && !hasRadius && (m = take(`(${NUM})${UNIT}${END}`))) {
      setRadius({ kind: 'value', value: toNumber(m[1]) });
    } else if (take('nét\\s+đứt')) {
      command.strokeStyle = 'dashed';
    } else if ((m = take(`màu\\s+(${Object.keys(COLORS).join('|')})${END}`))) {
      command.stroke = COLORS[m[1].toLowerCase()];
    } else if (rest.trim()) {
      return null;
    }
  }

  const { radius } = command;
  // Đường tròn qua một điểm cần biết tâm; qua ba điểm thì tâm được tính ra
  if (radius.kind === 'through' && radius.points.length === 1 && !command.center) return null;
  if (radius.kind === 'through' && radius.points[0] === command.center?.name) return null;
  return command;
}

export interface CircleBuildResult {
  success: boolean;
  message: string;
  newElements?: GeoElement[];
}

type XY = { x: number; y: number };

const dist = (p: XY, q: XY) => Math.hypot(p.x - q.x, p.y - q.y);

/** Tên chưa dùng cho tâm mới: ưu tiên O, I, K như trong sách giáo khoa */
export function freeCenterName(used: Iterable<string>): string {
  const taken = new Set(used);
  const letters = ['O', 'I', 'K', 'J', 'H', 'M', 'N', 'P', 'Q', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'L', 'R', 'S', 'T', 'U', 'V', 'X', 'Y', 'Z'];
  for (let round = 0; ; round++) {
    const name = letters.map((l) => (round ? `${l}${round}` : l)).find((n) => !taken.has(n));
    if (name) return name;
  }
}

/** Dựng đường tròn theo lệnh, dùng lại các điểm đã có trên bảng; điểm chưa có thì tạo mới */
export function buildCircle(command: CircleCommand, elements: GeoElement[], origin: XY): CircleBuildResult {
  const now = Date.now();
  const groupId = `circle-group-${now}`;
  const created: PointElement[] = [];
  const allPoints = () => [...elements.filter((el): el is PointElement => el.type === 'point'), ...created];
  const find = (name: string) => allPoints().find((p) => p.label === name);
  const addPoint = (name: string, at: XY, grouped = false): PointElement => {
    const point: PointElement = {
      id: `pt-${name}-${now}-${created.length}`,
      type: 'point',
      ...(grouped ? { groupId } : {}),
      x: at.x,
      y: at.y,
      radius: 4,
      label: name,
      stroke: '#0f172a',
      strokeWidth: 2,
      strokeStyle: 'solid',
    };
    created.push(point);
    return point;
  };
  const freeName = (reserved: string[] = []) => freeCenterName([...allPoints().map((p) => p.label ?? ''), ...reserved]);
  const number = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');
  const fail = (message: string): CircleBuildResult => ({ success: false, message });

  const { radius } = command;
  const wanted = command.center;
  const step = DEFAULT_RADIUS * UNIT_STEP;

  // Tâm đã biết trước khi tính bán kính (nếu người dùng cho tọa độ hoặc điểm đã có)
  let center: PointElement | undefined = wanted ? find(wanted.name) : undefined;
  if (wanted?.at) {
    const at = mathToScreen(wanted.at.x, wanted.at.y, origin);
    if (center && dist(center, at) > 1) {
      return fail(`Trên bảng đã có điểm ${wanted.name} ở vị trí khác. Hãy bỏ tọa độ để dùng điểm đó, hoặc đặt tên tâm khác.`);
    }
    center ??= addPoint(wanted.name, at, true);
  }

  let r: number;
  let radiusText: string;

  if (radius.kind === 'diameter') {
    const a = find(radius.a) ?? addPoint(radius.a, { x: (find(radius.b)?.x ?? origin.x + step) - 2 * step, y: find(radius.b)?.y ?? origin.y });
    const b = find(radius.b) ?? addPoint(radius.b, { x: a.x + 2 * step, y: a.y });
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    r = dist(a, b) / 2;
    if (r < 1) return fail(`Hai điểm ${radius.a}, ${radius.b} đang trùng nhau.`);
    if (center && dist(center, middle) > 2) return fail(`Điểm ${center.label} không phải trung điểm của ${radius.a}${radius.b} nên không thể là tâm.`);
    // Điểm đã có ngay tại trung điểm được dùng làm tâm
    center ??= (wanted ? undefined : allPoints().find((p) => dist(p, middle) <= 2)) ?? addPoint(wanted?.name ?? freeName(), middle, true);
    radiusText = `đường kính ${radius.a}${radius.b}`;
  } else if (radius.kind === 'through' && radius.points.length === 3) {
    const names = radius.points;
    const missing = names.filter((n) => !find(n));
    if (missing.length === 3) {
      [[-0.2, 3], [-2.6, -1.5], [2.8, -1.1]].forEach(([x, y], i) => addPoint(names[i], mathToScreen(x, y, origin)));
    } else if (missing.length > 0) {
      return fail(`Trên bảng chưa có điểm ${missing.join(', ')} để vẽ đường tròn đi qua ${names.join(', ')}.`);
    }
    const [a, b, c] = names.map((n) => find(n)!);
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    const longest = Math.max(dist(a, b), dist(b, c), dist(c, a));
    if (Math.abs(d) < longest * longest * 0.001) return fail(`Ba điểm ${names.join(', ')} thẳng hàng nên không có đường tròn đi qua.`);
    const sq = (p: XY) => p.x * p.x + p.y * p.y;
    const middle = {
      x: (sq(a) * (b.y - c.y) + sq(b) * (c.y - a.y) + sq(c) * (a.y - b.y)) / d,
      y: (sq(a) * (c.x - b.x) + sq(b) * (a.x - c.x) + sq(c) * (b.x - a.x)) / d,
    };
    r = dist(middle, a);
    if (center && dist(center, middle) > 2) return fail(`Điểm ${center.label} không cách đều ${names.join(', ')} nên không thể là tâm.`);
    center ??= (wanted ? undefined : allPoints().find((p) => dist(p, middle) <= 2)) ?? addPoint(wanted?.name ?? freeName(), middle, true);
    radiusText = `đi qua ${names.join(', ')}`;
  } else if (radius.kind === 'segment' || radius.kind === 'through') {
    const [a, b, factor] = radius.kind === 'segment' ? [radius.a, radius.b, radius.factor] : [wanted!.name, radius.points[0], 1];
    const centerName = wanted?.name ?? freeName([a, b]);
    const touchesCenter = a === centerName || b === centerName;
    const missing = [a, b].filter((n) => n !== centerName && !find(n));
    if (missing.length > 0 && !touchesCenter) {
      return fail(`Trên bảng chưa có điểm ${missing.join(', ')} nên chưa biết bán kính ${a}${b}. Hãy vẽ đoạn thẳng ${a}${b} trước, hoặc ghi bán kính bằng số.`);
    }
    if (touchesCenter) {
      const otherName = a === centerName ? b : a;
      let other = find(otherName);
      center ??= addPoint(centerName, other ? { x: other.x - step, y: other.y } : { x: origin.x, y: origin.y }, true);
      other ??= addPoint(otherName, { x: center.x + step, y: center.y });
    }
    const length = dist(find(a)!, find(b)!);
    if (length < 1) return fail(`Hai điểm ${a}, ${b} đang trùng nhau.`);
    r = length * factor;
    center ??= addPoint(centerName, { x: origin.x, y: origin.y }, true);
    const prefix = factor === 1 ? '' : `${number(factor)}·`;
    radiusText =
      radius.kind === 'through'
        ? `đi qua ${b}`
        : `bán kính ${prefix}${a}${b} (≈ ${number(r / UNIT_STEP)} đơn vị)`;
  } else {
    const value = radius.kind === 'value' ? radius.value : DEFAULT_RADIUS;
    if (!(value > 0)) return fail('Bán kính phải lớn hơn 0.');
    r = value * UNIT_STEP;
    center ??= addPoint(wanted?.name ?? freeName(), { x: origin.x, y: origin.y }, true);
    radiusText = `bán kính ${number(value)}`;
  }

  const circle: CircleElement = {
    id: `circle-${now}`,
    type: 'circle',
    groupId,
    cx: center.x,
    cy: center.y,
    radius: r,
    stroke: command.stroke ?? '#0f172a',
    strokeWidth: 2,
    strokeStyle: command.strokeStyle ?? 'solid',
    fill: 'transparent',
  };

  return {
    success: true,
    message: `Đã vẽ đường tròn tâm ${center.label} ${radiusText}!`,
    // Đường tròn đứng trước để điểm nằm lên trên
    newElements: [...elements, circle, ...created],
  };
}
