import React, { useState } from 'react';
import type { ToolType } from '../types/geometry';
import {
  MousePointer2,
  Dot,
  Minus,
  MoveHorizontal,
  MoveRight,
  Circle,
  Hexagon,
  Type,
  RotateCcw,
  RotateCw,
  Trash2,
  Sparkles,
  LayoutGrid,
  X,
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
  /** Công cụ dùng thường xuyên: luôn hiện trên thanh công cụ điện thoại; còn lại nằm trong mục "Thêm" */
  primary?: boolean;
}

const AngleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 20H4L14 4" />
    <path d="M9 20a5 5 0 0 1 3.5-8.5" />
  </svg>
);

export const TOOLS: ToolItem[] = [
  {
    id: 'select',
    label: 'Chọn',
    tooltip: 'Chọn & Di chuyển đối tượng (V)',
    shortcut: 'V',
    icon: <MousePointer2 className="w-5 h-5" />,
    primary: true,
  },
  {
    id: 'point',
    label: 'Điểm',
    tooltip: 'Chấm điểm hình học (P)',
    shortcut: 'P',
    icon: <Dot className="w-6 h-6" strokeWidth={3} />,
    primary: true,
  },
  {
    id: 'segment',
    label: 'Đoạn thẳng',
    tooltip: 'Vẽ đoạn thẳng nối 2 điểm (S)',
    shortcut: 'S',
    icon: <Minus className="w-5 h-5" strokeWidth={2.5} />,
    primary: true,
  },
  {
    id: 'line',
    label: 'Đường thẳng',
    tooltip: 'Vẽ đường thẳng vô hạn qua 2 điểm (L)',
    shortcut: 'L',
    icon: <MoveHorizontal className="w-5 h-5" strokeWidth={2} />,
  },
  {
    id: 'ray',
    label: 'Tia',
    tooltip: 'Vẽ tia: bấm vào gốc rồi kéo theo hướng tia (R)',
    shortcut: 'R',
    icon: <MoveRight className="w-5 h-5" strokeWidth={2} />,
  },
  {
    id: 'circle',
    label: 'Đường tròn',
    tooltip: 'Vẽ đường tròn tâm O bán kính R (C)',
    shortcut: 'C',
    icon: <Circle className="w-5 h-5" strokeWidth={2} />,
    primary: true,
  },
  {
    id: 'polygon',
    label: 'Đa giác',
    tooltip: 'Vẽ đa giác & tô màu miền kín (G)',
    shortcut: 'G',
    icon: <Hexagon className="w-5 h-5" strokeWidth={2} />,
    primary: true,
  },
  {
    id: 'angle',
    label: 'Ký hiệu góc',
    tooltip: 'Tạo ký hiệu góc hoặc góc vuông (3 điểm: Cạnh 1 - Đỉnh - Cạnh 2) (A)',
    shortcut: 'A',
    icon: <AngleIcon />,
  },
  {
    id: 'latex',
    label: 'Chữ / LaTeX',
    tooltip: 'Chèn ký hiệu & công thức Toán LaTeX (T)',
    shortcut: 'T',
    icon: <Type className="w-5 h-5" strokeWidth={2} />,
  },
];

/** Thanh công cụ dọc bên trái — máy tính, máy tính bảng và điện thoại xoay ngang */
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
  return (
    <aside className="hidden md:flex short:flex w-18 short:w-14 shrink-0 bg-white/95 backdrop-blur-md border-r border-slate-200 shadow-sm flex-col items-center z-20 select-none">
      {/* Công cụ: cuộn được nếu màn hình thấp, phần Hoàn tác bên dưới luôn hiện */}
      <div className="flex-1 min-h-0 w-full overflow-y-auto no-scrollbar flex flex-col items-center gap-2 short:gap-1 px-2 short:px-1.5 py-4 short:py-2">
        <div className="short:hidden text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
          Công cụ
        </div>
        {TOOLS.map((t) => {
          const isActive = currentTool === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onSelectTool(t.id)}
              title={t.tooltip}
              aria-label={t.label}
              aria-pressed={isActive}
              className={`relative group shrink-0 flex flex-col items-center justify-center w-14 h-13 short:w-11 short:h-11 rounded-xl transition-all duration-150 ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30 scale-102 ring-2 ring-blue-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <div className="relative">
                {t.icon}
                <span
                  className={`short:hidden absolute -bottom-1 -right-2 text-[9px] font-bold px-1 rounded ${
                    isActive ? 'bg-blue-800 text-blue-100' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {t.shortcut}
                </span>
              </div>
              <span className="short:hidden text-[10px] font-medium mt-1 leading-tight">{t.label}</span>
            </button>
          );
        })}

        <div className="w-8 h-px bg-slate-200 my-1 shrink-0" />

        <button
          onClick={onOpenPresets}
          title="Mẫu hình học có sẵn (Tam giác, Tứ giác, Đường tròn nội/ngoại tiếp...)"
          className="shrink-0 flex flex-col items-center justify-center w-14 h-12 short:w-11 short:h-11 rounded-xl text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors border border-amber-200/60"
        >
          <Sparkles className="w-4 h-4 text-amber-600 mb-0.5" />
          <span className="short:hidden text-[10px] font-medium">Mẫu hình</span>
        </button>
      </div>

      {/* Hoàn tác / Làm lại / Xóa trắng */}
      <div className="shrink-0 w-full flex flex-col items-center gap-1 px-2 short:px-1.5 py-2 border-t border-slate-200/70">
        <div className="flex flex-row short:flex-col gap-1">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Hoàn tác (Ctrl+Z)"
            aria-label="Hoàn tác"
            className={`p-2 rounded-lg transition-colors ${
              canUndo ? 'text-slate-700 hover:bg-slate-100 active:scale-95' : 'text-slate-300 cursor-not-allowed'
            }`}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Làm lại (Ctrl+Y / Ctrl+Shift+Z)"
            aria-label="Làm lại"
            className={`p-2 rounded-lg transition-colors ${
              canRedo ? 'text-slate-700 hover:bg-slate-100 active:scale-95' : 'text-slate-300 cursor-not-allowed'
            }`}
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={onClear}
          title="Xóa trắng bảng vẽ"
          aria-label="Xóa trắng bảng vẽ"
          className="w-13 short:w-11 h-9 flex items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};

/**
 * Thanh công cụ dưới đáy màn hình — chỉ trên điện thoại dựng đứng.
 * Bỏ thanh dọc bên trái để khung vẽ rộng hết chiều ngang; các công cụ ít dùng gom vào nút "Thêm".
 * Nút Hoàn tác / Làm lại luôn nằm sát mép phải, trong tầm ngón cái.
 */
export const MobileToolbar: React.FC<ToolbarProps> = ({
  currentTool,
  onSelectTool,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
  onOpenPresets,
}) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const primaryTools = TOOLS.filter((t) => t.primary);
  const secondaryTools = TOOLS.filter((t) => !t.primary);
  // Đang dùng một công cụ trong mục "Thêm" → hiện biểu tượng của nó trên nút "Thêm" để biết đang vẽ gì
  const activeSecondary = secondaryTools.find((t) => t.id === currentTool);

  const pick = (id: ToolType) => {
    onSelectTool(id);
    setMoreOpen(false);
  };

  const btnBase = 'shrink-0 flex flex-col items-center justify-center w-10 h-11 rounded-xl transition-all duration-150';

  return (
    <div className="md:hidden short:hidden relative z-20 shrink-0 select-none">
      {/* Bảng công cụ phụ trượt lên từ thanh dưới */}
      {moreOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)} aria-hidden="true" />
          <div className="absolute bottom-full left-2 right-2 mb-2 z-20 p-2 rounded-2xl bg-white border border-slate-200 shadow-xl animate-in slide-in-from-bottom-2 fade-in duration-150">
            <div className="flex items-center justify-between px-1 pb-1.5">
              <span className="text-[11px] font-semibold text-slate-500">Công cụ khác</span>
              <button
                onClick={() => setMoreOpen(false)}
                aria-label="Đóng"
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {secondaryTools.map((t) => {
                const isActive = currentTool === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => pick(t.id)}
                    aria-pressed={isActive}
                    className={`flex flex-col items-center justify-center gap-1 h-16 rounded-xl text-[11px] font-medium transition-colors ${
                      isActive ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {t.icon}
                    {t.label}
                  </button>
                );
              })}
              <button
                onClick={() => {
                  setMoreOpen(false);
                  onOpenPresets();
                }}
                className="flex flex-col items-center justify-center gap-1 h-16 rounded-xl text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200/60"
              >
                <Sparkles className="w-5 h-5 text-amber-600" />
                Mẫu hình
              </button>
              <button
                onClick={() => {
                  setMoreOpen(false);
                  onClear();
                }}
                className="flex flex-col items-center justify-center gap-1 h-16 rounded-xl text-[11px] font-medium bg-rose-50 text-rose-700"
              >
                <Trash2 className="w-5 h-5" />
                Xóa trắng
              </button>
            </div>
          </div>
        </>
      )}

      <nav
        className="flex items-center gap-1 px-1.5 pt-1.5 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-2px_8px_rgb(0_0_0/0.04)]"
        style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}
        aria-label="Công cụ vẽ"
      >
        <div className="flex-1 min-w-0 flex items-center gap-0.5 overflow-x-auto no-scrollbar">
          {primaryTools.map((t) => {
            const isActive = currentTool === t.id;
            return (
              <button
                key={t.id}
                onClick={() => pick(t.id)}
                title={t.label}
                aria-label={t.label}
                aria-pressed={isActive}
                className={`${btnBase} ${
                  isActive ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30' : 'text-slate-600 active:bg-slate-100'
                }`}
              >
                {t.icon}
              </button>
            );
          })}
          <button
            onClick={() => setMoreOpen((o) => !o)}
            title="Công cụ khác: đường thẳng, tia, góc, chữ/LaTeX, mẫu hình, xóa trắng"
            aria-label="Công cụ khác"
            aria-expanded={moreOpen}
            className={`${btnBase} ${
              activeSecondary
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                : moreOpen
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-600 active:bg-slate-100'
            }`}
          >
            {activeSecondary ? activeSecondary.icon : <LayoutGrid className="w-5 h-5" />}
          </button>
        </div>

        <div className="w-px h-7 bg-slate-200 shrink-0" />

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Hoàn tác thao tác vừa vẽ"
            aria-label="Hoàn tác"
            className={`${btnBase} ${canUndo ? 'text-slate-800 active:bg-slate-100 active:scale-95' : 'text-slate-300'}`}
          >
            <RotateCcw className="w-5 h-5" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Làm lại"
            aria-label="Làm lại"
            className={`${btnBase} ${canRedo ? 'text-slate-800 active:bg-slate-100 active:scale-95' : 'text-slate-300'}`}
          >
            <RotateCw className="w-5 h-5" />
          </button>
        </div>
      </nav>
    </div>
  );
};
