/**
 * Bổ sung các lệnh dựng hình mà AI bỏ sót, dựa trên chính đề bài tiếng Việt.
 *
 * AI đôi khi chỉ trả về tọa độ các điểm gốc (A, B, C, O) và tam giác ABC, mà quên
 * các lệnh dựng đường cao / trung điểm / giao điểm dù đề bài có nhắc tới. Hàm này
 * đọc các cụm quen thuộc trong đề ("đường cao AD, BE, CF", "M là trung điểm của BC",
 * "đường chéo AC và BD", "cắt nhau tại H") và thêm lệnh tương ứng cho các điểm
 * CHƯA được AI định nghĩa. Điểm AI đã cho thì giữ nguyên.
 */

import { toNameList } from './constructionEngine';

type AnyCommand = Record<string, any>;

export interface AugmentResult {
  /** Bản sao dữ liệu AI đã được bổ sung lệnh */
  data: any;
  /** Mô tả các lệnh đã thêm (để hiển thị/ghi log) */
  added: string[];
}

const pairOf = toNameList;

export function augmentWithProblemText(aiData: any, problemText: string): AugmentResult {
  const added: string[] = [];
  if (!aiData || typeof aiData !== 'object' || Array.isArray(aiData) || !problemText) {
    return { data: aiData, added };
  }

  const data = { ...aiData };
  const commands: AnyCommand[] = Array.isArray(data.commands) ? [...data.commands] : [];
  const segments: AnyCommand[] = Array.isArray(data.segments) ? [...data.segments] : [];

  // ---- Các điểm đã có (AI cho tọa độ hoặc lệnh dựng hình tạo ra) ----
  const defined = new Set<string>();
  for (const p of Array.isArray(data.points) ? data.points : []) {
    const name = String(p?.name || p?.label || '').trim();
    if (name) defined.add(name);
  }
  for (const c of Array.isArray(data.circles) ? data.circles : []) {
    if (c?.center) defined.add(String(c.center).trim());
  }
  for (const c of commands) {
    if (!c || typeof c !== 'object') continue;
    for (const key of ['name', 'foot', 'otherEnd']) {
      if (typeof c[key] === 'string' && c[key].trim()) defined.add(c[key].trim());
    }
    pairOf(c.names).forEach((n) => defined.add(n));
  }

  // ---- Các tam giác đã biết (để xác định cạnh đối diện của đường cao) ----
  const triangles: string[][] = [];
  for (const poly of Array.isArray(data.polygons) ? data.polygons : []) {
    const v = pairOf(poly?.vertices || poly?.names);
    if (v.length === 3) triangles.push(v);
  }
  for (const c of commands) {
    const cmdName = String(c?.cmd || '').toUpperCase();
    if (cmdName === 'TRIANGLE' || cmdName === 'POLYGON') {
      const v = pairOf(c.names);
      if (v.length === 3) triangles.push(v);
    }
  }
  const textTri = problemText.match(/tam giác\s+([A-Z])([A-Z])([A-Z])(?![A-Za-z])/);
  if (textTri) triangles.push([textTri[1], textTri[2], textTri[3]]);

  const hasPoint = (n: string) => defined.has(n);
  const segmentExists = (a: string, b: string) =>
    segments.some((s) => (s.from === a && s.to === b) || (s.from === b && s.to === a));

  // Các đường (2 điểm) vừa dựng, dùng cho "cắt nhau tại ..."
  const lines: [string, string][] = [];

  // ---- 1. Đường cao: "đường cao AD", "các đường cao AD, BE, CF", "đường cao AD và BE" ----
  const altitudeRe = /đường cao\s+([A-Z]{2}(?:\s*(?:,|và)\s*[A-Z]{2})*)/g;
  for (const m of problemText.matchAll(altitudeRe)) {
    for (const pair of m[1].split(/\s*(?:,|và)\s*/)) {
      const [vertex, foot] = pair.split('');
      if (!vertex || !foot) continue;
      const tri = triangles.find((t) => t.includes(vertex));
      if (!tri || !tri.every(hasPoint)) continue;
      lines.push([vertex, foot]);
      if (hasPoint(foot)) continue;
      const others = tri.filter((v) => v !== vertex);
      commands.push({ cmd: 'PERPENDICULAR', from: vertex, to: others, foot });
      defined.add(foot);
      added.push(`Đường cao ${vertex}${foot} ⊥ ${others.join('')}`);
    }
  }

  // ---- 2. Đường chéo: "đường chéo AC và BD", "hai đường chéo AC, BD" ----
  const diagRe = /đường chéo\s+([A-Z])([A-Z])\s*(?:,|và)\s*([A-Z])([A-Z])/g;
  for (const m of problemText.matchAll(diagRe)) {
    for (const [a, b] of [
      [m[1], m[2]],
      [m[3], m[4]],
    ]) {
      if (!hasPoint(a) || !hasPoint(b)) continue;
      lines.push([a, b]);
      if (!segmentExists(a, b)) {
        segments.push({ from: a, to: b, dashed: false });
        added.push(`Đường chéo ${a}${b}`);
      }
    }
  }

  // ---- 3. Trung điểm: "M là trung điểm (của) BC", "trung điểm M của AB" ----
  const midRes = [
    /([A-Z])\s+là\s+trung điểm\s+(?:của\s+)?(?:cạnh\s+|đoạn\s+(?:thẳng\s+)?)?([A-Z])([A-Z])(?![A-Za-z])/g,
    /trung điểm\s+([A-Z])\s+của\s+(?:cạnh\s+|đoạn\s+(?:thẳng\s+)?)?([A-Z])([A-Z])(?![A-Za-z])/g,
  ];
  for (const re of midRes) {
    for (const m of problemText.matchAll(re)) {
      const [, name, a, b] = m;
      if (hasPoint(name) || !hasPoint(a) || !hasPoint(b)) continue;
      commands.push({ cmd: 'MIDPOINT', of: [a, b], name });
      defined.add(name);
      added.push(`Trung điểm ${name} của ${a}${b}`);
    }
  }

  // ---- 4. Giao điểm: "... cắt nhau tại H" / "đồng quy tại H" (dùng 2 đường đầu tiên vừa dựng) ----
  const interMatch = problemText.match(/(?:cắt nhau|đồng quy)\s+tại\s+(?:điểm\s+)?([A-Z])(?![A-Za-z])/);
  if (interMatch && lines.length >= 2 && !hasPoint(interMatch[1])) {
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
