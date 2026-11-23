import type {
  GeoElement,
  PointElement,
  SegmentElement,
  CircleElement,
  PolygonElement,
  RightAngleElement,
  LineElement,
  AngleElement,
} from '../types/geometry';
import { getCanvasOrigin, mathToScreen } from './coordinateSystem';
import { distance } from './mathUtils';

export interface NlpParseResult {
  success: boolean;
  message: string;
  newElements?: GeoElement[];
  updatedElements?: GeoElement[];
}

const COLOR_MAP: Record<string, string> = {
  'xanh nhạt': 'rgba(59, 130, 246, 0.25)',
  'xanh dương nhạt': 'rgba(59, 130, 246, 0.25)',
  'xanh lam nhạt': 'rgba(59, 130, 246, 0.25)',
  'xanh': 'rgba(59, 130, 246, 0.35)',
  'xanh dương': 'rgba(37, 99, 235, 0.35)',
  'đỏ nhạt': 'rgba(239, 68, 68, 0.22)',
  'đỏ': 'rgba(239, 68, 68, 0.35)',
  'xanh lá nhạt': 'rgba(34, 197, 94, 0.22)',
  'xanh lá': 'rgba(34, 197, 94, 0.35)',
  'vàng nhạt': 'rgba(245, 158, 11, 0.25)',
  'vàng': 'rgba(245, 158, 11, 0.35)',
  'cam nhạt': 'rgba(249, 115, 22, 0.25)',
  'cam': 'rgba(249, 115, 22, 0.35)',
  'tím nhạt': 'rgba(168, 85, 247, 0.22)',
  'tím': 'rgba(168, 85, 247, 0.35)',
  'hồng nhạt': 'rgba(244, 114, 182, 0.25)',
  'hồng': 'rgba(244, 114, 182, 0.35)',
  'xám nhạt': 'rgba(148, 163, 184, 0.22)',
  'trong suốt': 'transparent',
  'không màu': 'transparent',
};

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[,\.:;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Helper: Tạo Đa giác đều n cạnh tổng quát
 * Tính tọa độ n đỉnh cách đều nhau trên đường tròn ngoại tiếp bán kính R bằng công thức lượng giác
 */
function createRegularPolygon(
  n: number,
  side: number,
  polygonTitle: string,
  customLabels: string[] | null,
  origin: { x: number; y: number },
  now: number,
  existingElements: GeoElement[]
): NlpParseResult {
  // Bán kính đường tròn ngoại tiếp: R = side / (2 * sin(PI / n))
  const R = side / (2 * Math.sin(Math.PI / n));

  const gid = `poly-reg-${n}-${now}`;
  const pointsFlat: number[] = [];
  const pointElements: PointElement[] = [];

  const defaultLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'];

  // Góc của đỉnh: theta_k = -PI/2 + 2*PI*k / n (đỉnh đầu tiên A nằm ở trên cùng)
  for (let k = 0; k < n; k++) {
    const theta = -Math.PI / 2 + (2 * Math.PI * k) / n;
    const mx = R * Math.cos(theta);
    const my = -R * Math.sin(theta); // math coords (y hướng lên trên)
    const s = mathToScreen(mx, -my, origin);

    pointsFlat.push(s.x, s.y);

    const label =
      customLabels && customLabels[k]
        ? customLabels[k]
        : n <= defaultLetters.length
        ? defaultLetters[k]
        : `A${k + 1}`;

    pointElements.push({
      id: `pt-${label}-${now}-${k}`,
      type: 'point',
      groupId: gid,
      x: s.x,
      y: s.y,
      radius: 4.5,
      label,
      stroke: '#0f172a',
      strokeWidth: 2,
      strokeStyle: 'solid',
    });
  }

  const polygonElement: PolygonElement = {
    id: `poly-reg-${n}-${now}`,
    type: 'polygon',
    groupId: gid,
    points: pointsFlat,
    stroke: '#2563eb',
    strokeWidth: 2,
    strokeStyle: 'solid',
    fill: 'rgba(59, 130, 246, 0.16)',
    closed: true,
  };

  return {
    success: true,
    message: `Đã vẽ ${polygonTitle} (${n} đỉnh đều) cạnh = ${side}!`,
    newElements: [...existingElements, polygonElement, ...pointElements],
  };
}

/**
 * Kiểm tra xem câu lệnh có phải là câu lệnh đơn trị, đơn giản (dưới 60 ký tự, 1 vế câu, 1 đối tượng)
 * hay là đề bài tập hình học phức tạp cần chuyển thẳng sang Gemini API.
 */
export function isSimpleSingleObjectCommand(rawPrompt: string): boolean {
  const prompt = rawPrompt.trim();

  // 1. Giới hạn độ dài: Chỉ cho phép các câu lệnh ngắn (dưới 60 ký tự)
  if (prompt.length >= 60) {
    return false;
  }

  // 2. Chứa nhiều dòng / xuống dòng => đề bài tập phức tạp
  if (prompt.includes('\n') || prompt.includes('\r')) {
    return false;
  }

  // 3. Chứa dấu chấm kết thúc câu hoặc chấm phẩy (loại trừ số thập phân như 3.5, 4.2)
  if (/(?<!\d)[.;](?!\d)/.test(prompt)) {
    return false;
  }

  const norm = prompt.toLowerCase();

  // 4. Danh sách từ khóa đặc trưng của đề bài toán hình học phức tạp (bắt buộc đẩy sang Gemini API)
  const complexKeywords = [
    'tiếp tuyến', 'tiep tuyen',
    'tiếp xúc', 'tiep xuc',
    'đường kính', 'duong kinh',
    'cắt nhau tại', 'cat nhau tai',
    'cắt nhau', 'cat nhau',
    'cắt tại', 'cat tai',
    'vuông góc với', 'vuong goc voi',
    'song song với', 'song song voi',
    'song song',
    'trung điểm', 'trung diem',
    'trung tuyến', 'trung tuyen',
    'đường cao', 'duong cao',
    'phân giác', 'phan giac',
    'nội tiếp', 'noi tiep',
    'ngoại tiếp', 'ngoai tiep',
    'giao điểm', 'giao diem',
    'hình chiếu', 'hinh chieu',
    'cho tam giác', 'cho tam giac',
    'cho đường tròn', 'cho duong tron',
    'cho hình', 'cho hinh',
    'cho tứ giác', 'cho tu giac',
    'sao cho',
    'biết ', 'biet ', 'biết rằng', 'biet rang',
    'chứng minh', 'chung minh',
    'tính ', 'tinh ',
    'tìm ', 'tim ',
    'đồng quy', 'dong quy',
    'thẳng hàng', 'thang hang',
    'nằm trên', 'nam tren',
    'lấy điểm', 'lay diem',
    'kẻ ', 'ke ',
    'hạ ', 'ha ',
    'từ điểm', 'tu diem',
    'từ ', 'tu ',
  ];

  for (const kw of complexKeywords) {
    if (norm.includes(kw)) {
      return false;
    }
  }

  // 5. Đếm số lượng đối tượng hình học xuất hiện (nếu > 1 đối tượng => bài toán phức tạp)
  let objectCount = 0;
  if (/tam giác|tam giac/.test(norm)) objectCount++;
  if (/đường tròn|duong tron|hình tròn|hinh tron/.test(norm)) objectCount++;
  if (/tứ giác|tu giac|hình vuông|hinh vuong|hình chữ nhật|hinh chu nhat|hình bình hành|hinh binh hanh/.test(norm)) objectCount++;
  if (/đa giác|da giac|ngũ giác|ngu giac|lục giác|luc giac|bát giác|bat giac/.test(norm)) objectCount++;
  if (/đoạn thẳng|doan thang|đường thẳng|duong thang/.test(norm)) objectCount++;

  if (objectCount > 1) {
    return false;
  }

  // 6. Kiểm tra số dấu phẩy (tối đa 2 dấu phẩy cho các thông số cạnh như: AB = 3, AC = 4)
  const commaCount = (prompt.match(/,/g) || []).length;
  if (commaCount >= 3) {
    return false;
  }

  return true;
}

/**
 * Parses Vietnamese geometry prompt using deterministic regex & mathematical computation
 */
export function parseVietnameseGeometry(
  prompt: string,
  existingElements: GeoElement[],
  canvasWidth: number,
  canvasHeight: number
): NlpParseResult {
  // Chỉ chạy Regex cho các câu lệnh đơn trị ngắn gọn
  if (!isSimpleSingleObjectCommand(prompt)) {
    return {
      success: false,
      message: 'Đề bài tập hình học phức tạp, cần chuyển cho Gemini API xử lý.',
    };
  }

  const norm = normalizeText(prompt);
  const origin = getCanvasOrigin(canvasWidth, canvasHeight);
  const now = Date.now();

  // -------------------------------------------------------------
  // 1. TÔ MÀU (Coloring / Fill styling)
  // "Tô màu tam giác ABC màu xanh nhạt"
  // "Đổi màu tam giác ABC thành màu đỏ"
  // -------------------------------------------------------------
  if (
    norm.startsWith('tô màu') ||
    norm.startsWith('doi mau') ||
    norm.startsWith('to mau') ||
    norm.includes('tô màu') ||
    norm.includes('to mau')
  ) {
    let matchedColor = 'rgba(59, 130, 246, 0.25)';
    let colorName = 'xanh nhạt';
    for (const [name, val] of Object.entries(COLOR_MAP)) {
      if (norm.includes(name)) {
        matchedColor = val;
        colorName = name;
        break;
      }
    }

    const polyMatch = prompt.match(/(?:tam giác|đa giác|tứ giác|hình vuông|hình chữ nhật|hình bình hành|ngũ giác|lục giác|bát giác)\s*([A-Za-z]{3,8})?/i);
    const targetPoly = existingElements.find((el) => el.type === 'polygon') as PolygonElement | undefined;
    if (targetPoly) {
      const updated = existingElements.map((el) =>
        el.id === targetPoly.id ? { ...el, fill: matchedColor } : el
      );
      const name = polyMatch && polyMatch[1] ? polyMatch[1].toUpperCase() : 'hình';
      return {
        success: true,
        message: `Đã tô màu ${name} thành màu ${colorName}!`,
        updatedElements: updated,
      };
    }

    const circleEl = existingElements.find((el) => el.type === 'circle') as CircleElement | undefined;
    if (circleEl) {
      const updated = existingElements.map((el) =>
        el.id === circleEl.id ? { ...el, fill: matchedColor } : el
      );
      return {
        success: true,
        message: `Đã tô màu đường tròn thành màu ${colorName}!`,
        updatedElements: updated,
      };
    }
  }

  // -------------------------------------------------------------
  // 2. ĐA GIÁC ĐỀU N CẠNH TỔNG QUÁT (Tính toán bằng JavaScript thuần)
  // Hỗ trợ: "lục giác đều", "lục giác", "ngũ giác đều", "ngũ giác", "bát giác đều", "bát giác",
  // "thất giác đều", "cửu giác đều", "thập giác đều", "tứ giác đều", "đa giác đều n cạnh"
  // -------------------------------------------------------------
  const regularPolyRegex =
    /(?:đa giác đều\s*(?:có\s*)?(\d+)\s*(?:cạnh|đỉnh)|đa giác\s*(?:có\s*)?(\d+)\s*(?:cạnh|đỉnh)|tứ giác đều|tu giac deu|ngũ giác|ngu giac|lục giác|luc giac|thất giác|that giac|bát giác|bat giac|cửu giác|cuu giac|thập giác|thap giac)/i;

  const regMatch = norm.match(regularPolyRegex);
  if (regMatch) {
    let n = 6;
    let title = 'Lục giác đều';

    if (regMatch[1] || regMatch[2]) {
      n = parseInt(regMatch[1] || regMatch[2], 10);
      title = `Đa giác đều ${n} cạnh`;
    } else {
      const matchedStr = regMatch[0].toLowerCase();
      if (matchedStr.includes('lục giác') || matchedStr.includes('luc giac')) {
        n = 6;
        title = 'Lục giác đều';
      } else if (matchedStr.includes('ngũ giác') || matchedStr.includes('ngu giac')) {
        n = 5;
        title = 'Ngũ giác đều';
      } else if (matchedStr.includes('bát giác') || matchedStr.includes('bat giac')) {
        n = 8;
        title = 'Bát giác đều';
      } else if (matchedStr.includes('thất giác') || matchedStr.includes('that giac')) {
        n = 7;
        title = 'Thất giác đều';
      } else if (matchedStr.includes('cửu giác') || matchedStr.includes('cuu giac')) {
        n = 9;
        title = 'Cửu giác đều';
      } else if (matchedStr.includes('thập giác') || matchedStr.includes('thap giac')) {
        n = 10;
        title = 'Thập giác đều';
      } else if (matchedStr.includes('tứ giác đều') || matchedStr.includes('tu giac deu')) {
        n = 4;
        title = 'Tứ giác đều';
      }
    }

    if (n >= 3 && n <= 30) {
      let side = 3.5;
      const sideMatch = prompt.match(/(?:cạnh|canh|độ dài|dài)\s*(?:=\s*)?(\d+(?:\.\d+)?)/i);
      if (sideMatch) {
        side = parseFloat(sideMatch[1]);
      }

      // Kiểm tra tên các đỉnh nếu có (ví dụ: lục giác đều ABCDEF)
      let customLabels: string[] | null = null;
      const nameMatch = prompt.match(/([A-Za-z]{4,10})/);
      if (nameMatch && nameMatch[1].length === n) {
        customLabels = nameMatch[1].toUpperCase().split('');
      }

      return createRegularPolygon(n, side, title, customLabels, origin, now, existingElements);
    }
  }

  // -------------------------------------------------------------
  // 3. TAM GIÁC ĐỀU (Chỉ khớp khi có ĐẦY ĐỦ cụm "tam giác đều" / "tam giac deu")
  // -------------------------------------------------------------
  if (norm.includes('tam giác đều') || norm.includes('tam giac deu')) {
    const triMatch = prompt.match(/tam giác đều\s+([A-Za-z])([A-Za-z])([A-Za-z])/i);
    const A = triMatch ? triMatch[1].toUpperCase() : 'A';
    const B = triMatch ? triMatch[2].toUpperCase() : 'B';
    const C = triMatch ? triMatch[3].toUpperCase() : 'C';

    let side = 4;
    const sideMatch = prompt.match(/(?:cạnh|canh|độ dài|dài)\s*(?:=\s*)?(\d+(?:\.\d+)?)/i);
    if (sideMatch) {
      side = parseFloat(sideMatch[1]);
    }

    return createRegularPolygon(3, side, 'Tam giác đều', [A, B, C], origin, now, existingElements);
  }

  // -------------------------------------------------------------
  // 4. TAM GIÁC VUÔNG (Ràng buộc chặt: có "tam giác" VÀ "vuông", không phải "hình vuông")
  // "Vẽ tam giác ABC vuông tại A, AB = 3, AC = 4"
  // -------------------------------------------------------------
  if (
    (norm.includes('tam giác') || norm.includes('tam giac')) &&
    norm.includes('vuông') &&
    !norm.includes('hình vuông') &&
    !norm.includes('hinh vuong')
  ) {
    const triMatch = prompt.match(/tam giác\s+([A-Za-z])([A-Za-z])([A-Za-z])/i);
    const P1 = triMatch ? triMatch[1].toUpperCase() : 'A';
    const P2 = triMatch ? triMatch[2].toUpperCase() : 'B';
    const P3 = triMatch ? triMatch[3].toUpperCase() : 'C';

    const rightMatch = prompt.match(/vuông\s+(?:tại|ở)\s+([A-Za-z])/i);
    const rightVertex = rightMatch ? rightMatch[1].toUpperCase() : P1;

    const others = [P1, P2, P3].filter((p) => p !== rightVertex);
    const V2 = others[0] || 'B';
    const V3 = others[1] || 'C';

    let side1 = 3;
    let side2 = 4;

    const len1Match = prompt.match(new RegExp(`${rightVertex}${V2}\\s*=\\s*(\\d+(?:\\.\\d+)?)`, 'i'));
    const len2Match = prompt.match(new RegExp(`${rightVertex}${V3}\\s*=\\s*(\\d+(?:\\.\\d+)?)`, 'i'));
    if (len1Match) side1 = parseFloat(len1Match[1]);
    if (len2Match) side2 = parseFloat(len2Match[1]);

    if (!len1Match && !len2Match) {
      const numMatches = [...prompt.matchAll(/(?:=\s*|\s+)(\d+(?:\.\d+)?)/g)].map((m) => parseFloat(m[1]));
      if (numMatches.length >= 2) {
        side1 = numMatches[0];
        side2 = numMatches[1];
      }
    }

    const mA = { x: -side1 / 2, y: -side2 / 2 };
    const mB = { x: -side1 / 2 + side1, y: -side2 / 2 };
    const mC = { x: -side1 / 2, y: -side2 / 2 + side2 };

    const sA = mathToScreen(mA.x, mA.y, origin);
    const sB = mathToScreen(mB.x, mB.y, origin);
    const sC = mathToScreen(mC.x, mC.y, origin);

    const gid = `rt-group-${now}`;

    const rightAngleMark: RightAngleElement = {
      id: `ra-${now}`,
      type: 'right_angle',
      groupId: gid,
      vx: sA.x,
      vy: sA.y,
      p1x: sB.x,
      p1y: sB.y,
      p2x: sC.x,
      p2y: sC.y,
      size: 16,
      stroke: '#2563eb',
      strokeWidth: 1.5,
      strokeStyle: 'solid',
      vertexId: `pt-${rightVertex}-${now}`,
      p1Id: `pt-${V2}-${now}`,
      p2Id: `pt-${V3}-${now}`,
    };

    const newElements: GeoElement[] = [
      {
        id: `poly-${now}`,
        type: 'polygon',
        groupId: gid,
        points: [sA.x, sA.y, sB.x, sB.y, sC.x, sC.y],
        stroke: '#2563eb',
        strokeWidth: 2,
        strokeStyle: 'solid',
        fill: 'rgba(59, 130, 246, 0.16)',
        closed: true,
      },
      rightAngleMark,
      {
        id: `pt-${rightVertex}-${now}`,
        type: 'point',
        groupId: gid,
        x: sA.x,
        y: sA.y,
        radius: 4.5,
        label: rightVertex,
        stroke: '#0f172a',
        strokeWidth: 2,
        strokeStyle: 'solid',
      },
      {
        id: `pt-${V2}-${now}`,
        type: 'point',
        groupId: gid,
        x: sB.x,
        y: sB.y,
        radius: 4.5,
        label: V2,
        stroke: '#0f172a',
        strokeWidth: 2,
        strokeStyle: 'solid',
      },
      {
        id: `pt-${V3}-${now}`,
        type: 'point',
        groupId: gid,
        x: sC.x,
        y: sC.y,
        radius: 4.5,
        label: V3,
        stroke: '#0f172a',
        strokeWidth: 2,
        strokeStyle: 'solid',
      },
    ];

    return {
      success: true,
      message: `Đã vẽ tam giác ${rightVertex}${V2}${V3} vuông tại ${rightVertex} với ${rightVertex}${V2} = ${side1}, ${rightVertex}${V3} = ${side2}!`,
      newElements: [...existingElements, ...newElements],
    };
  }

  // -------------------------------------------------------------
  // 5. TAM GIÁC CÂN (Isosceles triangle)
  // "Vẽ tam giác ABC cân tại A, đáy 6, cạnh bên 5"
  // -------------------------------------------------------------
  if (
    (norm.includes('tam giác') || norm.includes('tam giac')) &&
    (norm.includes('cân') || norm.includes('can'))
  ) {
    const triMatch = prompt.match(/tam giác(?:\s+cân)?\s+([A-Za-z])([A-Za-z])([A-Za-z])/i);
    const A = triMatch ? triMatch[1].toUpperCase() : 'A';
    const B = triMatch ? triMatch[2].toUpperCase() : 'B';
    const C = triMatch ? triMatch[3].toUpperCase() : 'C';

    let base = 6;
    let leg = 5;

    const baseMatch = prompt.match(/(?:đáy|day)\s*(?:=\s*)?(\d+(?:\.\d+)?)/i);
    const legMatch = prompt.match(/(?:cạnh bên|canh ben|bên)\s*(?:=\s*)?(\d+(?:\.\d+)?)/i);
    if (baseMatch) base = parseFloat(baseMatch[1]);
    if (legMatch) leg = parseFloat(legMatch[1]);

    const halfBase = base / 2;
    const h = Math.sqrt(Math.max(1, leg * leg - halfBase * halfBase));

    const mA = { x: 0, y: h / 2 };
    const mB = { x: -halfBase, y: -h / 2 };
    const mC = { x: halfBase, y: -h / 2 };

    const sA = mathToScreen(mA.x, mA.y, origin);
    const sB = mathToScreen(mB.x, mB.y, origin);
    const sC = mathToScreen(mC.x, mC.y, origin);

    const gidIso = `tri-iso-${now}`;
    const newElements: GeoElement[] = [
      {
        id: `poly-${now}`,
        type: 'polygon',
        groupId: gidIso,
        points: [sA.x, sA.y, sB.x, sB.y, sC.x, sC.y],
        stroke: '#2563eb',
        strokeWidth: 2,
        strokeStyle: 'solid',
        fill: 'rgba(59, 130, 246, 0.16)',
        closed: true,
      },
      { id: `pt-${A}-${now}`, type: 'point', groupId: gidIso, x: sA.x, y: sA.y, radius: 4.5, label: A, stroke: '#0f172a', strokeWidth: 2, strokeStyle: 'solid' },
      { id: `pt-${B}-${now}`, type: 'point', groupId: gidIso, x: sB.x, y: sB.y, radius: 4.5, label: B, stroke: '#0f172a', strokeWidth: 2, strokeStyle: 'solid' },
      { id: `pt-${C}-${now}`, type: 'point', groupId: gidIso, x: sC.x, y: sC.y, radius: 4.5, label: C, stroke: '#0f172a', strokeWidth: 2, strokeStyle: 'solid' },
    ];

    return {
      success: true,
      message: `Đã vẽ tam giác cân ${A}${B}${C} tại ${A} với đáy = ${base}, cạnh bên = ${leg}!`,
      newElements: [...existingElements, ...newElements],
    };
  }

  // -------------------------------------------------------------
  // 6. ĐƯỜNG TRÒN (Circle)
  // "Vẽ đường tròn tâm O bán kính 3"
  // "Đường tròn tâm I(1, 2) bán kính 4"
  // -------------------------------------------------------------
  if (norm.includes('đường tròn') || norm.includes('duong tron') || norm.includes('hình tròn') || norm.includes('hinh tron')) {
    if (norm.includes('ngoại tiếp') || norm.includes('ngoai tiep')) {
      const triPoints = existingElements.filter((el) => el.type === 'point') as PointElement[];
      if (triPoints.length >= 3) {
        const [p1, p2, p3] = triPoints;
        const d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
        if (Math.abs(d) > 1e-4) {
          const ux =
            ((p1.x * p1.x + p1.y * p1.y) * (p2.y - p3.y) +
              (p2.x * p2.x + p2.y * p2.y) * (p3.y - p1.y) +
              (p3.x * p3.x + p3.y * p3.y) * (p1.y - p2.y)) /
            d;
          const uy =
            ((p1.x * p1.x + p1.y * p1.y) * (p3.x - p2.x) +
              (p2.x * p2.x + p2.y * p2.y) * (p1.x - p3.x) +
              (p3.x * p3.x + p3.y * p3.y) * (p2.x - p1.x)) /
            d;
          const r = distance(ux, uy, p1.x, p1.y);

          const gidCircum = `circle-circum-${now}`;
          const circumCircle: CircleElement = {
            id: `circle-circum-${now}`,
            type: 'circle',
            groupId: gidCircum,
            cx: ux,
            cy: uy,
            radius: Math.round(r),
            stroke: '#dc2626',
            strokeWidth: 1.5,
            strokeStyle: 'dashed',
            fill: 'transparent',
          };
          const centerO: PointElement = {
            id: `pt-O-${now}`,
            type: 'point',
            groupId: gidCircum,
            x: ux,
            y: uy,
            radius: 4,
            label: 'O',
            stroke: '#dc2626',
            strokeWidth: 2,
            strokeStyle: 'solid',
          };

          return {
            success: true,
            message: `Đã vẽ đường tròn ngoại tiếp tam giác tâm O bán kính ${(r / 50).toFixed(1)} đơn vị!`,
            newElements: [...existingElements, circumCircle, centerO],
          };
        }
      }
    }

    let centerName = 'O';
    let cx = 0;
    let cy = 0;
    let radius = 3;

    const centerMatch = prompt.match(/tâm\s+([A-Za-z])(?:\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\))?/i);
    if (centerMatch) {
      centerName = centerMatch[1].toUpperCase();
      if (centerMatch[2] && centerMatch[3]) {
        cx = parseFloat(centerMatch[2]);
        cy = parseFloat(centerMatch[3]);
      }
    }

    const rMatch = prompt.match(/(?:bán kính|r|bk)\s*(?:=\s*)?(\d+(?:\.\d+)?)/i);
    if (rMatch) {
      radius = parseFloat(rMatch[1]);
    } else {
      const numMatch = prompt.match(/(?:tâm\s+[A-Za-z]\s+)(\d+(?:\.\d+)?)/i);
      if (numMatch) radius = parseFloat(numMatch[1]);
    }

    const sCenter = mathToScreen(cx, cy, origin);
    const radiusPx = radius * 50;
    const gidCircle = `circle-group-${now}`;

    const newCircle: CircleElement = {
      id: `circle-${now}`,
      type: 'circle',
      groupId: gidCircle,
      cx: sCenter.x,
      cy: sCenter.y,
      radius: Math.round(radiusPx),
      stroke: '#0f172a',
      strokeWidth: 2,
      strokeStyle: 'solid',
      fill: 'transparent',
    };

    const centerPoint: PointElement = {
      id: `pt-${centerName}-${now}`,
      type: 'point',
      groupId: gidCircle,
      x: sCenter.x,
      y: sCenter.y,
      radius: 4,
      label: centerName,
      stroke: '#0f172a',
      strokeWidth: 2,
      strokeStyle: 'solid',
    };

    return {
      success: true,
      message: `Đã vẽ đường tròn tâm ${centerName}(${cx}, ${cy}) bán kính R = ${radius}!`,
      newElements: [...existingElements, newCircle, centerPoint],
    };
  }

  // -------------------------------------------------------------
  // 7. HÌNH VUÔNG (Square)
  // "Vẽ hình vuông ABCD cạnh 4"
  // -------------------------------------------------------------
  if (norm.includes('hình vuông') || norm.includes('hinh vuong')) {
    let side = 4;
    const sideMatch = prompt.match(/(?:cạnh|canh|độ dài|dài)\s*(?:=\s*)?(\d+(?:\.\d+)?)/i);
    if (sideMatch) side = parseFloat(sideMatch[1]);

    const half = side / 2;
    const sA = mathToScreen(-half, half, origin);
    const sB = mathToScreen(half, half, origin);
    const sC = mathToScreen(half, -half, origin);
    const sD = mathToScreen(-half, -half, origin);

    const gidSquare = `square-group-${now}`;
    const newElements: GeoElement[] = [
      {
        id: `poly-${now}`,
        type: 'polygon',
        groupId: gidSquare,
        points: [sA.x, sA.y, sB.x, sB.y, sC.x, sC.y, sD.x, sD.y],
        stroke: '#0f172a',
        strokeWidth: 2,
        strokeStyle: 'solid',
        fill: 'rgba(59, 130, 246, 0.12)',
        closed: true,
      },
      { id: `pt-A-${now}`, type: 'point', groupId: gidSquare, x: sA.x, y: sA.y, radius: 4, label: 'A', stroke: '#0f172a', strokeWidth: 2, strokeStyle: 'solid' },
      { id: `pt-B-${now}`, type: 'point', groupId: gidSquare, x: sB.x, y: sB.y, radius: 4, label: 'B', stroke: '#0f172a', strokeWidth: 2, strokeStyle: 'solid' },
      { id: `pt-C-${now}`, type: 'point', groupId: gidSquare, x: sC.x, y: sC.y, radius: 4, label: 'C', stroke: '#0f172a', strokeWidth: 2, strokeStyle: 'solid' },
      { id: `pt-D-${now}`, type: 'point', groupId: gidSquare, x: sD.x, y: sD.y, radius: 4, label: 'D', stroke: '#0f172a', strokeWidth: 2, strokeStyle: 'solid' },
    ];

    return {
      success: true,
      message: `Đã vẽ hình vuông ABCD cạnh ${side}!`,
      newElements: [...existingElements, ...newElements],
    };
  }

  // -------------------------------------------------------------
  // 8. HÌNH CHỮ NHẬT (Rectangle)
  // "Vẽ hình chữ nhật ABCD có AB = 5, BC = 3"
  // -------------------------------------------------------------
  if (norm.includes('hình chữ nhật') || norm.includes('hinh chu nhat')) {
    let w = 5;
    let h = 3;
    const nums = [...prompt.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => parseFloat(m[1]));
    if (nums.length >= 2) {
      w = nums[0];
      h = nums[1];
    }

    const sA = mathToScreen(-w / 2, h / 2, origin);
    const sB = mathToScreen(w / 2, h / 2, origin);
    const sC = mathToScreen(w / 2, -h / 2, origin);
    const sD = mathToScreen(-w / 2, -h / 2, origin);

    const gidRect = `rect-group-${now}`;
    const newElements: GeoElement[] = [
      {
        id: `poly-${now}`,
        type: 'polygon',
        groupId: gidRect,
        points: [sA.x, sA.y, sB.x, sB.y, sC.x, sC.y, sD.x, sD.y],
        stroke: '#0f172a',
        strokeWidth: 2,
        strokeStyle: 'solid',
        fill: 'rgba(59, 130, 246, 0.12)',
        closed: true,
      },
      { id: `pt-A-${now}`, type: 'point', groupId: gidRect, x: sA.x, y: sA.y, radius: 4, label: 'A', stroke: '#0f172a', strokeWidth: 2, strokeStyle: 'solid' },
      { id: `pt-B-${now}`, type: 'point', groupId: gidRect, x: sB.x, y: sB.y, radius: 4, label: 'B', stroke: '#0f172a', strokeWidth: 2, strokeStyle: 'solid' },
      { id: `pt-C-${now}`, type: 'point', groupId: gidRect, x: sC.x, y: sC.y, radius: 4, label: 'C', stroke: '#0f172a', strokeWidth: 2, strokeStyle: 'solid' },
      { id: `pt-D-${now}`, type: 'point', groupId: gidRect, x: sD.x, y: sD.y, radius: 4, label: 'D', stroke: '#0f172a', strokeWidth: 2, strokeStyle: 'solid' },
    ];

    return {
      success: true,
      message: `Đã vẽ hình chữ nhật ABCD kích thước ${w} × ${h}!`,
      newElements: [...existingElements, ...newElements],
    };
  }

  // -------------------------------------------------------------
  // 9. HÌNH BÌNH HÀNH (Parallelogram)
  // "Vẽ hình bình hành ABCD"
  // -------------------------------------------------------------
  if (norm.includes('hình bình hành') || norm.includes('hinh binh hanh')) {
    const sA = mathToScreen(-3, -1.5, origin);
    const sB = mathToScreen(1.5, -1.5, origin);
    const sC = mathToScreen(3, 1.5, origin);
    const sD = mathToScreen(-1.5, 1.5, origin);

    const gidPara = `para-group-${now}`;
    const newElements: GeoElement[] = [
      {
        id: `poly-${now}`,
        type: 'polygon',
        groupId: gidPara,
        points: [sA.x, sA.y, sB.x, sB.y, sC.x, sC.y, sD.x, sD.y],
        stroke: '#0f172a',
        strokeWidth: 2,
        strokeStyle: 'solid',
        fill: 'rgba(245, 158, 11, 0.16)',
        closed: true,
      },
      { id: `pt-A-${now}`, type: 'point', groupId: gidPara, x: sA.x, y: sA.y, radius: 4, label: 'A', stroke: '#0f172a', strokeWidth: 2, strokeStyle: 'solid' },
      { id: `pt-B-${now}`, type: 'point', groupId: gidPara, x: sB.x, y: sB.y, radius: 4, label: 'B', stroke: '#0f172a', strokeWidth: 2, strokeStyle: 'solid' },
      { id: `pt-C-${now}`, type: 'point', groupId: gidPara, x: sC.x, y: sC.y, radius: 4, label: 'C', stroke: '#0f172a', strokeWidth: 2, strokeStyle: 'solid' },
      { id: `pt-D-${now}`, type: 'point', groupId: gidPara, x: sD.x, y: sD.y, radius: 4, label: 'D', stroke: '#0f172a', strokeWidth: 2, strokeStyle: 'solid' },
    ];

    return {
      success: true,
      message: 'Đã vẽ hình bình hành ABCD!',
      newElements: [...existingElements, ...newElements],
    };
  }

  // -------------------------------------------------------------
  // 10. ĐOẠN THẲNG & TRUNG ĐIỂM
  // -------------------------------------------------------------
  if (norm.includes('trung điểm') || norm.includes('trung diem')) {
    const ptMatch = prompt.match(/trung điểm\s+([A-Za-z])(?:\s+của\s+([A-Za-z])([A-Za-z]))?/i);
    const mName = ptMatch ? ptMatch[1].toUpperCase() : 'M';
    const p1Name = ptMatch && ptMatch[2] ? ptMatch[2].toUpperCase() : 'A';
    const p2Name = ptMatch && ptMatch[3] ? ptMatch[3].toUpperCase() : 'B';

    const p1 = existingElements.find((el) => el.type === 'point' && (el as PointElement).label === p1Name) as PointElement | undefined;
    const p2 = existingElements.find((el) => el.type === 'point' && (el as PointElement).label === p2Name) as PointElement | undefined;

    if (p1 && p2) {
      const midPoint: PointElement = {
        id: `pt-${mName}-${now}`,
        type: 'point',
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
        radius: 4.5,
        label: mName,
        stroke: '#2563eb',
        strokeWidth: 2,
        strokeStyle: 'solid',
      };
      return {
        success: true,
        message: `Đã xác định trung điểm ${mName} của đoạn thẳng ${p1Name}${p2Name}!`,
        newElements: [...existingElements, midPoint],
      };
    }
  }

  if (norm.includes('đoạn thẳng') || norm.includes('doan thang')) {
    const segMatch = prompt.match(/đoạn thẳng\s+([A-Za-z])([A-Za-z])/i);
    const p1Name = segMatch ? segMatch[1].toUpperCase() : 'A';
    const p2Name = segMatch ? segMatch[2].toUpperCase() : 'B';

    const sA = mathToScreen(-2.5, 0, origin);
    const sB = mathToScreen(2.5, 0, origin);

    const newSeg: SegmentElement = {
      id: `seg-${now}`,
      type: 'segment',
      x1: sA.x,
      y1: sA.y,
      x2: sB.x,
      y2: sB.y,
      stroke: '#0f172a',
      strokeWidth: 2,
      strokeStyle: 'solid',
    };
    const pt1: PointElement = { id: `pt-${p1Name}-${now}`, type: 'point', x: sA.x, y: sA.y, radius: 4.5, label: p1Name, stroke: '#0f172a', strokeWidth: 2, strokeStyle: 'solid' };
    const pt2: PointElement = { id: `pt-${p2Name}-${now}`, type: 'point', x: sB.x, y: sB.y, radius: 4.5, label: p2Name, stroke: '#0f172a', strokeWidth: 2, strokeStyle: 'solid' };

    return {
      success: true,
      message: `Đã vẽ đoạn thẳng ${p1Name}${p2Name}!`,
      newElements: [...existingElements, newSeg, pt1, pt2],
    };
  }

  // -------------------------------------------------------------
  // 11. TAM GIÁC THƯỜNG CƠ BẢN
  // -------------------------------------------------------------
  const simpleTriMatch = norm.match(/^vẽ tam giác\s+([a-z])([a-z])([a-z])$/);
  if (simpleTriMatch) {
    const A = simpleTriMatch[1].toUpperCase();
    const B = simpleTriMatch[2].toUpperCase();
    const C = simpleTriMatch[3].toUpperCase();

    const sA = mathToScreen(0, 2.5, origin);
    const sB = mathToScreen(-3, -1.8, origin);
    const sC = mathToScreen(3, -1.8, origin);

    const newElements: GeoElement[] = [
      {
        id: `poly-${now}`,
        type: 'polygon',
        points: [sA.x, sA.y, sB.x, sB.y, sC.x, sC.y],
        stroke: '#2563eb',
        strokeWidth: 2,
        strokeStyle: 'solid',
        fill: 'rgba(59, 130, 246, 0.16)',
        closed: true,
      },
      { id: `pt-${A}-${now}`, type: 'point', x: sA.x, y: sA.y, radius: 4.5, label: A, stroke: '#0f172a', strokeWidth: 2, strokeStyle: 'solid' },
      { id: `pt-${B}-${now}`, type: 'point', x: sB.x, y: sB.y, radius: 4.5, label: B, stroke: '#0f172a', strokeWidth: 2, strokeStyle: 'solid' },
      { id: `pt-${C}-${now}`, type: 'point', x: sC.x, y: sC.y, radius: 4.5, label: C, stroke: '#0f172a', strokeWidth: 2, strokeStyle: 'solid' },
    ];

    return {
      success: true,
      message: `Đã vẽ tam giác ${A}${B}${C}!`,
      newElements: [...existingElements, ...newElements],
    };
  }

  // -------------------------------------------------------------
  // 11b. TIA, GÓC xOy, ĐƯỜNG THẲNG (có nhãn chữ thường)
  // "vẽ tia Ox", "vẽ góc xOy = 60 độ", "vẽ đường thẳng d", "vẽ đường thẳng xy", "vẽ đường thẳng AB"
  // -------------------------------------------------------------
  {
    const raw = prompt.trim();
    const findPoint = (label: string) =>
      existingElements.find((el) => el.type === 'point' && (el as PointElement).label === label) as PointElement | undefined;
    const makePoint = (label: string, mx: number, my: number): PointElement => {
      const sp = mathToScreen(mx, my, origin);
      return {
        id: `pt-${label}-${now}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'point', x: sp.x, y: sp.y, radius: 4.5, label,
        stroke: '#0f172a', strokeWidth: 2, strokeStyle: 'solid',
      };
    };
    const makeLine = (a: { x: number; y: number }, b: { x: number; y: number }, extra: Partial<LineElement>): LineElement => ({
      id: `line-${now}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      stroke: '#2563eb', strokeWidth: 2, strokeStyle: 'solid', ...extra,
    });
    const dirPoint = (p: { x: number; y: number }, deg: number) => ({
      x: p.x + 100 * Math.cos((deg * Math.PI) / 180),
      y: p.y - 100 * Math.sin((deg * Math.PI) / 180),
    });

    // Góc xOy = 60 độ (hoặc "bằng 60°")
    const angleMatch = raw.match(/góc\s+([a-z])([A-Z])([a-z])\s*(?:=|bằng|có số đo)?\s*(\d+(?:[.,]\d+)?)\s*(?:°|độ|o)?/i);
    if (angleMatch && /góc/i.test(raw)) {
      const [, l1, vName, l2, degRaw] = angleMatch;
      const deg = parseFloat(degRaw.replace(',', '.'));
      if (deg > 0 && deg < 360) {
        const existing = findPoint(vName);
        const vertex = existing ?? makePoint(vName, -2, -1.5);
        const arm1 = dirPoint(vertex, 0);
        const arm2 = dirPoint(vertex, deg);
        const angleEl: AngleElement = {
          id: `angle-${now}`,
          type: Math.abs(deg - 90) < 0.01 ? 'right_angle' : 'angle',
          vx: vertex.x, vy: vertex.y, p1x: arm1.x, p1y: arm1.y, p2x: arm2.x, p2y: arm2.y,
          size: 28, arcType: 'single', stroke: '#dc2626', strokeWidth: 1.5, strokeStyle: 'solid',
        };
        const created: GeoElement[] = [
          ...(existing ? [] : [vertex]),
          makeLine(vertex, arm1, { isRay: true, endLabel: l1 }),
          makeLine(vertex, arm2, { isRay: true, endLabel: l2 }),
          angleEl,
        ];
        return { success: true, message: `Đã vẽ góc ${l1}${vName}${l2} = ${deg}°!`, newElements: [...existingElements, ...created] };
      }
    }

    // Tia Ox
    const rayMatch = raw.match(/tia\s+([A-Z])([a-z])(?![A-Za-z])/);
    if (rayMatch) {
      const [, vName, label] = rayMatch;
      const existing = findPoint(vName);
      const vertex = existing ?? makePoint(vName, -3, 0);
      const created: GeoElement[] = [...(existing ? [] : [vertex]), makeLine(vertex, dirPoint(vertex, 0), { isRay: true, endLabel: label })];
      return { success: true, message: `Đã vẽ tia ${vName}${label}!`, newElements: [...existingElements, ...created] };
    }

    // Đường thẳng AB (qua 2 điểm có tên) / đường thẳng xy / đường thẳng d
    const lineMatch = raw.match(/đường thẳng\s+(?:([A-Z])([A-Z])|([a-z])([a-z])?)(?![A-Za-z])/);
    if (lineMatch) {
      if (lineMatch[1]) {
        const [, aName, bName] = lineMatch;
        const a = findPoint(aName) ?? makePoint(aName, -2, -1);
        const b = findPoint(bName) ?? makePoint(bName, 2, 1);
        const created: GeoElement[] = [
          ...(findPoint(aName) ? [] : [a]),
          ...(findPoint(bName) ? [] : [b]),
          makeLine(a, b, {}),
        ];
        return { success: true, message: `Đã vẽ đường thẳng ${aName}${bName}!`, newElements: [...existingElements, ...created] };
      }
      const [l1, l2] = [lineMatch[3], lineMatch[4]];
      const a = mathToScreen(-3, -1, origin);
      const b = mathToScreen(3, -1, origin);
      const line = makeLine(a, b, l2 ? { startLabel: l1, endLabel: l2 } : { endLabel: l1 });
      return { success: true, message: `Đã vẽ đường thẳng ${l2 ? l1 + l2 : l1}!`, newElements: [...existingElements, line] };
    }
  }

  // -------------------------------------------------------------
  // 12. TỨ GIÁC THƯỜNG (Quadrilateral)
  // "Vẽ tứ giác ABCD", "vẽ tứ giác MNPQ", "vẽ tứ giác" (mặc định ABCD)
  // (Tứ giác đều đã được xử lý ở mục 2)
  // -------------------------------------------------------------
  const quadMatch = norm.match(/(?:tứ giác|tu giac)(?:\s+([a-z])([a-z])([a-z])([a-z]))?(?![a-z])/);
  if (quadMatch && !/(?:tứ giác|tu giac)\s+(?:đều|deu)/.test(norm)) {
    const names = quadMatch[1]
      ? [quadMatch[1], quadMatch[2], quadMatch[3], quadMatch[4]].map((c) => c.toUpperCase())
      : ['A', 'B', 'C', 'D'];

    // Tứ giác lồi không đặc biệt (không song song, không bằng nhau) để nhìn rõ là tứ giác thường
    const coords: [number, number][] = [
      [-3, 2],
      [-3.8, -2],
      [3.2, -2],
      [2, 2.6],
    ];
    const screenPts = coords.map(([x, y]) => mathToScreen(x, y, origin));
    const gidQuad = `quad-group-${now}`;

    const newElements: GeoElement[] = [
      {
        id: `poly-${now}`,
        type: 'polygon',
        groupId: gidQuad,
        points: screenPts.flatMap((pt) => [pt.x, pt.y]),
        stroke: '#2563eb',
        strokeWidth: 2,
        strokeStyle: 'solid',
        fill: 'rgba(59, 130, 246, 0.16)',
        closed: true,
      },
      ...screenPts.map(
        (pt, i): GeoElement => ({
          id: `pt-${names[i]}-${now}`,
          type: 'point',
          groupId: gidQuad,
          x: pt.x,
          y: pt.y,
          radius: 4.5,
          label: names[i],
          stroke: '#0f172a',
          strokeWidth: 2,
          strokeStyle: 'solid',
        }),
      ),
    ];

    return {
      success: true,
      message: `Đã vẽ tứ giác ${names.join('')}!`,
      newElements: [...existingElements, ...newElements],
    };
  }

  return {
    success: false,
    message: 'Hình học này phức tạp hoặc nằm ngoài mẫu cơ bản, cần chuyển tiếp sang Gemini AI để phân tích.',
  };
}
