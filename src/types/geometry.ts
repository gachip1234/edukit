export type ToolType =
  | 'select'
  | 'point'
  | 'segment'
  | 'line'
  | 'ray'
  | 'circle'
  | 'polygon'
  | 'angle'
  | 'right_angle'
  | 'latex';

export type StrokeStyle = 'solid' | 'dashed' | 'dotted';

export type PointConstraintMode = 'attached' | 'control';

export interface BaseElement {
  id: string;
  type: ToolType;
  stroke: string;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  opacity?: number;
  groupId?: string; // Group ID to bind/anchor related elements together
  constraintMode?: PointConstraintMode;
}

export interface PointAttachment {
  elementId: string;
  type: 'line' | 'segment' | 'circle' | 'polygon';
  t?: number;
  edgeIndex?: number;
  angle?: number;
  offset?: { dx: number; dy: number };
}

export type AngleArcType = 'single' | 'double' | 'triple' | 'tick' | 'double_tick';

export interface GlobalLabelStyle {
  fontSize: number;
  color: string;
  fontFamily: string;
  fontStyle: string;
}

export interface PointElement extends BaseElement {
  type: 'point';
  x: number;
  y: number;
  radius: number;
  label?: string;
  labelOffset?: { x: number; y: number };
  labelFontSize?: number;
  labelColor?: string;
  labelFontFamily?: string;
  labelFontStyle?: string;
  attachedTo?: PointAttachment;
  constraintMode?: PointConstraintMode; // 'attached' (Đặc tính 1: điểm trượt) | 'control' (Đặc tính 2: khóa dính / đổi bán kính & kích thước)
}

export interface SegmentElement extends BaseElement {
  type: 'segment';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface LineElement extends BaseElement {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** true = tia: bắt đầu tại (x1, y1), đi qua (x2, y2) và kéo dài về phía đó */
  isRay?: boolean;
  /** Nhãn ở đầu phía (x1, y1) của đường thẳng, vd "x" trong đường thẳng xy (tia không dùng) */
  startLabel?: string;
  /** Nhãn ở đầu phía (x2, y2): tia Ox → "x"; đường thẳng d → "d"; đường thẳng xy → "y" */
  endLabel?: string;
}

export interface CircleElement extends BaseElement {
  type: 'circle';
  cx: number;
  cy: number;
  radius: number;
  fill: string;
}

export interface PolygonElement extends BaseElement {
  type: 'polygon';
  points: number[]; // [x1, y1, x2, y2, ...]
  fill: string;
  closed: boolean;
}

export interface AngleElement extends BaseElement {
  type: 'angle' | 'right_angle';
  vx: number; // vertex x
  vy: number; // vertex y
  p1x: number; // arm 1 point x
  p1y: number; // arm 1 point y
  p2x: number; // arm 2 point x
  p2y: number; // arm 2 point y
  size: number; // symbol arm size / arc radius in px (default 24)
  fill?: string; // fill color for arc sector or square corner
  arcType?: AngleArcType; // 'single' | 'double' | 'triple' | 'tick' | 'double_tick'
  vertexId?: string; // optional anchor point id
  p1Id?: string;
  p2Id?: string;
}

export type RightAngleElement = AngleElement;

export interface LatexElement extends BaseElement {
  type: 'latex';
  x: number;
  y: number;
  latex: string;
  fontSize: number;
  color: string;
}

export type GeoElement =
  | PointElement
  | SegmentElement
  | LineElement
  | CircleElement
  | PolygonElement
  | AngleElement
  | LatexElement;

export interface ViewportState {
  x: number;
  y: number;
  scale: number;
}
