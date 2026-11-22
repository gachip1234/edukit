import React from 'react';
import type { ToolType } from '../types/geometry';
import {
  MousePointer2,
  Dot,
  Minus,
  MoveHorizontal,
  Circle,
  Hexagon,
  Type,
  RotateCcw,
  RotateCw,
  Trash2,
  Sparkles,
} from 'lucide-react';

interface ToolbarProps {
  currentTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onOpenPresets: () => void;
}

interface ToolItem {
  id: ToolType;
  label: string;
  tooltip: string;
  shortcut: string;
  icon: React.ReactNode;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  currentTool,
  onSelectTool,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
  onOpenPresets,
}) => {
  const tools: ToolItem[] = [
    {
      id: 'select',
      label: 'Chọn',
      tooltip: 'Chọn & Di chuyển đối tượng (V)',
      shortcut: 'V',
      icon: <MousePointer2 className="w-5 h-5" />,
    },
    {
      id: 'point',
      label: 'Điểm',
      tooltip: 'Chấm điểm hình học (P)',
      shortcut: 'P',
      icon: <Dot className="w-6 h-6" strokeWidth={3} />,
    },
    {
      id: 'segment',
      label: 'Đoạn thẳng',
      tooltip: 'Vẽ đoạn thẳng nối 2 điểm (S)',
      shortcut: 'S',
      icon: <Minus className="w-5 h-5" strokeWidth={2.5} />,
    },
    {
      id: 'line',
      label: 'Đường thẳng',
      tooltip: 'Vẽ đường thẳng vô hạn qua 2 điểm (L)',
      shortcut: 'L',
      icon: <MoveHorizontal className="w-5 h-5" strokeWidth={2} />,
    },
    {
      id: 'circle',
      label: 'Đường tròn',
      tooltip: 'Vẽ đường tròn tâm O bán kính R (C)',
      shortcut: 'C',
      icon: <Circle className="w-5 h-5" strokeWidth={2} />,
    },
    {
      id: 'polygon',
      label: 'Đa giác',
      tooltip: 'Vẽ đa giác & tô màu miền kín (G)',
      shortcut: 'G',
      icon: <Hexagon className="w-5 h-5" strokeWidth={2} />,
    },
    {
      id: 'angle',
      label: 'Ký hiệu góc',
      tooltip: 'Tạo ký hiệu góc hoặc góc vuông (3 điểm: Cạnh 1 - Đỉnh - Cạnh 2) (A)',
      shortcut: 'A',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 20H4L14 4" />
          <path d="M9 20a5 5 0 0 1 3.5-8.5" />
        </svg>
      ),
    },
    {
      id: 'latex',
      label: 'Chữ / LaTeX',
      tooltip: 'Chèn ký hiệu & công thức Toán LaTeX (T)',
      shortcut: 'T',
      icon: <Type className="w-5 h-5" strokeWidth={2} />,
    },
  ];

  return (
    <aside className="w-18 bg-white/95 backdrop-blur-md border-r border-slate-200 shadow-sm flex flex-col justify-between items-center py-4 z-20 select-none">
      {/* Tool section */}
      <div className="flex flex-col items-center gap-2 w-full px-2">
        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
          Công cụ
        </div>
        {tools.map((t) => {
          const isActive = currentTool === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onSelectTool(t.id)}
              title={`${t.tooltip}`}
              className={`relative group flex flex-col items-center justify-center w-14 h-13 rounded-xl transition-all duration-150 ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30 scale-102 ring-2 ring-blue-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <div className="relative">
                {t.icon}
                <span
                  className={`absolute -bottom-1 -right-2 text-[9px] font-bold px-1 rounded ${
                    isActive ? 'bg-blue-800 text-blue-100' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {t.shortcut}
                </span>
              </div>
              <span className="text-[10px] font-medium mt-1 leading-tight">{t.label}</span>
            </button>
          );
        })}

        <div className="w-8 h-px bg-slate-200 my-1" />

        {/* Quick geometry presets */}
        <button
          onClick={onOpenPresets}
          title="Mẫu hình học có sẵn (Tam giác, Tứ giác, Đường tròn nội/ngoại tiếp...)"
          className="flex flex-col items-center justify-center w-14 h-12 rounded-xl text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors border border-amber-200/60"
        >
          <Sparkles className="w-4 h-4 text-amber-600 mb-0.5" />
          <span className="text-[10px] font-medium">Mẫu hình</span>
        </button>
      </div>

      {/* History and Actions section */}
      <div className="flex flex-col items-center gap-2 w-full px-2">
        <div className="flex gap-1">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Hoàn tác (Ctrl+Z)"
            className={`p-2 rounded-lg transition-colors ${
              canUndo
                ? 'text-slate-700 hover:bg-slate-100 active:scale-95'
                : 'text-slate-300 cursor-not-allowed'
            }`}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Làm lại (Ctrl+Y / Ctrl+Shift+Z)"
            className={`p-2 rounded-lg transition-colors ${
              canRedo
                ? 'text-slate-700 hover:bg-slate-100 active:scale-95'
                : 'text-slate-300 cursor-not-allowed'
            }`}
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={onClear}
          title="Xóa trắng bảng vẽ"
          className="w-13 h-9 flex items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
