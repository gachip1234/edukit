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

  // Điểm gốc AI đã cho TỌA ĐỘ (không suy ra từ lệnh). Với các yếu tố đề bài nêu RÕ
  // (đường cao AD, phân giác AD, trung tuyến AM...), lệnh dựng từ đề bài được ưu tiên hơn
  // lệnh của AI, vì AI đôi khi ghi sai thứ tự tham số (vd: phân giác từ B thay vì từ A).
  const basePoints = new Set<string>();
  for (const p of Array.isArray(data.points) ? data.points : []) {
    const name = String(p?.name || p?.label || '').trim();
    if (name) basePoints.add(name);
  }
  for (const c of Array.isArray(data.circles) ? data.circles : []) {
    if (c?.center) basePoints.add(String(c.center).trim());
  }
  const isBase = (n: string) => basePoints.has(n);
  /** Bỏ các lệnh của AI tạo ra điểm `name` (để thay bằng lệnh đúng theo đề bài) */
  const dropAiProducers = (name: string) => {
    for (let i = commands.length - 1; i >= 0; i--) {
      const c = commands[i];
      let produced = '';
      if (typeof c === 'string') {
        const m = c.match(/^\s*(MIDPOINT|PERPENDICULAR|INTERSECT|BISECTOR|TrungDiem|DuongCao|PhanGiac)\s*\(([^)]*)\)/i);
        if (m) produced = m[2].split(',').pop()?.trim() || '';
        // Lệnh cát tuyến tạo 2 điểm cuối (P, Q / A, B)
        const sec = c.match(/^\s*(SECANT_FROM|SECANT|LINE_CIRCLE|CatTuyen)\s*\(([^)]*)\)/i);
        if (sec && sec[2].split(',').map((a: string) => a.trim()).slice(-2).includes(name)) produced = name;
      } else if (c && typeof c === 'object' && ['MIDPOINT', 'PERPENDICULAR', 'INTERSECT', 'BISECTOR'].includes(String(c.cmd || '').toUpperCase())) {
        produced = String(c.foot || c.name || '').trim();
      }
      if (produced === name) commands.splice(i, 1);
    }
  };

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
      if (isBase(foot)) continue;
      dropAiProducers(foot);
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
    if (!has(from) || !has(p1) || !has(p2) || isBase(foot)) continue;
    dropAiProducers(foot);
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
      if (!isBase(mid)) {
        dropAiProducers(mid);
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
      if (isBase(foot)) continue;
      dropAiProducers(foot);
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
    if (isBase(foot)) continue;
    dropAiProducers(foot);
    commands.push({ cmd: 'BISECTOR', from: vertex, to: [p1, p2], foot });
    defined.add(foot);
    added.push(`Phân giác ${vertex}${foot} cắt ${p1}${p2}`);
  }

  // ---- 5. Trung điểm ----
  const addMidpoint = (name: string, a: string, b: string) => {
    if (isBase(name) || !has(a) || !has(b)) return;
    dropAiProducers(name);
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
    if (!l1 || !l2 || isBase(name) || ![...l1, ...l2].every(has)) continue;
    dropAiProducers(name);
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

  // ---- 8. Tia đối: "tia Bx là tia đối của tia BC", "tia Bx đối với tia BC",
  //          "tia đối của tia BC là tia Bx", "tia đối Bx của tia BC" (x chữ thường = nhãn; D chữ hoa = điểm mới)
  const RAYNAME = `(?:[a-z]|${NAME})`;
  const oppositePatterns: [RegExp, (m: RegExpMatchArray) => [string, string, string]][] = [
    [
      new RegExp(`tia\\s+(${NAME})(${RAYNAME})\\s+(?:là\\s+)?(?:tia\\s+)?đối\\s+(?:của|với)\\s+tia\\s+(${NAME})(${NAME})`, 'g'),
      (m) => [m[3], m[4], m[2]],
    ],
    [
      new RegExp(`tia đối của tia\\s+(${NAME})(${NAME})\\s+là\\s+tia\\s+(${NAME})(${RAYNAME})`, 'g'),
      (m) => [m[1], m[2], m[4]],
    ],
    [
      new RegExp(`tia đối\\s+(${NAME})(${RAYNAME})\\s+của\\s+tia\\s+(${NAME})(${NAME})`, 'g'),
      (m) => [m[3], m[4], m[2]],
    ],
  ];
  for (const [re, pick] of oppositePatterns) {
    for (const m of text.matchAll(re)) {
      const [origin, away, label] = pick(m);
      if (!has(origin) || !has(away) || label === away) continue;
      // Bỏ các lệnh tia của AI từ cùng gốc với cùng nhãn (AI hay vẽ nhầm thành tia trùng với BC)
      for (let i = commands.length - 1; i >= 0; i--) {
        const c = commands[i];
        let cmdName = '';
        let args: string[] = [];
        if (typeof c === 'string') {
          const mm = c.match(/^\s*(RAY_OPPOSITE|RAY_ANGLE|RAY|LINE|TiaDoi|Tia)\s*\(([^)]*)\)/i);
          if (mm) {
            cmdName = mm[1].toUpperCase();
            args = mm[2].split(',').map((a: string) => a.trim());
          }
        } else if (c && typeof c === 'object') {
          cmdName = String(c.cmd || '').toUpperCase();
          args = Array.isArray(c.args) ? c.args.map(String) : [c.from, c.through ?? c.to, c.label].map((v) => String(v ?? ''));
        }
        if (/^(RAY|RAY_ANGLE|RAY_OPPOSITE|TIA|TIADOI)$/.test(cmdName) && args[0] === origin && args.slice(1).includes(label)) {
          commands.splice(i, 1);
        }
      }
      commands.push({ cmd: 'RAY_OPPOSITE', args: [origin, away, label] });
      if (/^[A-Z]/.test(label)) defined.add(label);
      added.push(`Tia ${origin}${label} là tia đối của tia ${origin}${away}`);
    }
  }

  // ---- 8b. Cát tuyến ----
  // "cát tuyến xy cắt đường tròn (O) tại (hai điểm) P và Q", "cát tuyến d cắt (O) tại P, Q"
  // "từ M kẻ cát tuyến MAB với (O)" / "cát tuyến MCD của đường tròn (O)"
  const circleCenters = new Set(
    (Array.isArray(data.circles) ? data.circles : []).map((c: any) => String(c?.center || '').trim()),
  );
  const CIRCLE_REF = `(?:đường tròn\\s*)?\\(?\\s*(${NAME})\\s*(?:;[^)]*)?\\)?`;
  for (const m of text.matchAll(
    new RegExp(
      `cát tuyến\\s+([a-z])([a-z])?\\s+cắt\\s+${CIRCLE_REF}\\s+tại\\s+(?:hai điểm\\s+|2 điểm\\s+)?(${NAME})\\s*(?:,|và)\\s*(${NAME})`,
      'g',
    ),
  )) {
    const [, l1, l2, center, nP, nQ] = m;
    if (!circleCenters.has(center) || isBase(nP) || isBase(nQ)) continue;
    dropAiProducers(nP);
    dropAiProducers(nQ);
    commands.push({ cmd: 'SECANT', args: [center, l1, ...(l2 ? [l2] : []), nP, nQ] });
    defined.add(nP);
    defined.add(nQ);
    added.push(`Cát tuyến ${l1}${l2 || ''} cắt (${center}) tại ${nP}, ${nQ}`);
  }
  for (const m of text.matchAll(
    new RegExp(`cát tuyến\\s+(${NAME})(${NAME})(${NAME})\\s+(?:với|tới|đến|của|cắt)?\\s*${CIRCLE_REF}`, 'g'),
  )) {
    const [, nM, nA, nB, center] = m;
    if (!has(nM) || !circleCenters.has(center) || isBase(nA) || isBase(nB)) continue;
    dropAiProducers(nA);
    dropAiProducers(nB);
    commands.push({ cmd: 'SECANT_FROM', args: [nM, center, nA, nB] });
    defined.add(nA);
    defined.add(nB);
    added.push(`Cát tuyến ${nM}${nA}${nB} với (${center})`);
  }

  // ---- 9. Ký hiệu bằng nhau nêu trong đề ----
  const equalSeg = (pairs: [string, string][], why: string) => {
    if (pairs.length >= 2 && pairs.every(([a, b]) => has(a) && has(b))) {
      commands.push({ cmd: 'EQUAL_SEGMENTS', args: pairs.flat() });
      added.push(`Ký hiệu ${why}`);
    }
  };
  // "AB = AC", "MA = MB = MC" (bỏ qua "AB = 3cm")
  for (const m of text.matchAll(new RegExp(`(?<![A-Za-z])(${PAIR}(?:\\s*=\\s*${PAIR})+)(?![A-Za-z0-9])`, 'g'))) {
    const pairs = m[1].split(/\s*=\s*/).map(splitPair).filter(Boolean) as [string, string][];
    equalSeg(pairs, m[1].replace(/\s+/g, ' '));
  }
  // "tam giác ABC cân tại A" → AB = AC; "tam giác ABC đều" / "tam giác đều ABC" → AB = BC = CA
  const isoMatch = text.match(/tam giác\s+([A-Z])([A-Z])([A-Z])\s+(?:vuông\s+)?cân\s+tại\s+([A-Z])/);
  if (isoMatch) {
    const apex = isoMatch[4];
    const others = [isoMatch[1], isoMatch[2], isoMatch[3]].filter((v) => v !== apex);
    if (others.length === 2) equalSeg([[apex, others[0]], [apex, others[1]]], `${apex}${others[0]} = ${apex}${others[1]} (tam giác cân)`);
  }
  const eqTri = text.match(/tam giác\s+đều\s+([A-Z])([A-Z])([A-Z])|tam giác\s+([A-Z])([A-Z])([A-Z])\s+đều/);
  if (eqTri) {
    const [a, b, c] = eqTri[1] ? [eqTri[1], eqTri[2], eqTri[3]] : [eqTri[4], eqTri[5], eqTri[6]];
    equalSeg([[a, b], [b, c], [c, a]], `${a}${b} = ${b}${c} = ${c}${a} (tam giác đều)`);
  }
  // "góc ABD = góc DBC", "∠ABD = ∠DBC"
  for (const m of text.matchAll(/(?:góc|∠)\s*([A-Z])([A-Z])([A-Z])\s*=\s*(?:góc|∠)\s*([A-Z])([A-Z])([A-Z])/g)) {
    const triples: [string, string, string][] = [
      [m[1], m[2], m[3]],
      [m[4], m[5], m[6]],
    ];
    if (triples.every((t) => t.every(has))) {
      commands.push({ cmd: 'EQUAL_ANGLES', args: triples.flat() });
      added.push(`Ký hiệu góc ${m[1]}${m[2]}${m[3]} = góc ${m[4]}${m[5]}${m[6]}`);
    }
  }

  if (added.length > 0) {
    data.commands = commands;
    data.segments = segments;
  }
  return { data, added };
}
