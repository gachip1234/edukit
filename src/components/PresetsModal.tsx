import React from 'react';
import type { GeoElement } from '../types/geometry';
import { X, Sparkles } from 'lucide-react';

interface PresetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyPreset: (elements: GeoElement[]) => void;
  canvasCenter: { x: number; y: number };
}

export const PresetsModal: React.FC<PresetsModalProps> = ({
  isOpen,
  onClose,
  onApplyPreset,
  canvasCenter,
}) => {
  if (!isOpen) return null;

  const { x: cx, y: cy } = canvasCenter;

  const handleApply = (type: string) => {
    let elements: GeoElement[] = [];

    switch (type) {
      case 'right_triangle': {
        // Right-angled triangle ABC (at A)
        const gid = `preset-rt-${Date.now()}`;
        const A = { x: cx - 120, y: cy + 100 };
        const B = { x: cx + 140, y: cy + 100 };
        const C = { x: cx - 120, y: cy - 100 };

        elements = [
          // Filled polygon
          {
            id: `poly-${Date.now()}`,
            type: 'polygon',
            groupId: gid,
            points: [A.x, A.y, B.x, B.y, C.x, C.y],
            stroke: '#2563eb',
            strokeWidth: 2,
            strokeStyle: 'solid',
            fill: 'rgba(59, 130, 246, 0.15)',
            closed: true,
          },
          // Right angle indicator element
          {
            id: `ra-${Date.now()}`,
            type: 'right_angle',
            groupId: gid,
            vx: A.x,
            vy: A.y,
            p1x: B.x,
            p1y: B.y,
            p2x: C.x,
            p2y: C.y,
            size: 16,
            stroke: '#2563eb',
            strokeWidth: 1.5,
            strokeStyle: 'solid',
            vertexId: `pt-A-${Date.now()}`,
          },
          // Points
          {
            id: `pt-A-${Date.now()}`,
            type: 'point',
            groupId: gid,
            x: A.x,
            y: A.y,
            radius: 4,
            label: 'A',
            stroke: '#0f172a',
            strokeWidth: 2,
            strokeStyle: 'solid',
          },
          {
            id: `pt-B-${Date.now()}`,
            type: 'point',
            groupId: gid,
            x: B.x,
            y: B.y,
            radius: 4,
            label: 'B',
            stroke: '#0f172a',
            strokeWidth: 2,
            strokeStyle: 'solid',
          },
          {
            id: `pt-C-${Date.now()}`,
            type: 'point',
            groupId: gid,
            x: C.x,
            y: C.y,
            radius: 4,
            label: 'C',
            stroke: '#0f172a',
            strokeWidth: 2,
            strokeStyle: 'solid',
          },
        ];
        break;
      }

      case 'equilateral_triangle': {
        // Equilateral triangle
        const gid = `preset-eq-${Date.now()}`;
        const R = 130;
        const A = { x: cx, y: cy - R };
        const B = { x: cx - R * Math.cos(Math.PI / 6), y: cy + R * Math.sin(Math.PI / 6) };
        const C = { x: cx + R * Math.cos(Math.PI / 6), y: cy + R * Math.sin(Math.PI / 6) };

        elements = [
          {
            id: `poly-${Date.now()}`,
            type: 'polygon',
            groupId: gid,
            points: [A.x, A.y, B.x, B.y, C.x, C.y],
            stroke: '#0f172a',
            strokeWidth: 2,
            strokeStyle: 'solid',
            fill: 'rgba(34, 197, 94, 0.15)',
            closed: true,
          },
          {
            id: `pt-A-${Date.now()}`,
            type: 'point',
            groupId: gid,
            x: A.x,
            y: A.y,
            radius: 4,
            label: 'A',
            stroke: '#0f172a',
            strokeWidth: 2,
            strokeStyle: 'solid',
          },
          {
            id: `pt-B-${Date.now()}`,
            type: 'point',
            groupId: gid,
            x: B.x,
            y: B.y,
            radius: 4,
            label: 'B',
            stroke: '#0f172a',
            strokeWidth: 2,
            strokeStyle: 'solid',
          },
          {
            id: `pt-C-${Date.now()}`,
            type: 'point',
            groupId: gid,
            x: C.x,
            y: C.y,
            radius: 4,
            label: 'C',
            stroke: '#0f172a',
            strokeWidth: 2,
            strokeStyle: 'solid',
          },
        ];
        break;
      }

      case 'circle_triangle': {
        // Triangle with circumscribed circle
        const gid = `preset-circum-${Date.now()}`;
        const R = 120;
        const A = { x: cx, y: cy - R };
        const B = { x: cx - 110, y: cy + 50 };
        const C = { x: cx + 115, y: cy + 40 };

        elements = [
          // Circumscribed Circle
          {
            id: `circle-${Date.now()}`,
            type: 'circle',
            groupId: gid,
            cx,
            cy,
            radius: R,
            stroke: '#dc2626',
            strokeWidth: 1.5,
            strokeStyle: 'dashed',
            fill: 'transparent',
          },
          // Center point O
          {
            id: `pt-O-${Date.now()}`,
            type: 'point',
            groupId: gid,
            x: cx,
            y: cy,
            radius: 4,
            label: 'O',
            stroke: '#dc2626',
            strokeWidth: 2,
            strokeStyle: 'solid',
          },
          // Inscribed triangle
          {
            id: `poly-${Date.now()}`,
            type: 'polygon',
            groupId: gid,
            points: [A.x, A.y, B.x, B.y, C.x, C.y],
            stroke: '#2563eb',
            strokeWidth: 2,
            strokeStyle: 'solid',
            fill: 'rgba(59, 130, 246, 0.1)',
            closed: true,
          },
          {
            id: `pt-A-${Date.now()}`,
            type: 'point',
            groupId: gid,
            x: A.x,
            y: A.y,
            radius: 4,
            label: 'A',
            stroke: '#0f172a',
            strokeWidth: 2,
            strokeStyle: 'solid',
          },
          {
            id: `pt-B-${Date.now()}`,
            type: 'point',
            groupId: gid,
            x: B.x,
            y: B.y,
            radius: 4,
            label: 'B',
            stroke: '#0f172a',
            strokeWidth: 2,
            strokeStyle: 'solid',
          },
          {
            id: `pt-C-${Date.now()}`,
            type: 'point',
            groupId: gid,
            x: C.x,
            y: C.y,
            radius: 4,
            label: 'C',
            stroke: '#0f172a',
            strokeWidth: 2,
            strokeStyle: 'solid',
          },
        ];
        break;
      }

      case 'parallelogram': {
        // Parallelogram ABCD
        const gid = `preset-para-${Date.now()}`;
        const A = { x: cx - 140, y: cy + 70 };
        const B = { x: cx + 60, y: cy + 70 };
        const C = { x: cx + 130, y: cy - 70 };
        const D = { x: cx - 70, y: cy - 70 };

        elements = [
          {
            id: `poly-${Date.now()}`,
            type: 'polygon',
            groupId: gid,
            points: [A.x, A.y, B.x, B.y, C.x, C.y, D.x, D.y],
            stroke: '#0f172a',
            strokeWidth: 2,
            strokeStyle: 'solid',
            fill: 'rgba(245, 158, 11, 0.15)',
            closed: true,
          },
          {
            id: `pt-A-${Date.now()}`,
            type: 'point',
            groupId: gid,
            x: A.x,
            y: A.y,
            radius: 4,
            label: 'A',
            stroke: '#0f172a',
            strokeWidth: 2,
            strokeStyle: 'solid',
          },
          {
            id: `pt-B-${Date.now()}`,
            type: 'point',
            groupId: gid,
            x: B.x,
            y: B.y,
            radius: 4,
            label: 'B',
            stroke: '#0f172a',
            strokeWidth: 2,
            strokeStyle: 'solid',
          },
          {
            id: `pt-C-${Date.now()}`,
            type: 'point',
            groupId: gid,
            x: C.x,
            y: C.y,
            radius: 4,
            label: 'C',
            stroke: '#0f172a',
            strokeWidth: 2,
            strokeStyle: 'solid',
          },
          {
            id: `pt-D-${Date.now()}`,
            type: 'point',
            groupId: gid,
            x: D.x,
            y: D.y,
            radius: 4,
            label: 'D',
            stroke: '#0f172a',
            strokeWidth: 2,
            strokeStyle: 'solid',
          },
        ];
        break;
      }
    }

    if (elements.length > 0) {
      onApplyPreset(elements);
      onClose();
    }
  };

  const presets = [
    {
      id: 'right_triangle',
      title: 'Tam giác vuông ABC',
      desc: 'Tam giác vuông tại A có ký hiệu góc vuông và tô màu miền',
    },
    {
      id: 'equilateral_triangle',
      title: 'Tam giác đều ABC',
      desc: 'Tam giác đều 3 cạnh bằng nhau, 3 góc 60 độ',
    },
    {
      id: 'circle_triangle',
      title: 'Đường tròn ngoại tiếp',
      desc: 'Tam giác nội tiếp đường tròn tâm O bán kính R nét đứt',
    },
    {
      id: 'parallelogram',
      title: 'Hình bình hành ABCD',
      desc: 'Hình bình hành với các cặp cạnh đối song song và bằng nhau',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h3 className="text-base font-bold text-slate-800">
              Chọn mẫu hình học có sẵn
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-2.5">
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => handleApply(p.id)}
              className="text-left p-3.5 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all flex flex-col gap-1 group"
            >
              <span className="text-sm font-bold text-slate-800 group-hover:text-blue-700">
                {p.title}
              </span>
              <span className="text-xs text-slate-500">{p.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
