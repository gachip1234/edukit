/**
 * Bổ sung các lệnh dựng hình mà AI bỏ sót, dựa trên chính đề bài tiếng Việt.
 *
 * AI (kể cả gemini-3.8-flash) thường trả về đúng tọa độ các điểm gốc (A, B, C, O...)
 * nhưng hay bỏ trống tên điểm trong lệnh dựng hình hoặc quên hẳn lệnh. Hàm này đọc
 * các cụm quen thuộc trong đề và thêm lệnh tương ứng cho những điểm AI CHƯA định
 * nghĩa. Điểm AI đã cho thì giữ nguyên.
 *
 * Hỗ trợ:
 *  - "đường cao AD, BE, CF"                      → PERPENDICULAR
 *  - "kẻ CH vuông góc với AB (tại H)"            → PERPENDICULAR
 *  - "(đường) trung tuyến AM, BN, CP"            → MIDPOINT + đoạn AM
 *  - "(tia/đường) phân giác AD"                  → BISECTOR
 *  - "phân giác (của) góc A cắt BC tại D"        → BISECTOR
 *  - "M là trung điểm (của) BC", "trung điểm M của AB"
 *  - "M, N lần lượt là trung điểm của AB và AC"  → MIDPOINT
 *  - "đường chéo AC và BD", "hai đường chéo"     → đoạn chéo
 *  - "I là giao điểm của AD và BC"               → INTERSECT
 *  - "... cắt nhau tại H", "đồng quy tại G"      → INTERSECT của 2 đường vừa dựng
 */
import { toNameList } from './constructionEngine';

type AnyCommand = Record<string, any>;

export interface AugmentResult {
  /** Bản sao dữ liệu AI đã được bổ sung lệnh */
  data: any;
  /** Mô tả các lệnh đã thêm (để hiển thị/ghi log) */
  added: string[];
}

const NAME = "[A-Z]'?"; // tên điểm: A, B, O' ...
const PAIR = `${NAME}${NAME}`; // cặp điểm liền nhau: AB, OO'
const LIST_SEP = '\\s*(?:,|và)\\s*';

/** Tách "AD" / "OO'" thành ["A","D"] / ["O","O'"] */
function splitPair(pair: string): [string, string] | null {
  const m = pair.match(new RegExp(`^(${NAME})(${NAME})$`));
  return m ? [m[1], m[2]] : null;
}

/** Tách "AD, BE và CF" thành ["AD","BE","CF"] */
function splitList(list: string): string[] {
  return list
    .split(new RegExp(LIST_SEP))
    .map((s) => s.trim())
    .filter(Boolean);
}

export function augmentWithProblemText(aiData: any, problemText: string): AugmentResult {
  const added: string[] = [];
  if (!aiData || typeof aiData !== 'object' || Array.isArray(aiData) || !problemText) {
    return { data: aiData, added };
  }
  const text = problemText.replace(/\s+/g, ' ');

  const data = { ...aiData };
  const commands: any[] = Array.isArray(data.commands) ? [...data.commands] : [];
  const segments: AnyCommand[] = Array.isArray(data.segments) ? [...data.segments] : [];

  // ---- Các điểm đã có (AI cho tọa độ hoặc lệnh dựng hình CÓ TÊN tạo ra) ----
  const defined = new Set<string>();
  for (const p of Array.isArray(data.points) ? data.points : []) {
    const name = String(p?.name || p?.label || '').trim();
    if (name) defined.add(name);
  }
  for (const c of Array.isArray(data.circles) ? data.circles : []) {
    if (c?.center) defined.add(String(c.center).trim());
  }
  for (const c of commands) {
    if (typeof c === 'string') {
      // Lệnh dạng chuỗi: tham số cuối là tên điểm được tạo (MIDPOINT(B, C, M) → M)
      const m = c.match(/^\s*(MIDPOINT|PERPENDICULAR|INTERSECT|BISECTOR|TrungDiem|DuongCao|PhanGiac)\s*\(([^)]*)\)/i);
      if (m) {
        const args = m[2]
          .split(',')
          .map((a: string) => a.trim())
          .filter(Boolean);
        if (args.length) defined.add(args[args.length - 1]);
      }
      continue;
    }
    if (!c || typeof c !== 'object') continue;
    for (const key of ['name', 'foot', 'otherEnd']) {
      if (typeof c[key] === 'string' && c[key].trim()) defined.add(c[key].trim());
    }
    toNameList(c.names).forEach((n) => defined.add(n));
  }
  const has = (n: string) => defined.has(n);

  // ---- Tam giác / tứ giác đã biết ----
  const triangles: string[][] = [];
  const quads: string[][] = [];
  const addPoly = (v: string[]) => {
    if (v.length === 3) triangles.push(v);
    if (v.length === 4) quads.push(v);
  };
  for (const poly of Array.isArray(data.polygons) ? data.polygons : []) {
    addPoly(toNameList(poly?.vertices || poly?.names));
  }
  for (const c of commands) {
    const cmdName = String(c?.cmd || '').toUpperCase();
    if (cmdName === 'TRIANGLE' || cmdName === 'POLYGON') addPoly(toNameList(c.names));
  }
  const textTri = text.match(/tam giác\s+([A-Z])([A-Z])([A-Z])(?![A-Za-z])/);
  if (textTri) triangles.push([textTri[1], textTri[2], textTri[3]]);
  const textQuad = text.match(
    /(?:tứ giác|hình bình hành|hình chữ nhật|hình vuông|hình thoi|hình thang(?: cân| vuông)?)\s+([A-Z])([A-Z])([A-Z])([A-Z])(?![A-Za-z])/,
  );
  if (textQuad) quads.push([textQuad[1], textQuad[2], textQuad[3], textQuad[4]]);

  const triangleOf = (vertex: string) => triangles.find((t) => t.includes(vertex) && t.every(has));
  const segmentExists = (a: string, b: string) =>
    segments.some((s) => (s.from === a && s.to === b) || (s.from === b && s.to === a));
  const addSegment = (a: string, b: string, dashed = false) => {
    if (!segmentExists(a, b)) segments.push({ from: a, to: b, dashed });
  };

  // Các đường (2 điểm) vừa dựng, theo thứ tự — dùng cho "cắt nhau tại ..."
  const lines: [string, string][] = [];

  // ---- 1. Đường cao: "đường cao AD", "các đường cao AD, BE, CF" ----
  for (const m of text.matchAll(new RegExp(`đường cao\\s+(${PAIR}(?:${LIST_SEP}${PAIR})*)`, 'g'))) {
    for (const item of splitList(m[1])) {
      const pair = splitPair(item);
      if (!pair) continue;
      const [vertex, foot] = pair;
      const tri = triangleOf(vertex);
      if (!tri) continue;
      lines.push([vertex, foot]);
      if (has(foot)) continue;
      const others = tri.filter((v) => v !== vertex);
      commands.push({ cmd: 'PERPENDICULAR', from: vertex, to: others, foot });
      defined.add(foot);
      added.push(`Đường cao ${vertex}${foot} ⊥ ${others.join('')}`);
    }
  }

  // ---- 2. "Kẻ CH vuông góc với AB (tại H)" ----
  for (const m of text.matchAll(
    new RegExp(
      `(${NAME})(${NAME})\\s+vuông góc với\\s+(?:cạnh\\s+|đường thẳng\\s+|đoạn thẳng\\s+)?(${NAME})(${NAME})`,
      'g',
    ),
  )) {
    const [, from, foot, p1, p2] = m;
    if (!has(from) || !has(p1) || !has(p2) || has(foot)) continue;
    commands.push({ cmd: 'PERPENDICULAR', from, to: [p1, p2], foot });
    defined.add(foot);
    lines.push([from, foot]);
    added.push(`${from}${foot} ⊥ ${p1}${p2} tại ${foot}`);
  }

  // ---- 3. Trung tuyến: "đường trung tuyến AM", "ba trung tuyến AM, BN, CP" ----
  for (const m of text.matchAll(new RegExp(`trung tuyến\\s+(${PAIR}(?:${LIST_SEP}${PAIR})*)`, 'g'))) {
    for (const item of splitList(m[1])) {
      const pair = splitPair(item);
      if (!pair) continue;
      const [vertex, mid] = pair;
      const tri = triangleOf(vertex);
      if (!tri) continue;
      lines.push([vertex, mid]);
      if (!has(mid)) {
        const others = tri.filter((v) => v !== vertex);
        commands.push({ cmd: 'MIDPOINT', of: others, name: mid });
        defined.add(mid);
        added.push(`Trung tuyến ${vertex}${mid} (${mid} là trung điểm ${others.join('')})`);
      }
      addSegment(vertex, mid);
    }
  }

  // ---- 4. Phân giác ----
  // 4a. "phân giác AD", "tia phân giác AD", "các đường phân giác AD, BE"
  for (const m of text.matchAll(
    new RegExp(`phân giác\\s+(${PAIR}(?:${LIST_SEP}${PAIR})*)(?![A-Za-z])`, 'g'),
  )) {
    for (const item of splitList(m[1])) {
      const pair = splitPair(item);
      if (!pair) continue;
      const [vertex, foot] = pair;
      const tri = triangleOf(vertex);
      if (!tri) continue;
      lines.push([vertex, foot]);
      if (has(foot)) continue;
      const others = tri.filter((v) => v !== vertex);
      commands.push({ cmd: 'BISECTOR', from: vertex, to: others, foot });
      defined.add(foot);
      added.push(`Phân giác ${vertex}${foot}`);
    }
  }
  // 4b. "phân giác (của) góc A / góc BAC cắt (cạnh) BC tại D"
  for (const m of text.matchAll(
    new RegExp(
      `phân giác\\s+(?:của\\s+)?góc\\s+(?:(${NAME})(${NAME})(${NAME})|(${NAME}))\\s+cắt\\s+(?:cạnh\\s+)?(${NAME})(${NAME})\\s+tại\\s+(${NAME})`,
      'g',
    ),
  )) {
    const vertex = m[2] || m[4];
    const [p1, p2, foot] = [m[5], m[6], m[7]];
    if (!vertex || !has(vertex) || !has(p1) || !has(p2)) continue;
    lines.push([vertex, foot]);
    if (has(foot)) continue;
    commands.push({ cmd: 'BISECTOR', from: vertex, to: [p1, p2], foot });
    defined.add(foot);
    added.push(`Phân giác ${vertex}${foot} cắt ${p1}${p2}`);
  }

  // ---- 5. Trung điểm ----
  const addMidpoint = (name: string, a: string, b: string) => {
    if (has(name) || !has(a) || !has(b)) return;
    commands.push({ cmd: 'MIDPOINT', of: [a, b], name });
    defined.add(name);
    added.push(`Trung điểm ${name} của ${a}${b}`);
  };
  // 5a. "M, N (và P) lần lượt là trung điểm (của) AB, AC (và BC)"
  for (const m of text.matchAll(
    new RegExp(
      `(${NAME}(?:${LIST_SEP}${NAME})+)\\s+lần lượt là (?:các )?trung điểm\\s+(?:của\\s+)?(?:các cạnh\\s+|các đoạn\\s+(?:thẳng\\s+)?|cạnh\\s+)?(${PAIR}(?:${LIST_SEP}${PAIR})+)`,
      'g',
    ),
  )) {
    const names = splitList(m[1]);
    const pairs = splitList(m[2]).map(splitPair);
    names.forEach((name, i) => {
      const pair = pairs[i];
      if (pair) addMidpoint(name, pair[0], pair[1]);
    });
  }
  // 5b. "M là trung điểm (của) BC" / "trung điểm M của AB"
  for (const re of [
    new RegExp(
      `(${NAME})\\s+là\\s+trung điểm\\s+(?:của\\s+)?(?:cạnh\\s+|đoạn\\s+(?:thẳng\\s+)?)?(${NAME})(${NAME})(?![A-Za-z])`,
      'g',
    ),
    new RegExp(
      `trung điểm\\s+(${NAME})\\s+của\\s+(?:cạnh\\s+|đoạn\\s+(?:thẳng\\s+)?)?(${NAME})(${NAME})(?![A-Za-z])`,
      'g',
    ),
  ]) {
    for (const m of text.matchAll(re)) addMidpoint(m[1], m[2], m[3]);
  }

  // ---- 6. Đường chéo ----
  let diagonalsHandled = false;
  for (const m of text.matchAll(new RegExp(`đường chéo\\s+(${PAIR})${LIST_SEP}(${PAIR})`, 'g'))) {
    for (const item of [m[1], m[2]]) {
      const pair = splitPair(item);
      if (!pair || !has(pair[0]) || !has(pair[1])) continue;
      lines.push(pair);
      if (!segmentExists(pair[0], pair[1])) added.push(`Đường chéo ${pair.join('')}`);
      addSegment(pair[0], pair[1]);
      diagonalsHandled = true;
    }
  }
  // "hai đường chéo cắt nhau tại O" (không nêu tên) → AC, BD của tứ giác ABCD
  if (!diagonalsHandled && /đường chéo/.test(text)) {
    const quad = quads.find((q) => q.every(has));
    if (quad) {
      for (const [a, b] of [
        [quad[0], quad[2]],
        [quad[1], quad[3]],
      ]) {
        lines.push([a, b]);
        if (!segmentExists(a, b)) added.push(`Đường chéo ${a}${b}`);
        addSegment(a, b);
      }
    }
  }

  // ---- 7. Giao điểm ----
  // 7a. "I là giao điểm (của) (hai đường thẳng) AD và BC"
  for (const m of text.matchAll(
    new RegExp(
      `(${NAME})\\s+là\\s+giao điểm\\s+(?:của\\s+)?(?:hai\\s+)?(?:đường thẳng\\s+|đoạn thẳng\\s+|tia\\s+)?(${PAIR})\\s+(?:và|với)\\s+(?:đường thẳng\\s+|đoạn thẳng\\s+|tia\\s+)?(${PAIR})`,
      'g',
    ),
  )) {
    const name = m[1];
    const l1 = splitPair(m[2]);
    const l2 = splitPair(m[3]);
    if (!l1 || !l2 || has(name) || ![...l1, ...l2].every(has)) continue;
    commands.push({ cmd: 'INTERSECT', obj1: l1, obj2: l2, name });
    defined.add(name);
    added.push(`Giao điểm ${name} của ${l1.join('')} và ${l2.join('')}`);
  }
  // 7b. "... cắt nhau tại H" / "đồng quy tại G" → giao của 2 đường đầu tiên vừa dựng
  const interMatch = text.match(new RegExp(`(?:cắt nhau|đồng quy)\\s+tại\\s+(?:điểm\\s+)?(${NAME})(?![A-Za-z])`));
  if (interMatch && lines.length >= 2 && !has(interMatch[1])) {
    const name = interMatch[1];
    commands.push({ cmd: 'INTERSECT', obj1: lines[0], obj2: lines[1], name });
    defined.add(name);
    added.push(`Giao điểm ${name} của ${lines[0].join('')} và ${lines[1].join('')}`);
  }

  if (added.length > 0) {
    data.commands = commands;
    data.segments = segments;
  }
  return { data, added };
}
