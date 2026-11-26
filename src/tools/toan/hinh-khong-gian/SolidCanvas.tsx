import React, { useEffect, useRef, useState } from 'react';
import { addPoint, buildMesh, resolvePoints, type SolidDoc, type Vec3 } from './model';
import { boundingRadius, buildScene, type Frame, type Scene, type View } from './scene';
import { INK, LABEL_FONT, dashPattern, type DrawStyle } from './exportImage';
import { dragPoint, pickFace, pickLine, pickOnObject, type ScreenPoint } from './picking';

export type SolidTool = 'rotate' | 'segment' | 'midpoint' | 'free' | 'on' | 'intersect';

/** Công cụ chọn các điểm có sẵn (hiện vòng tròn quanh từng điểm) */
const PICKS_POINTS: SolidTool[] = ['segment', 'midpoint', 'intersect'];
/** Công cụ nhận cả lần bấm vào chỗ khác trên hình */
const CLICKS_CANVAS: SolidTool[] = ['free', 'on', 'intersect'];

interface Props {
  doc: SolidDoc;
  view: View;
  zoom: number;
  style: DrawStyle;
  tool: SolidTool;
  /** Các điểm đã chọn trong công cụ đang dùng */
  picked: string[];
  onPick: (id: string) => void;
  /** Đường thẳng đã chọn trong công cụ giao điểm */
  chosenLine: [string, string] | null;
  /** Công cụ giao điểm đang chờ chọn mặt phẳng */
  wantsPlane: boolean;
  /** Bấm (không kéo) vào hình, tọa độ theo khung vẽ */
  onClickAt: (target: ScreenPoint, frame: Frame) => void;
  onDragPoint: (id: string, change: { at?: Vec3; t?: number; u?: number; v?: number }) => void;
  onViewChange: (view: View) => void;
  onZoom: (factor: number) => void;
  onMoveLabel: (id: string, dx: number, dy: number) => void;
  /** Cung cấp hình đang hiển thị cho chức năng xuất ảnh */
  sceneRef: React.RefObject<Scene | null>;
}

type Drag =
  | { kind: 'rotate'; x: number; y: number; view: View; moved: boolean }
  | { kind: 'label'; id: string; x: number; y: number }
  | { kind: 'point'; id: string; offset: ScreenPoint; start: Vec3 };

export const SolidCanvas: React.FC<Props> = ({
  doc,
  view,
  zoom,
  style,
  tool,
  picked,
  onPick,
  chosenLine,
  wantsPlane,
  onClickAt,
  onDragPoint,
  onViewChange,
  onZoom,
  onMoveLabel,
  sceneRef,
}) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const drag = useRef<Drag | null>(null);
  /** Vị trí chuột, để xem trước điểm hoặc đối tượng sắp chọn */
  const [hover, setHover] = useState<ScreenPoint | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const update = () => setSize({ width: box.clientWidth, height: box.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // Cuộn chuột để thu phóng (phải gắn trực tiếp để chặn được cuộn trang)
  const zoomRef = useRef(onZoom);
  useEffect(() => {
    zoomRef.current = onZoom;
  });
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomRef.current(e.deltaY < 0 ? 1.08 : 1 / 1.08);
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  }, []);

  const radius = boundingRadius(buildMesh(doc));
  const scale = Math.max(1, (Math.min(size.width, size.height) * 0.38 * zoom) / radius);
  const frame: Frame = { scale, cx: size.width / 2, cy: size.height / 2, fontSize: style.fontSize };
  const scene = buildScene(doc, view, frame);
  useEffect(() => {
    sceneRef.current = size.width > 0 ? scene : null;
  });
  const picking = tool !== 'rotate';
  const dotOf = new Map(scene.dots.map((d) => [d.id, d]));

  const local = (e: React.PointerEvent): ScreenPoint => {
    const rect = boxRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent, next: Drag) => {
    e.currentTarget.closest('svg')!.setPointerCapture(e.pointerId);
    drag.current = next;
  };

  const handleMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (e.pointerType === 'mouse' && CLICKS_CANVAS.includes(tool)) setHover(d ? null : local(e));
    if (!d) return;
    if (d.kind === 'point') {
      const point = doc.points.find((p) => p.id === d.id);
      const at = local(e);
      const change = point && dragPoint(doc, view, frame, point, { x: at.x - d.offset.x, y: at.y - d.offset.y }, d.start);
      if (change) onDragPoint(d.id, change);
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.kind === 'label') {
      onMoveLabel(d.id, dx / scale, dy / scale);
      drag.current = { ...d, x: e.clientX, y: e.clientY };
      return;
    }
    // Bỏ qua rung tay khi chỉ bấm
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    const yaw = ((((d.view.yaw + dx * 0.5 + 180) % 360) + 360) % 360) - 180;
    const tilt = Math.min(60, Math.max(-60, d.view.tilt + dy * 0.4));
    onViewChange({ mode: 'free', yaw: Math.round(yaw), tilt: Math.round(tilt) });
  };

  const end = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (e.type === 'pointerup' && d?.kind === 'rotate' && !d.moved && CLICKS_CANVAS.includes(tool)) onClickAt(local(e), frame);
  };

  // Phần tô sáng và điểm xem trước (không nằm trong ảnh xuất ra)
  const lineHighlight = (ids: [string, string], color: string, key: string) => {
    const [a, b] = ids.map((id) => dotOf.get(id));
    if (!a || !b) return null;
    return <line key={key} data-highlight={ids.join('-')} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeOpacity={0.45} strokeWidth={style.lineWidth + 7} strokeLinecap="round" pointerEvents="none" />;
  };
  const faceHighlight = (ids: string[], color: string) => {
    const corners = ids.map((id) => dotOf.get(id));
    if (corners.some((c) => !c)) return null;
    return <polygon points={corners.map((c) => `${c!.x},${c!.y}`).join(' ')} fill={color} fillOpacity={0.16} pointerEvents="none" />;
  };

  const preview = () => {
    if (!hover) return null;
    const ghost = (x: number, y: number, label: string) => (
      <g pointerEvents="none">
        <circle cx={x} cy={y} r={5} fill="#059669" stroke="#ffffff" strokeWidth={1.5} />
        <text x={x + 10} y={y - 10} fontSize={12} fontWeight={600} fill="#047857">
          {label}
        </text>
      </g>
    );
    if (tool === 'free') return ghost(hover.x, hover.y, 'Điểm mới');
    if (tool === 'on') {
      const spec = pickOnObject(doc, view, frame, hover);
      if (!spec) return null;
      const result = addPoint(doc, spec);
      if (!result.added) return null;
      const at = buildScene(result.doc, view, frame).dots.find((d) => d.id === result.id);
      if (!at) return null;
      const names = resolvePoints(doc);
      const nameOf = (id: string) => names.find((p) => p.id === id)?.name ?? '';
      const face = spec.type === 'face' ? pickFace(doc, view, frame, hover) : null;
      return (
        <>
          {spec.type === 'on' && lineHighlight([spec.of[0], spec.of[1]], '#059669', 'preview')}
          {face && faceHighlight(face.ids, '#059669')}
          {ghost(at.x, at.y, spec.type === 'on' ? `Trên đoạn ${spec.of.map(nameOf).join('')}` : `Trên mặt (${face?.ids.map(nameOf).join('')})`)}
        </>
      );
    }
    if (tool === 'intersect') {
      if (wantsPlane) {
        const face = pickFace(doc, view, frame, hover);
        return face && faceHighlight(face.ids, '#d97706');
      }
      const line = pickLine(doc, view, frame, hover);
      return line && lineHighlight([line.from, line.to], '#d97706', 'preview');
    }
    return null;
  };

  return (
    <div ref={boxRef} className="absolute inset-0">
      <svg
        width={size.width}
        height={size.height}
        role="img"
        aria-label="Hình không gian đang vẽ, cạnh khuất là nét đứt"
        className={`block touch-none ${picking ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
        onPointerDown={(e) => start(e, { kind: 'rotate', x: e.clientX, y: e.clientY, view, moved: false })}
        onPointerMove={handleMove}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={() => setHover(null)}
      >
        {tool === 'intersect' && chosenLine && lineHighlight(chosenLine, '#2563eb', 'chosen')}
        {scene.lines.map((l) => (
          <line
            key={l.key}
            data-line={`${l.from}-${l.to}`}
            data-hidden={l.hidden}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke={INK}
            strokeWidth={style.lineWidth}
            strokeLinecap="round"
            strokeDasharray={l.hidden ? dashPattern(style.lineWidth) : undefined}
          />
        ))}
        {scene.dots.map((d) => (
          <g key={d.id}>
            {(d.extra || style.showVertexDots) && <circle cx={d.x} cy={d.y} r={style.lineWidth * 1.6} fill={INK} />}
            {!picking && doc.points.some((p) => p.id === d.id && (p.type === 'free' || p.type === 'on' || p.type === 'face')) && (
              <circle
                data-drag={d.id}
                cx={d.x}
                cy={d.y}
                r={12}
                fill="transparent"
                className="cursor-move"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const at = local(e);
                  const start3d = resolvePoints(doc).find((p) => p.id === d.id)!.p;
                  start(e, { kind: 'point', id: d.id, offset: { x: at.x - d.x, y: at.y - d.y }, start: start3d });
                }}
              >
                <title>Kéo để dời điểm {d.name}</title>
              </circle>
            )}
            <text
              data-label={d.id}
              x={d.labelX}
              y={d.labelY}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily={LABEL_FONT}
              fontSize={style.fontSize}
              fontStyle="italic"
              fontWeight="bold"
              fill={INK}
              className={picking ? undefined : 'cursor-move'}
              onPointerDown={(e) => {
                if (picking) return;
                e.stopPropagation();
                start(e, { kind: 'label', id: d.id, x: e.clientX, y: e.clientY });
              }}
            >
              {d.name}
            </text>
            {PICKS_POINTS.includes(tool) && (
              <circle
                data-point={d.id}
                cx={d.x}
                cy={d.y}
                r={14}
                fill={picked.includes(d.id) ? 'rgba(37,99,235,0.35)' : 'rgba(37,99,235,0.08)'}
                stroke="#2563eb"
                strokeWidth={picked.includes(d.id) ? 2.5 : 1}
                className="cursor-pointer outline-none focus-visible:[stroke-width:4]"
                role="button"
                tabIndex={0}
                aria-label={`Chọn điểm ${d.name}`}
                aria-pressed={picked.includes(d.id)}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onPick(d.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onPick(d.id);
                  }
                }}
              />
            )}
          </g>
        ))}
        {preview()}
      </svg>
    </div>
  );
};
