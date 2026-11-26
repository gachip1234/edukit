/** Bảng vẽ chế độ mô hình 3D: kéo để xoay, cuộn hoặc chụm hai ngón để thu phóng. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { SolidDoc } from '../model';
import type { Frame, View } from '../scene';
import { LABEL_FONT, type DrawStyle } from '../exportImage';
import { createEngine, type Engine, type Look3 } from './engine';
import { labels3d, model3d } from './model3d';
import { snapshotPng } from './snapshot';

export interface Solid3DProps {
  doc: SolidDoc;
  view: View;
  zoom: number;
  style: DrawStyle;
  look: Look3;
  onViewChange: (view: View) => void;
  onZoom: (factor: number) => void;
  /** Cung cấp cách tạo ảnh từ mô hình đang hiển thị */
  exportRef: React.RefObject<(() => Promise<Blob>) | null>;
  /** Không dùng được đồ họa 3D */
  onFail: () => void;
}

interface Pointer {
  x: number;
  y: number;
}

const Solid3D: React.FC<Solid3DProps> = ({ doc, view, zoom, style, look, onViewChange, onZoom, exportRef, onFail }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const callbacks = useRef({ onZoom, onFail });
  useEffect(() => {
    callbacks.current = { onZoom, onFail };
  });

  const model = useMemo(() => model3d(doc), [doc]);
  // Phối cảnh làm phần gần mắt to hơn nên chừa lề rộng hơn một chút
  const scale = Math.max(1, (Math.min(size.width, size.height) * (look.perspective ? 0.34 : 0.38) * zoom) / model.radius);
  const frame: Frame = { scale, cx: size.width / 2, cy: size.height / 2, fontSize: style.fontSize };
  const labels = labels3d(model, view, frame, look.perspective);

  // Thứ tự các hiệu ứng quan trọng: tạo bộ vẽ → đặt kích thước → dựng vật thể → vẽ
  useEffect(() => {
    const box = boxRef.current!;
    let engine: Engine;
    try {
      engine = createEngine();
    } catch (error) {
      console.warn('Không khởi tạo được đồ họa 3D', error);
      callbacks.current.onFail();
      return;
    }
    engineRef.current = engine;
    engine.canvas.style.position = 'absolute';
    engine.canvas.style.inset = '0';
    engine.canvas.setAttribute('aria-hidden', 'true');
    box.prepend(engine.canvas);

    const measure = () => setSize({ width: box.clientWidth, height: box.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    // Cuộn chuột để thu phóng (phải gắn trực tiếp để chặn được cuộn trang)
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      callbacks.current.onZoom(e.deltaY < 0 ? 1.08 : 1 / 1.08);
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    // Máy có thể thu hồi đồ họa khi chạy nền; có lại thì vẽ lại ngay
    engine.canvas.addEventListener('webglcontextrestored', measure);
    return () => {
      observer.disconnect();
      box.removeEventListener('wheel', onWheel);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.resize(size.width, size.height);
  }, [size]);

  const { glass, perspective, floor } = look;
  useEffect(() => {
    engineRef.current?.build(model, { glass, perspective, floor }, 1 / scale, style.lineWidth);
  }, [model, glass, perspective, floor, scale, style.lineWidth, size]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || size.width === 0) {
      exportRef.current = null;
      return;
    }
    engine.render(view, frame);
    exportRef.current = () => snapshotPng(engine, view, frame, size, labels, style);
  });
  useEffect(() => () => void (exportRef.current = null), [exportRef]);

  // Một ngón (hoặc chuột): xoay; hai ngón: thu phóng
  const pointers = useRef(new Map<number, Pointer>());
  const turn = useRef<{ x: number; y: number; view: View; moved: boolean } | null>(null);
  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const release = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    turn.current = null;
  };

  return (
    <div
      ref={boxRef}
      data-view3d
      role="img"
      aria-label="Mô hình 3D của hình không gian, kéo để xoay"
      className="absolute inset-0 overflow-hidden touch-none cursor-grab active:cursor-grabbing"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        turn.current = pointers.current.size === 1 ? { x: e.clientX, y: e.clientY, view, moved: false } : null;
      }}
      onPointerMove={(e) => {
        if (!pointers.current.has(e.pointerId)) return;
        const before = pointers.current.size === 2 ? spread() : 0;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (before > 0) return onZoom(spread() / before);
        const t = turn.current;
        if (!t) return;
        const dx = e.clientX - t.x;
        const dy = e.clientY - t.y;
        // Bỏ qua rung tay khi chỉ bấm
        if (!t.moved && Math.hypot(dx, dy) < 4) return;
        t.moved = true;
        const yaw = ((((t.view.yaw + dx * 0.5 + 180) % 360) + 360) % 360) - 180;
        const tilt = Math.min(60, Math.max(-60, t.view.tilt + dy * 0.4));
        onViewChange({ mode: 'free', yaw: Math.round(yaw), tilt: Math.round(tilt) });
      }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <svg width={size.width} height={size.height} className="absolute inset-0 pointer-events-none">
        {labels.map((l) => (
          <text key={l.id} data-label3d={l.id} x={l.x} y={l.y} textAnchor="middle" dominantBaseline="central" fontFamily={LABEL_FONT} fontSize={style.fontSize} fontStyle="italic" fontWeight="bold" fill={l.color}>
            {l.text}
          </text>
        ))}
      </svg>
    </div>
  );
};

export default Solid3D;
