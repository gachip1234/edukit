import type {
  GeoElement,
  PointElement,
  SegmentElement,
  LineElement,
  CircleElement,
  PolygonElement,
  AngleElement,
  LatexElement,
} from '../types/geometry';
import {
  getCanvasOrigin,
  mathToScreen,
  UNIT_STEP,
} from './coordinateSystem';
import { generateLabel, distance } from './mathUtils';

export interface ParseResult {
  success: boolean;
  message: string;
  newElements?: GeoElement[];
  selectedId?: string;
}

/**
 * Finds a point element by its label (case-insensitive)
 */
function findPointByLabel(elements: GeoElement[], label: string): PointElement | undefined {
  const norm = label.trim().toLowerCase();
  return elements.find(
    (el): el is PointElement => el.type === 'point' && (el.label?.toLowerCase() === norm)
  );
}

/**
 * Parses either a point name (e.g. "A") or an inline coordinate "(2, 3)"
 */
function resolveCoordinate(
  token: string,
  elements: GeoElement[],
  origin: { x: number; y: number }
): { x: number; y: number; label?: string } | null {
  const trimmed = token.trim();

  // Check if token is inline tuple e.g. "(2, 3)" or "2, 3"
  const tupleMatch = trimmed.match(/^\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?$/);
  if (tupleMatch) {
    const mx = parseFloat(tupleMatch[1]);
    const my = parseFloat(tupleMatch[2]);
    const screen = mathToScreen(mx, my, origin);
    return { x: screen.x, y: screen.y };
  }

  // Otherwise check if it's an existing point label
  const pt = findPointByLabel(elements, trimmed);
  if (pt) {
    return { x: pt.x, y: pt.y, label: pt.label };
  }

  return null;
}

export function parseAndExecuteCommand(
  rawInput: string,
  existingElements: GeoElement[],
  canvasWidth: number,
  canvasHeight: number
): ParseResult {
  const input = rawInput.trim();
  if (!input) {
    return { success: false, message: 'Vui lòng nhập lệnh!' };
  }

  const origin = getCanvasOrigin(canvasWidth, canvasHeight);

  // -------------------------------------------------------------
  // 1. Point definition: `A = (2, 3)` or `(2, 3)` or `A = Point(2, 3)`
  // -------------------------------------------------------------
  const pointAssignMatch = input.match(
    /^([A-Za-z0-9_]+)\s*=\s*(?:Point|Diem)?\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/i
  );
  if (pointAssignMatch) {
    const label = pointAssignMatch[1];
    const mx = parseFloat(pointAssignMatch[2]);
    const my = parseFloat(pointAssignMatch[3]);
    const screen = mathToScreen(mx, my, origin);

    // If point with same label exists, update it; otherwise create new
    const existingIndex = existingElements.findIndex(
      (el) => el.type === 'point' && el.label?.toLowerCase() === label.toLowerCase()
    );

    const newPoint: PointElement = {
      id: existingIndex >= 0 ? existingElements[existingIndex].id : `pt-${label}-${Date.now()}`,
      type: 'point',
      x: screen.x,
      y: screen.y,
      radius: 4.5,
      label,
      stroke: '#0f172a',
      strokeWidth: 2,
      strokeStyle: 'solid',
    };

    let updated: GeoElement[];
    if (existingIndex >= 0) {
      updated = [...existingElements];
      updated[existingIndex] = newPoint;
    } else {
      updated = [...existingElements, newPoint];
    }

    return {
      success: true,
      message: `Đã tạo điểm ${label} tại tọa độ (${mx}, ${my})`,
      newElements: updated,
      selectedId: newPoint.id,
    };
  }

  // Bare tuple without label: `(2, 3)`
  const bareTupleMatch = input.match(/^\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/);
  if (bareTupleMatch) {
    const mx = parseFloat(bareTupleMatch[1]);
    const my = parseFloat(bareTupleMatch[2]);
    const screen = mathToScreen(mx, my, origin);
    const pointCount = existingElements.filter((el) => el.type === 'point').length;
    const label = generateLabel(pointCount);

    const newPoint: PointElement = {
      id: `pt-${label}-${Date.now()}`,
      type: 'point',
      x: screen.x,
      y: screen.y,
      radius: 4.5,
      label,
      stroke: '#0f172a',
      strokeWidth: 2,
      strokeStyle: 'solid',
    };

    return {
      success: true,
      message: `Đã tạo điểm ${label} tại tọa độ (${mx}, ${my})`,
      newElements: [...existingElements, newPoint],
      selectedId: newPoint.id,
    };
  }

  // -------------------------------------------------------------
  // 2. Midpoint: `M = TrungDiem(A, B)` or `TrungDiem(A, B)` or `Midpoint(A, B)`
  // -------------------------------------------------------------
  const midpointMatch = input.match(
    /^(?:([A-Za-z0-9_]+)\s*=\s*)?(?:TrungDiem|Midpoint)\s*\(\s*([A-Za-z0-9_]+)\s*,\s*([A-Za-z0-9_]+)\s*\)$/i
  );
  if (midpointMatch) {
    const customLabel = midpointMatch[1];
    const p1Label = midpointMatch[2];
    const p2Label = midpointMatch[3];

    const p1 = findPointByLabel(existingElements, p1Label);
    const p2 = findPointByLabel(existingElements, p2Label);

    if (!p1) return { success: false, message: `Không tìm thấy điểm ${p1Label}!` };
    if (!p2) return { success: false, message: `Không tìm thấy điểm ${p2Label}!` };

    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const label = customLabel || `M_${p1Label}${p2Label}`;

    const newPoint: PointElement = {
      id: `pt-${label}-${Date.now()}`,
      type: 'point',
      x: midX,
      y: midY,
      radius: 4.5,
      label,
      stroke: '#2563eb',
      strokeWidth: 2,
      strokeStyle: 'solid',
    };

    return {
      success: true,
      message: `Đã tạo trung điểm ${label} của đoạn thẳng ${p1Label}${p2Label}`,
      newElements: [...existingElements, newPoint],
      selectedId: newPoint.id,
    };
  }

  // -------------------------------------------------------------
  // 3. Segment: `DoanThang(A, B)` or `DoanThangDut(A, B)` or `Segment(A, B, "dashed")`
  // -------------------------------------------------------------
  const segmentMatch = input.match(
    /^(?:DoanThang|Segment|DoanThangDut)\s*\(\s*([^,]+)\s*,\s*([^,)]+)(?:\s*,\s*["']?([^"')]+)["']?)?\s*\)$/i
  );
  if (segmentMatch) {
    const isDashedCommand = /^DoanThangDut/i.test(input);
    const styleArg = (segmentMatch[3] || '').trim().toLowerCase();
    const strokeStyle: 'solid' | 'dashed' | 'dotted' =
      isDashedCommand || styleArg === 'dashed' || styleArg === 'dut'
        ? 'dashed'
        : styleArg === 'dotted' || styleArg === 'cham'
        ? 'dotted'
        : 'solid';

    const p1 = resolveCoordinate(segmentMatch[1], existingElements, origin);
    const p2 = resolveCoordinate(segmentMatch[2], existingElements, origin);

    if (!p1) return { success: false, message: `Không xác định được điểm thứ nhất: "${segmentMatch[1]}"` };
    if (!p2) return { success: false, message: `Không xác định được điểm thứ hai: "${segmentMatch[2]}"` };

    const newSeg: SegmentElement = {
      id: `seg-${Date.now()}`,
      type: 'segment',
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      stroke: strokeStyle === 'dashed' ? '#64748b' : '#0f172a',
      strokeWidth: 2,
      strokeStyle,
    };

    return {
      success: true,
      message: `Đã vẽ đoạn thẳng ${strokeStyle === 'dashed' ? 'nét đứt ' : ''}nối ${p1.label || 'P1'} và ${p2.label || 'P2'}`,
      newElements: [...existingElements, newSeg],
      selectedId: newSeg.id,
    };
  }

  // -------------------------------------------------------------
  // 4. Line: `DuongThang(A, B)` or `Line(A, B)`
  // -------------------------------------------------------------
  const lineMatch = input.match(/^(?:DuongThang|Line)\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)$/i);
  if (lineMatch) {
    const p1 = resolveCoordinate(lineMatch[1], existingElements, origin);
    const p2 = resolveCoordinate(lineMatch[2], existingElements, origin);

    if (!p1) return { success: false, message: `Không xác định được điểm: "${lineMatch[1]}"` };
    if (!p2) return { success: false, message: `Không xác định được điểm: "${lineMatch[2]}"` };

    const newLine: LineElement = {
      id: `line-${Date.now()}`,
      type: 'line',
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      stroke: '#0f172a',
      strokeWidth: 2,
      strokeStyle: 'solid',
    };

    return {
      success: true,
      message: `Đã vẽ đường thẳng đi qua ${p1.label || 'P1'} và ${p2.label || 'P2'}`,
      newElements: [...existingElements, newLine],
      selectedId: newLine.id,
    };
  }

  // -------------------------------------------------------------
  // 5. Circle: `DuongTron(A, 4)` or `DuongTron(A, B)` or `Circle(...)`
  // -------------------------------------------------------------
  const circleMatch = input.match(/^(?:DuongTron|Circle)\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)$/i);
  if (circleMatch) {
    const centerToken = circleMatch[1].trim();
    const arg2 = circleMatch[2].trim();

    const center = resolveCoordinate(centerToken, existingElements, origin);
    if (!center) return { success: false, message: `Không xác định được tâm đường tròn: "${centerToken}"` };

    let radiusPx = 0;
    // Check if arg2 is a numeric radius in math units
    const radiusNum = parseFloat(arg2);
    if (!isNaN(radiusNum) && radiusNum > 0 && !arg2.includes('(')) {
      radiusPx = radiusNum * UNIT_STEP;
    } else {
      // arg2 is a second point on the circle
      const p2 = resolveCoordinate(arg2, existingElements, origin);
      if (!p2) return { success: false, message: `Bán kính hoặc điểm thứ hai không hợp lệ: "${arg2}"` };
      radiusPx = distance(center.x, center.y, p2.x, p2.y);
    }

    const circleGid = `group-circle-${Date.now()}`;
    const newCircle: CircleElement = {
      id: `circle-${Date.now()}`,
      type: 'circle',
      groupId: circleGid,
      cx: center.x,
      cy: center.y,
      radius: Math.round(radiusPx),
      stroke: '#0f172a',
      strokeWidth: 2,
      strokeStyle: 'solid',
      fill: 'transparent',
    };

    const updatedExisting = existingElements.map((el) => {
      if (el.type === 'point' && center.label && el.label === center.label) {
        return { ...el, groupId: el.groupId || circleGid };
      }
      return el;
    });

    return {
      success: true,
      message: `Đã vẽ đường tròn tâm ${center.label || 'O'} bán kính ${
        !isNaN(radiusNum) ? radiusNum : Math.round(radiusPx / UNIT_STEP)
      } đơn vị`,
      newElements: [...updatedExisting, newCircle],
      selectedId: newCircle.id,
    };
  }

  // -------------------------------------------------------------
  // 6. Polygon / Triangle: `DaGiac(A, B, C, ...)` or `TamGiac(A, B, C)`
  // -------------------------------------------------------------
  const polygonMatch = input.match(/^(?:DaGiac|Polygon|TamGiac|Triangle)\s*\((.+)\)$/i);
  if (polygonMatch) {
    const args = polygonMatch[1].split(',').map((s) => s.trim());
    if (args.length < 3) {
      return { success: false, message: 'Đa giác cần ít nhất 3 đỉnh (Ví dụ: DaGiac(A, B, C))' };
    }

    const points: number[] = [];
    const labels: string[] = [];
    for (const arg of args) {
      const pt = resolveCoordinate(arg, existingElements, origin);
      if (!pt) {
        return { success: false, message: `Không tìm thấy điểm "${arg}"` };
      }
      points.push(pt.x, pt.y);
      labels.push(pt.label || '?');
    }

    const polyGid = `group-poly-${Date.now()}`;
    const newPoly: PolygonElement = {
      id: `poly-${Date.now()}`,
      type: 'polygon',
      groupId: polyGid,
      points,
      stroke: '#2563eb',
      strokeWidth: 2,
      strokeStyle: 'solid',
      fill: 'rgba(59, 130, 246, 0.2)',
      closed: true,
    };

    const updatedExisting = existingElements.map((el) => {
      if (el.type === 'point' && el.label && labels.includes(el.label)) {
        return { ...el, groupId: el.groupId || polyGid };
      }
      return el;
    });

    return {
      success: true,
      message: `Đã vẽ đa giác ${labels.join('')}`,
      newElements: [...updatedExisting, newPoly],
      selectedId: newPoly.id,
    };
  }

  // -------------------------------------------------------------
  // 6b. Angle: `Goc(B, A, C)` or `Angle(B, A, C)` or `GocVuong(B, A, C)`
  // -------------------------------------------------------------
  const angleMatch = input.match(
    /^(?:Goc|Angle|GocVuong|RightAngle)\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)$/i
  );
  if (angleMatch) {
    const p1Token = angleMatch[1].trim();
    const vToken = angleMatch[2].trim();
    const p2Token = angleMatch[3].trim();

    const p1 = resolveCoordinate(p1Token, existingElements, origin);
    const v = resolveCoordinate(vToken, existingElements, origin);
    const p2 = resolveCoordinate(p2Token, existingElements, origin);

    if (!p1) return { success: false, message: `Không tìm thấy điểm thứ nhất: "${p1Token}"` };
    if (!v) return { success: false, message: `Không tìm thấy đỉnh góc: "${vToken}"` };
    if (!p2) return { success: false, message: `Không tìm thấy điểm thứ hai: "${p2Token}"` };

    const ptP1 = findPointByLabel(existingElements, p1Token);
    const ptV = findPointByLabel(existingElements, vToken);
    const ptP2 = findPointByLabel(existingElements, p2Token);

    const newAngle: AngleElement = {
      id: `angle-${Date.now()}`,
      type: 'angle',
      vx: v.x,
      vy: v.y,
      p1x: p1.x,
      p1y: p1.y,
      p2x: p2.x,
      p2y: p2.y,
      size: 24,
      stroke: '#2563eb',
      strokeWidth: 1.5,
      strokeStyle: 'solid',
      fill: 'rgba(59, 130, 246, 0.2)',
      vertexId: ptV?.id,
      p1Id: ptP1?.id,
      p2Id: ptP2?.id,
      groupId: ptV?.groupId,
    };

    return {
      success: true,
      message: `Đã tạo ký hiệu góc ∠${p1Token}${vToken}${p2Token}`,
      newElements: [...existingElements, newAngle],
      selectedId: newAngle.id,
    };
  }

  // -------------------------------------------------------------
  // 7. Text / LaTeX: `LaTeX("x^2 + y^2 = 1", 2, 3)` or `Chu("A", 1, 2)`
  // -------------------------------------------------------------
  const textMatch = input.match(
    /^(?:LaTeX|Chu|Text)\s*\(\s*["']([^"']+)["']\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/i
  );
  if (textMatch) {
    const latexText = textMatch[1];
    const mx = parseFloat(textMatch[2]);
    const my = parseFloat(textMatch[3]);
    const screen = mathToScreen(mx, my, origin);

    const newLatex: LatexElement = {
      id: `latex-${Date.now()}`,
      type: 'latex',
      x: screen.x,
      y: screen.y,
      latex: latexText,
      fontSize: 22,
      color: '#1e3a8a',
      stroke: '#1e3a8a',
      strokeWidth: 1,
      strokeStyle: 'solid',
    };

    return {
      success: true,
      message: `Đã thêm công thức LaTeX tại (${mx}, ${my})`,
      newElements: [...existingElements, newLatex],
      selectedId: newLatex.id,
    };
  }

  // If no syntax matched
  return {
    success: false,
    message: `Cú pháp không hợp lệ! Mẫu: A = (2, 3), DoanThang(A, B), DuongTron(A, 4), DaGiac(A, B, C)`,
  };
}
