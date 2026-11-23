import type {
  GeoElement,
  PointElement,
  SegmentElement,
  CircleElement,
  AngleElement,
  PolygonElement,
} from '../types/geometry';
import { computeSmartPointLabelOffset } from './mathUtils';

export interface ConstructionCommand {
  cmd: string;
  name?: string;
  names?: string[];
  x?: number;
  y?: number;
  center?: string;
  r?: number;
  from?: string;
  to?: string | [string, string] | string[];
  circle?: string;
  through?: string;
  otherEnd?: string;
  of?: [string, string] | string[];
  foot?: string;
  obj1?: [string, string] | string[];
  obj2?: [string, string] | string[];
  type?: string;
  ab?: number;
  ac?: number;
  bc?: number;
  dashed?: boolean;
  fill?: string;
  stroke?: string;
  vertex?: string;
  p1?: string;
  p2?: string;
  isRight?: boolean;
  [key: string]: any;
}

export interface MathPoint {
  name: string;
  x: number;
  y: number;
  label?: string;
}

export interface MathCircle {
  name: string;
  center: string; // point name
  r: number;
}

export interface MathSegment {
  from: string;
  to: string;
  dashed?: boolean;
  stroke?: string;
}

export interface MathAngleMarker {
  vertex: string;
  p1: string;
  p2: string;
  isRight: boolean;
}

export interface MathPolygon {
  vertices: string[];
  fill?: string;
  stroke?: string;
}

/**
 * Normalizes raw input from AI (objects or strings) into clean ConstructionCommand objects
 */
export function normalizeConstructionCommands(rawList: any[]): ConstructionCommand[] {
  if (!Array.isArray(rawList)) return [];

  const result: ConstructionCommand[] = [];

  for (const item of rawList) {
    if (!item) continue;

    // If it's already an object with cmd or command
    if (typeof item === 'object') {
      const rawCmd = (item.cmd || item.command || item.type || '').toString().toUpperCase().trim();
      if (!rawCmd) continue;

      result.push({
        ...item,
        cmd: rawCmd,
        dashed: Boolean(item.dashed || item.style === 'dashed'),
      });
      continue;
    }

    // If it's a string, parse known syntax
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (!trimmed) continue;

      // 1. TANGENTS(M, c1, A, B)
      const tangMatch = trimmed.match(/^TANGENTS?\s*\(\s*([A-Za-z0-9_']+)\s*,\s*([A-Za-z0-9_']+)\s*,\s*([A-Za-z0-9_']+)\s*,\s*([A-Za-z0-9_']+)\s*\)/i);
      if (tangMatch) {
        result.push({
          cmd: 'TANGENTS',
          from: tangMatch[1],
          circle: tangMatch[2],
          names: [tangMatch[3], tangMatch[4]],
        });
        continue;
      }

      // 2. DIAMETER(c1, A, C)
      const diaMatch = trimmed.match(/^DIAMETER\s*\(\s*([A-Za-z0-9_']+)\s*,\s*([A-Za-z0-9_']+)\s*,\s*([A-Za-z0-9_']+)\s*\)/i);
      if (diaMatch) {
        result.push({
          cmd: 'DIAMETER',
          circle: diaMatch[1],
          through: diaMatch[2],
          otherEnd: diaMatch[3],
        });
        continue;
      }

      // 2b. BISECTOR(A, B, C, D): phân giác góc BAC cắt BC tại D
      const bisMatch = trimmed.match(/^(?:BISECTOR|PhanGiac)\s*\(\s*([A-Za-z0-9_']+)\s*,\s*([A-Za-z0-9_']+)\s*,\s*([A-Za-z0-9_']+)\s*,\s*([A-Za-z0-9_']+)\s*\)/i);
      if (bisMatch) {
        result.push({
          cmd: 'BISECTOR',
          from: bisMatch[1],
          to: [bisMatch[2], bisMatch[3]],
          foot: bisMatch[4],
        });
        continue;
      }

      // 3. MIDPOINT(A, B, I)
      const midMatch = trimmed.match(/^(?:MIDPOINT|TrungDiem)\s*\(\s*([A-Za-z0-9_']+)\s*,\s*([A-Za-z0-9_']+)\s*,\s*([A-Za-z0-9_']+)\s*\)/i);
      if (midMatch) {
        result.push({
          cmd: 'MIDPOINT',
          of: [midMatch[1], midMatch[2]],
          name: midMatch[3],
        });
        continue;
      }

      // 4. PERPENDICULAR(A, B, C, H)
      const perpMatch = trimmed.match(/^(?:PERPENDICULAR|DuongCao|HinhChieu)\s*\(\s*([A-Za-z0-9_']+)\s*,\s*([A-Za-z0-9_']+)\s*,\s*([A-Za-z0-9_']+)\s*,\s*([A-Za-z0-9_']+)\s*\)/i);
      if (perpMatch) {
        result.push({
          cmd: 'PERPENDICULAR',
          from: perpMatch[1],
          to: [perpMatch[2], perpMatch[3]],
          foot: perpMatch[4],
        });
        continue;
      }

      // 5. INTERSECT(A, B, C, D, E)
      const interMatch = trimmed.match(/^INTERSECT\s*\(\s*([A-Za-z0-9_']+)\s*,\s*([A-Za-z0-9_']+)\s*,\s*([A-Za-z0-9_']+)\s*,\s*([A-Za-z0-9_']+)\s*,\s*([A-Za-z0-9_']+)\s*\)/i);
      if (interMatch) {
        result.push({
          cmd: 'INTERSECT',
          obj1: [interMatch[1], interMatch[2]],
          obj2: [interMatch[3], interMatch[4]],
          name: interMatch[5],
        });
        continue;
      }

      // 6. CIRCLE(c1, O, 3) or DuongTron(O, 3)
      const circMatch = trimmed.match(/^(?:CIRCLE|DuongTron)\s*\(\s*(?:([A-Za-z0-9_']+)\s*,\s*)?([A-Za-z0-9_']+)\s*,\s*([0-9.]+)\s*\)/i);
      if (circMatch) {
        result.push({
          cmd: 'CIRCLE',
          name: circMatch[1] || `circle_${circMatch[2]}`,
          center: circMatch[2],
          r: parseFloat(circMatch[3]),
        });
        continue;
      }

      // 7. SEGMENT(A, B) or DoanThang(A, B) or DoanThangDut(A, B)
      const segDutMatch = trimmed.match(/^(?:SEGMENT_DASHED|DoanThangDut)\s*\(\s*([A-Za-z0-9_']+)\s*,\s*([A-Za-z0-9_']+)\s*\)/i);
      if (segDutMatch) {
        result.push({
          cmd: 'SEGMENT',
          from: segDutMatch[1],
          to: segDutMatch[2],
          dashed: true,
        });
        continue;
      }

      const segMatch = trimmed.match(/^(?:SEGMENT|DoanThang)\s*\(\s*([A-Za-z0-9_']+)\s*,\s*([A-Za-z0-9_']+)\s*\)/i);
      if (segMatch) {
        result.push({
          cmd: 'SEGMENT',
          from: segMatch[1],
          to: segMatch[2],
          dashed: false,
        });
        continue;
      }

      // 8. POINT(A, 0, 0) or A = (0, 0)
      const ptMatch = trimmed.match(/^(?:POINT\s*\(\s*([A-Za-z0-9_']+)\s*,\s*([+-]?[0-9.]+)\s*,\s*([+-]?[0-9.]+)\s*\)|([A-Za-z0-9_']+)\s*=\s*\(\s*([+-]?[0-9.]+)\s*,\s*([+-]?[0-9.]+)\s*\))/i);
      if (ptMatch) {
        const name = ptMatch[1] || ptMatch[4];
        const x = parseFloat(ptMatch[2] || ptMatch[5]);
        const y = parseFloat(ptMatch[3] || ptMatch[6]);
        result.push({
          cmd: 'POINT',
          name,
          x,
          y,
        });
        continue;
      }

      // 9. POLYGON(A, B, C, ...) or DaGiac(A, B, C, ...)
      const polyMatch = trimmed.match(/^(?:POLYGON|DaGiac)\s*\(\s*([A-Za-z0-9_,\s]+)\s*\)/i);
      if (polyMatch) {
        const vertices = polyMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
        result.push({
          cmd: 'POLYGON',
          names: vertices,
        });
        continue;
      }
    }
  }

  return result;
}

export interface ConstructionResult {
  success: boolean;
  elements: GeoElement[];
  executedCommands: string[];
  constructionCommands?: ConstructionCommand[];
  rawParsedJson?: any;
  elementCount: number;
  error?: string;
}

/**
 * Geometric Construction Engine
 * Executes step-by-step construction commands or structured geometry objects
 * using exact analytical geometry and auto-fits & centers the resulting figures on the canvas.
 */
/** Tách danh sách tên điểm từ mảng hoặc chuỗi ("BC", "B,C", "B C" → ["B","C"]). */
export function toNameList(value: unknown): string[] {
  // Bỏ ký tự rác AI hay chèn vào: dấu ngoặc, nháy ('["B","C"]', "(A)", "'M'")
  // Giữ dấu phẩy trên kiểu O' (O phẩy); chỉ bỏ nháy đơn bao quanh cả tên ('M')
  const clean = (v: unknown) =>
    String(v)
      .replace(/[\[\]"`()]/g, ' ')
      .replace(/(^|[\s,])'([A-Za-z0-9_]+)'(?=$|[\s,])/g, '$1$2')
      .trim();
  if (Array.isArray(value)) return value.flatMap((v) => toNameList(clean(v)));
  if (typeof value !== 'string') return [];
  const str = clean(value);
  if (!str) return [];
  if (/[,\s]/.test(str)) return str.split(/[,\s]+/).filter(Boolean);
  // "BC" (2 chữ in hoa liền nhau) → ["B", "C"]; "A1" hoặc "M" giữ nguyên
  if (/^[A-Z]{2,}$/.test(str)) return str.split('');
  return [str];
}

/**
 * Tìm các điểm được nhắc tới (trong segments, polygons, commands) nhưng chưa có tọa độ
 * và cũng không được lệnh dựng hình nào tạo ra, rồi đặt chúng thành một đa giác lồi
 * có hình dạng tổng quát. Trả về danh sách tên điểm đã tự đặt.
 */
function autoPlaceMissingBasePoints(
  rawInput: any,
  commands: ConstructionCommand[],
  points: Map<string, MathPoint>,
): string[] {
  // Điểm do lệnh dựng hình tạo ra → không tự đặt
  const derived = new Set<string>();
  for (const c of commands) {
    switch (c.cmd) {
      case 'POINT':
      case 'MIDPOINT':
      case 'INTERSECT':
        if (c.name) derived.add(String(c.name).trim());
        break;
      case 'PERPENDICULAR':
      case 'BISECTOR':
        if (c.foot || c.name) derived.add(String(c.foot || c.name).trim());
        break;
      case 'TANGENTS':
      case 'TRIANGLE':
        toNameList(c.names).forEach((n) => derived.add(n));
        if (c.cmd === 'TRIANGLE' && !c.names) ['A', 'B', 'C'].forEach((n) => derived.add(n));
        if (c.cmd === 'TANGENTS' && c.from) derived.add(String(c.from).trim()); // TANGENTS tự đặt điểm ngoài
        break;
      case 'DIAMETER':
        derived.add(String(c.otherEnd || 'C').trim());
        break;
    }
  }

  // Các điểm được nhắc tới, giữ thứ tự xuất hiện
  const referenced: string[] = [];
  const add = (names: string[]) => {
    for (const n of names) if (n && !referenced.includes(n)) referenced.push(n);
  };
  if (rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)) {
    for (const poly of Array.isArray(rawInput.polygons) ? rawInput.polygons : []) {
      add(toNameList(poly?.vertices || poly?.names));
    }
    for (const seg of Array.isArray(rawInput.segments) ? rawInput.segments : []) {
      add(toNameList(seg?.from || seg?.p1 || seg?.start));
      add(toNameList(seg?.to || seg?.p2 || seg?.end));
    }
  }
  for (const c of commands) {
    switch (c.cmd) {
      case 'MIDPOINT':
        add(toNameList(c.of));
        break;
      case 'PERPENDICULAR':
      case 'BISECTOR':
        add(toNameList(c.from));
        add(toNameList(c.to));
        break;
      case 'INTERSECT':
        add(toNameList(c.obj1));
        add(toNameList(c.obj2));
        break;
      case 'SEGMENT':
        add(toNameList(c.from));
        add(toNameList(c.to));
        break;
      case 'POLYGON':
        add(toNameList(c.names));
        break;
      case 'DIAMETER':
        add(toNameList(c.through));
        break;
    }
  }

  const missing = referenced.filter((n) => !points.has(n) && !derived.has(n));
  if (missing.length === 0) return [];

  // Tâm và bán kính đặt điểm: quanh các điểm đã có (nếu có), nếu không thì quanh gốc tọa độ
  let cx = 0;
  let cy = 0;
  let radius = 3;
  if (points.size > 0) {
    const all = Array.from(points.values());
    cx = all.reduce((sum, pt) => sum + pt.x, 0) / all.length;
    cy = all.reduce((sum, pt) => sum + pt.y, 0) / all.length;
    const spread = Math.max(...all.map((pt) => Math.hypot(pt.x - cx, pt.y - cy)));
    radius = Math.max(3, spread);
  }

  const n = missing.length;
  missing.forEach((name, i) => {
    let x: number;
    let y: number;
    if (n === 3 && points.size === 0) {
      // Tam giác nhọn không cân, đỉnh thứ nhất ở trên (dáng quen thuộc trong sách giáo khoa)
      const triangle: [number, number][] = [
        [-0.8, 3],
        [-3, -1.8],
        [3.4, -1.8],
      ];
      [x, y] = triangle[i];
    } else {
      // Đa giác lồi, lệch nhẹ góc/bán kính để không thành hình đặc biệt (đều, vuông...)
      const angle = Math.PI / 2 + (i * 2 * Math.PI) / n + (i % 2 === 0 ? 0.12 : -0.08);
      const r = radius * (i % 2 === 0 ? 1 : 0.9);
      x = cx + r * Math.cos(angle);
      y = cy + r * Math.sin(angle);
    }
    points.set(name, { name, x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, label: name });
  });
  return missing;
}

export function executeConstructionCommands(
  rawInput: any,
  canvasWidth: number,
  canvasHeight: number
): ConstructionResult {
  const points = new Map<string, MathPoint>();
  const circles = new Map<string, MathCircle>();
  const segments: MathSegment[] = [];
  const angleMarkers: MathAngleMarker[] = [];
  const polygons: MathPolygon[] = [];
  const executedLog: string[] = [];

  // 1. TẢI CÁC ĐỐI TƯỢNG HÌNH HỌC TỪ CẤU TRÚC JSON ĐẦU RA CỦA AI (points, circles, segments, polygons, shapes)
  if (rawInput && typeof rawInput === 'object') {
    // a. Điểm (points)
    if (Array.isArray(rawInput.points)) {
      for (const pt of rawInput.points) {
        if (!pt) continue;
        const name = String(pt.name || pt.label || pt.id || '').trim();
        if (name) {
          const x = Number(pt.x) || 0;
          const y = Number(pt.y) || 0;
          points.set(name, { name, x, y, label: pt.label || name });
          executedLog.push(`Điểm ${name}(${x}, ${y})`);
        }
      }
    }

    // b. Đường tròn (circles)
    if (Array.isArray(rawInput.circles)) {
      for (const circ of rawInput.circles) {
        if (!circ) continue;
        const center = String(circ.center || 'O').trim();
        const name = String(circ.name || `circle_${center}`).trim();
        const r = Math.abs(Number(circ.r ?? circ.radius)) || 3;
        if (!points.has(center)) {
          points.set(center, { name: center, x: 0, y: 0, label: center });
          executedLog.push(`Điểm tâm ${center}(0, 0)`);
        }
        circles.set(name, { name, center, r });
        circles.set(center, { name, center, r });
        executedLog.push(`Đường tròn (${center}; R = ${r})`);
      }
    }

    // c. Đoạn thẳng (segments)
    if (Array.isArray(rawInput.segments)) {
      for (const seg of rawInput.segments) {
        if (!seg) continue;
        const from = String(seg.from || seg.p1 || seg.start || '').trim();
        const to = String(seg.to || seg.p2 || seg.end || '').trim();
        const dashed = Boolean(seg.dashed || seg.style === 'dashed');
        if (from && to && from !== to) {
          segments.push({ from, to, dashed });
          executedLog.push(`Đoạn thẳng ${from}${to}${dashed ? ' (đứt)' : ''}`);
        }
      }
    }

    // d. Đa giác (polygons)
    if (Array.isArray(rawInput.polygons)) {
      for (const poly of rawInput.polygons) {
        if (!poly) continue;
        const vertices = (poly.vertices || poly.names || []).map((v: any) => String(v).trim()).filter(Boolean);
        if (vertices.length >= 3) {
          polygons.push({ vertices, fill: poly.fill, stroke: poly.stroke });
          for (let i = 0; i < vertices.length; i++) {
            const next = vertices[(i + 1) % vertices.length];
            const exists = segments.some(
              (s) => (s.from === vertices[i] && s.to === next) || (s.from === next && s.to === vertices[i])
            );
            if (!exists) {
              segments.push({ from: vertices[i], to: next, dashed: false });
            }
          }
          executedLog.push(`Đa giác ${vertices.join('')}`);
        }
      }
    }

    // e. Ký hiệu góc (angles)
    if (Array.isArray(rawInput.angles)) {
      for (const ang of rawInput.angles) {
        if (!ang) continue;
        const vertex = String(ang.vertex || '').trim();
        const p1 = String(ang.p1 || ang.arm1 || '').trim();
        const p2 = String(ang.p2 || ang.arm2 || '').trim();
        if (vertex && p1 && p2) {
          angleMarkers.push({
            vertex,
            p1,
            p2,
            isRight: Boolean(ang.isRight !== false),
          });
          executedLog.push(`Ký hiệu góc tại ${vertex}`);
        }
      }
    }

    // f. Hỗ trợ mảng phẳng shapes nếu AI trả về shapes
    if (Array.isArray(rawInput.shapes)) {
      for (const sh of rawInput.shapes) {
        if (!sh || typeof sh !== 'object') continue;
        const shType = String(sh.type || '').toLowerCase();
        if (shType === 'point') {
          const name = String(sh.name || sh.label || '').trim();
          if (name) {
            points.set(name, { name, x: Number(sh.x) || 0, y: Number(sh.y) || 0, label: sh.label || name });
          }
        } else if (shType === 'circle') {
          const center = String(sh.center || 'O').trim();
          const r = Math.abs(Number(sh.r || sh.radius)) || 3;
          const name = String(sh.name || `circle_${center}`).trim();
          if (!points.has(center)) points.set(center, { name: center, x: 0, y: 0, label: center });
          circles.set(name, { name, center, r });
          circles.set(center, { name, center, r });
        } else if (shType === 'segment') {
          const from = String(sh.from || sh.p1 || '').trim();
          const to = String(sh.to || sh.p2 || '').trim();
          if (from && to && from !== to) {
            segments.push({ from, to, dashed: Boolean(sh.dashed) });
          }
        }
      }
    }
  }

  // 2. CHUẨN HÓA VÀ THỰC THI CÁC LỆNH DỰNG HÌNH BỔ TRỢ (commands)
  const rawCommands = Array.isArray(rawInput)
    ? rawInput
    : Array.isArray(rawInput?.commands)
      ? rawInput.commands
      : [];
  // Bỏ các lệnh trùng lặp (AI đôi khi lặp lại cùng một lệnh nhiều lần)
  const seenCommands = new Set<string>();
  const commands = normalizeConstructionCommands(rawCommands).filter((c) => {
    const key = JSON.stringify(c);
    if (seenCommands.has(key)) return false;
    seenCommands.add(key);
    return true;
  });

  // 2b. TỰ ĐẶT VỊ TRÍ CÁC ĐIỂM GỐC MÀ AI QUÊN CHO TỌA ĐỘ
  // AI đôi khi chỉ trả về segments/polygons/commands (vd: đoạn AB, BC, CA + đường cao AH)
  // mà không có "points". Khi đó các điểm gốc (A, B, C) được tự đặt ở vị trí tổng quát,
  // còn các điểm suy ra (chân đường cao, trung điểm, giao điểm, tiếp điểm...) vẫn do
  // các lệnh dựng hình tính chính xác.
  const autoPlaced = autoPlaceMissingBasePoints(rawInput, commands, points);
  if (autoPlaced.length > 0) {
    executedLog.push(`Tự đặt vị trí điểm gốc ${autoPlaced.join(', ')} (AI không cho tọa độ)`);
  }

  // Helper to get or fallback to point
  const getPt = (name: string): MathPoint | undefined => points.get(name);

  // Helper to ensure segment isn't duplicated
  const addSegment = (from: string, to: string, dashed: boolean = false) => {
    if (!from || !to || from === to) return;
    const exists = segments.some(
      (s) =>
        (s.from === from && s.to === to) ||
        (s.from === to && s.to === from)
    );
    if (!exists) {
      segments.push({ from, to, dashed });
    }
  };

  // Helper to add right angle marker
  const addRightAngle = (vertex: string, arm1: string, arm2: string) => {
    if (!vertex || !arm1 || !arm2 || arm1 === arm2) return;
    angleMarkers.push({
      vertex,
      p1: arm1,
      p2: arm2,
      isRight: true,
    });
  };

  // =========================================================================
  // EXECUTE COMMANDS IN SEQUENTIAL LOGICAL ORDER
  // =========================================================================
  for (const cmd of commands) {
    switch (cmd.cmd) {
      case 'POINT': {
        const name = (cmd.name || '').trim();
        const x = Number(cmd.x) || 0;
        const y = Number(cmd.y) || 0;
        if (name) {
          points.set(name, { name, x, y, label: cmd.label || name });
          executedLog.push(`Điểm ${name}(${x}, ${y})`);
        }
        break;
      }

      case 'CIRCLE': {
        const name = (cmd.name || `circle_${cmd.center || 'O'}`).trim();
        const center = (cmd.center || 'O').trim();
        const r = Math.abs(Number(cmd.r)) || 3;

        // If center point not defined yet, default it to (0, 0)
        if (!points.has(center)) {
          points.set(center, { name: center, x: 0, y: 0, label: center });
        }

        circles.set(name, { name, center, r });
        // Also map by center name for convenient lookup
        circles.set(center, { name, center, r });
        executedLog.push(`Đường tròn (${center}; R = ${r})`);
        break;
      }

      case 'TRIANGLE': {
        const names = cmd.names || ['A', 'B', 'C'];
        const [pA, pB, pC] = names;
        const triType = (cmd.type || 'general').toLowerCase();

        if (triType.includes('right') || triType === 'vuong') {
          // Tam giác vuông tại đỉnh thứ nhất (pA)
          const ab = Number(cmd.ab) || 3;
          const ac = Number(cmd.ac) || 4;
          points.set(pA, { name: pA, x: 0, y: 0 });
          points.set(pB, { name: pB, x: ab, y: 0 });
          points.set(pC, { name: pC, x: 0, y: ac });
          addRightAngle(pA, pB, pC);
        } else if (triType.includes('equilateral') || triType === 'deu') {
          // Tam giác đều cạnh a
          const a = Number(cmd.ab || cmd.bc || cmd.ac) || 4;
          points.set(pB, { name: pB, x: -a / 2, y: 0 });
          points.set(pC, { name: pC, x: a / 2, y: 0 });
          points.set(pA, { name: pA, x: 0, y: (a * Math.sqrt(3)) / 2 });
        } else if (triType.includes('isosceles') || triType === 'can') {
          // Tam giác cân tại pA
          const b = Number(cmd.bc) || 4;
          const c = Number(cmd.ab || cmd.ac) || 3.5;
          const h = Math.sqrt(Math.max(0.25, c * c - (b * b) / 4));
          points.set(pB, { name: pB, x: -b / 2, y: 0 });
          points.set(pC, { name: pC, x: b / 2, y: 0 });
          points.set(pA, { name: pA, x: 0, y: h });
        } else {
          // Tam giác thường với độ dài cạnh hoặc mặc định
          const a = Number(cmd.bc) || 5;
          const b = Number(cmd.ac) || 4;
          const c = Number(cmd.ab) || 3.5;
          // Law of cosines for angle B: b^2 = a^2 + c^2 - 2ac cos(B)
          const cosB = Math.max(-0.95, Math.min(0.95, (a * a + c * c - b * b) / (2 * a * c)));
          const sinB = Math.sqrt(1 - cosB * cosB);
          points.set(pB, { name: pB, x: 0, y: 0 });
          points.set(pC, { name: pC, x: a, y: 0 });
          points.set(pA, { name: pA, x: c * cosB, y: c * sinB });
        }

        addSegment(pA, pB);
        addSegment(pB, pC);
        addSegment(pC, pA);
        executedLog.push(`Tam giác ${pA}${pB}${pC} (${triType})`);
        break;
      }

      case 'TANGENTS': {
        // {"cmd": "TANGENTS", "from": "M", "circle": "c1", "names": ["A", "B"]}
        const fromName = (cmd.from || 'M').trim();
        const circRef = (cmd.circle || 'O').trim();
        const names = cmd.names || ['A', 'B'];
        const [pA, pB] = names;

        const circ = circles.get(circRef) || Array.from(circles.values())[0];
        if (!circ) {
          console.warn(`TANGENTS: Không tìm thấy đường tròn ${circRef}`);
          break;
        }

        const centerPt = getPt(circ.center);
        let extPt = getPt(fromName);

        if (!centerPt) break;

        // Nếu điểm M chưa có tọa độ, tự động đặt M nằm ngoài đường tròn cách tâm 2R
        if (!extPt) {
          extPt = { name: fromName, x: centerPt.x + circ.r * 2, y: centerPt.y };
          points.set(fromName, extPt);
        }

        const dx = extPt.x - centerPt.x;
        const dy = extPt.y - centerPt.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const R = circ.r;

        if (d >= R) {
          // Góc giữa OM và tiếp tuyến là alpha = arccos(R / d)
          const alpha = Math.acos(Math.min(1, R / d));
          const theta0 = Math.atan2(dy, dx);

          // Hai tiếp điểm A và B
          const thetaA = theta0 + alpha;
          const thetaB = theta0 - alpha;

          const ax = centerPt.x + R * Math.cos(thetaA);
          const ay = centerPt.y + R * Math.sin(thetaA);

          const bx = centerPt.x + R * Math.cos(thetaB);
          const by = centerPt.y + R * Math.sin(thetaB);

          points.set(pA, { name: pA, x: Math.round(ax * 1000) / 1000, y: Math.round(ay * 1000) / 1000 });
          points.set(pB, { name: pB, x: Math.round(bx * 1000) / 1000, y: Math.round(by * 1000) / 1000 });

          // Vẽ 2 đoạn tiếp tuyến MA, MB
          addSegment(fromName, pA);
          addSegment(fromName, pB);

          // Vẽ 2 bán kính OA, OB (nét mảnh/đứt để giáo viên và học sinh dễ quan sát)
          addSegment(circ.center, pA, true);
          addSegment(circ.center, pB, true);

          // Đoạn nối tâm OM
          addSegment(fromName, circ.center, true);

          // Ký hiệu góc vuông tại 2 tiếp điểm A và B
          addRightAngle(pA, fromName, circ.center);
          addRightAngle(pB, fromName, circ.center);

          executedLog.push(`Tiếp tuyến ${fromName}${pA}, ${fromName}${pB} tới (${circ.center})`);
        }
        break;
      }

      case 'DIAMETER': {
        // {"cmd": "DIAMETER", "circle": "c1", "through": "A", "otherEnd": "C"}
        const circRef = (cmd.circle || 'O').trim();
        const through = (cmd.through || 'A').trim();
        const otherEnd = (cmd.otherEnd || 'C').trim();

        const circ = circles.get(circRef) || Array.from(circles.values())[0];
        if (!circ) break;

        const centerPt = getPt(circ.center);
        const ptA = getPt(through);

        if (centerPt && ptA) {
          // Điểm C đối xứng với A qua tâm O: C = 2 * O - A
          const cx = 2 * centerPt.x - ptA.x;
          const cy = 2 * centerPt.y - ptA.y;

          points.set(otherEnd, { name: otherEnd, x: Math.round(cx * 1000) / 1000, y: Math.round(cy * 1000) / 1000 });
          addSegment(through, otherEnd);
          executedLog.push(`Đường kính ${through}${otherEnd} qua tâm ${circ.center}`);
        }
        break;
      }

      case 'MIDPOINT': {
        // {"cmd": "MIDPOINT", "of": ["A", "B"], "name": "I"}
        const [pA, pB] = toNameList(cmd.of);
        // Không tự đặt tên mặc định (trước đây là "I" → các trung điểm đè lên nhau)
        const name = String(cmd.name || cmd.foot || '').trim();
        const ptA = getPt(pA);
        const ptB = getPt(pB);

        if (ptA && ptB && name) {
          const mx = (ptA.x + ptB.x) / 2;
          const my = (ptA.y + ptB.y) / 2;
          points.set(name, { name, x: Math.round(mx * 1000) / 1000, y: Math.round(my * 1000) / 1000 });
          executedLog.push(`Trung điểm ${name} của đoạn ${pA}${pB}`);
        }
        break;
      }

      case 'PERPENDICULAR': {
        // {"cmd": "PERPENDICULAR", "from": "A", "to": ["B", "C"], "foot": "H"}
        const from = (cmd.from || '').trim();
        const toList = toNameList(cmd.to);
        const [pB, pC] = toList;
        // Tên chân đường cao: "foot" (đúng mẫu) hoặc "name" (AI hay ghi nhầm).
        // Thiếu cả hai thì bỏ qua lệnh, tránh ghi đè lên điểm H có sẵn.
        const foot = String(cmd.foot || cmd.name || '').trim();
        if (!foot) {
          console.warn('PERPENDICULAR thiếu tên chân đường cao (foot), bỏ qua:', cmd);
          break;
        }

        const ptA = getPt(from);
        const ptB = getPt(pB);
        const ptC = getPt(pC);

        if (ptA && ptB && ptC && foot) {
          const vx = ptC.x - ptB.x;
          const vy = ptC.y - ptB.y;
          const lenSq = vx * vx + vy * vy;

          if (lenSq > 1e-9) {
            const t = ((ptA.x - ptB.x) * vx + (ptA.y - ptB.y) * vy) / lenSq;
            const hx = ptB.x + t * vx;
            const hy = ptB.y + t * vy;

            points.set(foot, { name: foot, x: Math.round(hx * 1000) / 1000, y: Math.round(hy * 1000) / 1000 });
            addSegment(from, foot, Boolean(cmd.dashed));

            // Ký hiệu góc vuông tại chân đường cao H
            const armTarget = t > 0.5 ? pB : pC;
            addRightAngle(foot, from, armTarget);

            executedLog.push(`Đường cao ${from}${foot} vuông góc với ${pB}${pC}`);
          }
        }
        break;
      }

      case 'INTERSECT': {
        // {"cmd": "INTERSECT", "obj1": ["A", "B"], "obj2": ["C", "D"], "name": "E"}
        const [pA, pB] = toNameList(cmd.obj1);
        const [pC, pD] = toNameList(cmd.obj2);
        const name = String(cmd.name || '').trim();

        const ptA = getPt(pA);
        const ptB = getPt(pB);
        const ptC = getPt(pC);
        const ptD = getPt(pD);

        if (ptA && ptB && ptC && ptD && name) {
          // Giao điểm 2 đường thẳng AB và CD
          const a1 = ptB.y - ptA.y;
          const b1 = ptA.x - ptB.x;
          const c1 = a1 * ptA.x + b1 * ptA.y;

          const a2 = ptD.y - ptC.y;
          const b2 = ptC.x - ptD.x;
          const c2 = a2 * ptC.x + b2 * ptC.y;

          const det = a1 * b2 - a2 * b1;
          if (Math.abs(det) > 1e-9) {
            const ix = (c1 * b2 - c2 * b1) / det;
            const iy = (a1 * c2 - a2 * c1) / det;
            points.set(name, { name, x: Math.round(ix * 1000) / 1000, y: Math.round(iy * 1000) / 1000 });
            // Giao điểm nằm ngoài đoạn (vd: hai cạnh bên hình thang kéo dài) → vẽ phần kéo dài nét đứt
            for (const [p1, p2, n1, n2] of [
              [ptA, ptB, pA, pB],
              [ptC, ptD, pC, pD],
            ] as [MathPoint, MathPoint, string, string][]) {
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const t = ((ix - p1.x) * dx + (iy - p1.y) * dy) / (dx * dx + dy * dy || 1);
              if (t > 1 + 1e-6) addSegment(n2, name, true);
              else if (t < -1e-6) addSegment(n1, name, true);
            }
            executedLog.push(`Giao điểm ${name} của ${pA}${pB} và ${pC}${pD}`);
          }
        }
        break;
      }

      case 'BISECTOR': {
        // {"cmd": "BISECTOR", "from": "A", "to": ["B", "C"], "foot": "D"}: phân giác góc BAC cắt BC tại D
        const from = String(cmd.from || '').trim();
        const [pB, pC] = toNameList(cmd.to);
        const foot = String(cmd.foot || cmd.name || '').trim();
        const ptA = getPt(from);
        const ptB = getPt(pB);
        const ptC = getPt(pC);
        if (ptA && ptB && ptC && foot) {
          // Tính chất đường phân giác: DB / DC = AB / AC
          const ab = Math.hypot(ptB.x - ptA.x, ptB.y - ptA.y);
          const ac = Math.hypot(ptC.x - ptA.x, ptC.y - ptA.y);
          if (ab + ac > 1e-9) {
            const dx = (ac * ptB.x + ab * ptC.x) / (ab + ac);
            const dy = (ac * ptB.y + ab * ptC.y) / (ab + ac);
            points.set(foot, { name: foot, x: Math.round(dx * 1000) / 1000, y: Math.round(dy * 1000) / 1000 });
            addSegment(from, foot, Boolean(cmd.dashed));
            executedLog.push(`Phân giác ${from}${foot} của góc ${pB}${from}${pC}`);
          }
        }
        break;
      }

      case 'SEGMENT': {
        // {"cmd": "SEGMENT", "from": "A", "to": "B"} — chấp nhận cả to: ["B"] hoặc from: "AB"
        const ends = [...toNameList(cmd.from), ...toNameList(cmd.to)];
        const [from, to] = ends;
        if (from && to) {
          addSegment(from, to, Boolean(cmd.dashed));
          executedLog.push(`Đoạn thẳng ${from}${to}${cmd.dashed ? ' (nét đứt)' : ''}`);
        }
        break;
      }

      case 'POLYGON': {
        // {"cmd": "POLYGON", "names": ["A", "B", "C", "D"]}
        const vertices = cmd.names || [];
        if (vertices.length >= 3) {
          polygons.push({ vertices, fill: cmd.fill, stroke: cmd.stroke });
          for (let i = 0; i < vertices.length; i++) {
            const next = vertices[(i + 1) % vertices.length];
            addSegment(vertices[i], next);
          }
          executedLog.push(`Đa giác ${vertices.join('')}`);
        }
        break;
      }

      case 'ANGLE_MARKER': {
        const vertex = (cmd.vertex || '').trim();
        const p1 = (cmd.p1 || '').trim();
        const p2 = (cmd.p2 || '').trim();
        if (vertex && p1 && p2) {
          angleMarkers.push({
            vertex,
            p1,
            p2,
            isRight: Boolean(cmd.isRight !== false),
          });
          executedLog.push(`Ký hiệu góc tại đỉnh ${vertex}`);
        }
        break;
      }

      default:
        console.warn(`Lệnh dựng hình chưa hỗ trợ hoặc bỏ qua: ${cmd.cmd}`);
    }
  }

  if (points.size === 0) {
    return {
      success: false,
      elements: [],
      executedCommands: [],
      constructionCommands: commands,
      rawParsedJson: rawInput,
      elementCount: 0,
      error: 'Không có điểm nào được dựng từ dữ liệu AI.',
    };
  }

  // =========================================================================
  // AUTO-FIT & CENTER ENGINE (Tự động căn giữa & Tối ưu kích thước trên Canvas)
  // =========================================================================
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  // 1. Duyệt tọa độ tất cả các điểm
  for (const pt of points.values()) {
    if (Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
  }

  // 2. Duyệt bao viền các đường tròn
  for (const circ of circles.values()) {
    const center = getPt(circ.center);
    if (center && Number.isFinite(center.x) && Number.isFinite(center.y) && Number.isFinite(circ.r)) {
      if (center.x - circ.r < minX) minX = center.x - circ.r;
      if (center.x + circ.r > maxX) maxX = center.x + circ.r;
      if (center.y - circ.r < minY) minY = center.y - circ.r;
      if (center.y + circ.r > maxY) maxY = center.y + circ.r;
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    minX = -3;
    maxX = 3;
    minY = -3;
    maxY = 3;
  }

  // Tránh chia cho 0 nếu tất cả điểm trùng nhau
  let spanX = maxX - minX;
  let spanY = maxY - minY;
  if (spanX < 0.2) spanX = 2;
  if (spanY < 0.2) spanY = 2;

  // Khung vẽ hiển thị lý tưởng (khoảng cách viền)
  const paddingX = Math.max(60, canvasWidth * 0.12);
  const paddingY = Math.max(50, canvasHeight * 0.12);
  const availW = Math.max(200, canvasWidth - 2 * paddingX);
  const availH = Math.max(200, canvasHeight - 2 * paddingY);

  // Tính scale tỷ lệ: Chuẩn 1 đơn vị toán học = 50px
  const DEFAULT_SCALE = 50;
  const rawFitScale = Math.min(availW / spanX, availH / spanY);
  // Ưu tiên chuẩn 50px nếu vừa vặn trong màn hình, chỉ co lại nếu hình lớn vượt quá vùng vẽ
  const scale = Math.max(25, Math.min(DEFAULT_SCALE, Math.round(rawFitScale * 10) / 10));

  // Tọa độ trung tâm toán học & trung tâm màn hình
  const midMathX = (minX + maxX) / 2;
  const midMathY = (minY + maxY) / 2;
  const screenCenterX = canvasWidth / 2;
  const screenCenterY = canvasHeight / 2;

  // Hàm chuyển đổi từ tọa độ toán học sang tọa độ màn hình Konva:
  // x_screen = screenCenterX + (x_math - midMathX) * scale
  // y_screen = screenCenterY - (y_math - midMathY) * scale (đảo ngược dấu trục Oy toán học hướng lên trên)
  const toScreen = (mx: number, my: number): { x: number; y: number } => ({
    x: Math.round((screenCenterX + (mx - midMathX) * scale) * 10) / 10,
    y: Math.round((screenCenterY - (my - midMathY) * scale) * 10) / 10,
  });

  const finalElements: GeoElement[] = [];
  const pointElementMap = new Map<string, PointElement>();
  const now = Date.now();

  // 1. Tạo các đối tượng PointElement
  for (const pt of points.values()) {
    const sPos = toScreen(pt.x, pt.y);
    const ptEl: PointElement = {
      id: `point-${pt.name}-${now}-${Math.random().toString(36).substr(2, 4)}`,
      type: 'point',
      x: sPos.x,
      y: sPos.y,
      radius: 4.5,
      label: pt.label || pt.name,
      stroke: '#0f172a',
      strokeWidth: 2,
      strokeStyle: 'solid',
      labelFontSize: 15,
      labelColor: '#0f172a',
      labelFontFamily: 'serif',
      labelFontStyle: 'italic bold',
    };
    pointElementMap.set(pt.name, ptEl);
  }

  // Tinh chỉnh nhãn thông minh không bị đè lên hình
  const allPtsList = Array.from(pointElementMap.values());
  for (const ptEl of allPtsList) {
    const smartOffset = computeSmartPointLabelOffset(ptEl, allPtsList);
    ptEl.labelOffset = smartOffset;
    finalElements.push(ptEl);
  }

  // 2. Tạo các đối tượng CircleElement
  // Lọc chỉ lấy các đường tròn duy nhất theo tên
  const uniqueCircles = new Map<string, MathCircle>();
  for (const circ of circles.values()) {
    if (!uniqueCircles.has(circ.name)) {
      uniqueCircles.set(circ.name, circ);
    }
  }

  for (const circ of uniqueCircles.values()) {
    const centerPt = points.get(circ.center);
    if (centerPt) {
      const sCenter = toScreen(centerPt.x, centerPt.y);
      const circleEl: CircleElement = {
        id: `circle-${circ.name}-${now}-${Math.random().toString(36).substr(2, 4)}`,
        type: 'circle',
        cx: sCenter.x,
        cy: sCenter.y,
        radius: Math.round(circ.r * scale * 10) / 10,
        stroke: '#0284c7',
        strokeWidth: 2,
        strokeStyle: 'solid',
        fill: 'transparent',
      };
      finalElements.push(circleEl);
    }
  }

  // 3. Tạo các đối tượng SegmentElement
  for (const seg of segments) {
    const ptA = pointElementMap.get(seg.from);
    const ptB = pointElementMap.get(seg.to);
    if (ptA && ptB) {
      const segEl: SegmentElement = {
        id: `segment-${seg.from}-${seg.to}-${now}-${Math.random().toString(36).substr(2, 4)}`,
        type: 'segment',
        x1: ptA.x,
        y1: ptA.y,
        x2: ptB.x,
        y2: ptB.y,
        stroke: seg.dashed ? '#64748b' : '#2563eb',
        strokeWidth: seg.dashed ? 1.5 : 2,
        strokeStyle: seg.dashed ? 'dashed' : 'solid',
      };
      finalElements.push(segEl);
    }
  }

  // 4. Tạo các ký hiệu góc vuông / góc
  for (const am of angleMarkers) {
    const vPt = pointElementMap.get(am.vertex);
    const p1Pt = pointElementMap.get(am.p1);
    const p2Pt = pointElementMap.get(am.p2);

    if (vPt && p1Pt && p2Pt) {
      const angleEl: AngleElement = {
        id: `angle-${am.vertex}-${now}-${Math.random().toString(36).substr(2, 4)}`,
        type: am.isRight ? 'right_angle' : 'angle',
        vx: vPt.x,
        vy: vPt.y,
        p1x: p1Pt.x,
        p1y: p1Pt.y,
        p2x: p2Pt.x,
        p2y: p2Pt.y,
        size: 16,
        stroke: am.isRight ? '#dc2626' : '#ea580c',
        strokeWidth: 1.5,
        strokeStyle: 'solid',
        fill: am.isRight ? 'transparent' : 'rgba(234, 88, 12, 0.1)',
        vertexId: vPt.id,
        p1Id: p1Pt.id,
        p2Id: p2Pt.id,
      };
      finalElements.push(angleEl);
    }
  }

  // 5. Tạo các miền đa giác nếu có
  for (const poly of polygons) {
    const ptsCoords: number[] = [];
    for (const vName of poly.vertices) {
      const pt = pointElementMap.get(vName);
      if (pt) {
        ptsCoords.push(pt.x, pt.y);
      }
    }
    if (ptsCoords.length >= 6) {
      const polyEl: PolygonElement = {
        id: `poly-${now}-${Math.random().toString(36).substr(2, 4)}`,
        type: 'polygon',
        points: ptsCoords,
        stroke: poly.stroke || '#2563eb',
        strokeWidth: 2,
        strokeStyle: 'solid',
        fill: poly.fill || 'rgba(37, 99, 235, 0.05)',
        closed: true,
      };
      finalElements.push(polyEl);
    }
  }

  return {
    success: finalElements.length > 0,
    elements: finalElements,
    executedCommands: executedLog,
    constructionCommands: commands,
    rawParsedJson: rawInput,
    elementCount: finalElements.length,
    error: finalElements.length === 0 ? 'Không tạo được đối tượng hình học nào từ dữ liệu AI.' : undefined,
  };
}
