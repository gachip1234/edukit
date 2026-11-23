import React from 'react';
import type { GeoElement, StrokeStyle } from '../types/geometry';
import { computeAngleDetails } from '../utils/mathUtils';
import {
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  Edit3,
} from 'lucide-react';

interface FloatingPropertyBarProps {
  selectedElement: GeoElement | null;
  position?: { x: number; y: number } | null;
  onUpdateElement: (updated: Partial<GeoElement>) => void;
  onDeleteElement: () => void;
  onDuplicateElement: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onEditLatex?: () => void;
}

const STROKE_COLORS = [
  '#0f172a', // Slate Black
  '#dc2626', // Red
  '#2563eb', // Blue
  '#16a34a', // Green
  '#d97706', // Amber/Orange
  '#9333ea', // Purple
  '#db2777', // Pink
];

const FILL_COLORS = [
  { label: 'Không màu', value: 'transparent' },
  { label: 'Xanh dương nhạt', value: 'rgba(59, 130, 246, 0.25)' },
  { label: 'Đỏ nhạt', value: 'rgba(239, 68, 68, 0.22)' },
  { label: 'Xanh lá nhạt', value: 'rgba(34, 197, 94, 0.22)' },
  { label: 'Vàng cam nhạt', value: 'rgba(245, 158, 11, 0.25)' },
  { label: 'Tím nhạt', value: 'rgba(168, 85, 247, 0.22)' },
  { label: 'Xám nhạt', value: 'rgba(100, 116, 139, 0.2)' },
];

export const FloatingPropertyBar: React.FC<FloatingPropertyBarProps> = ({
  selectedElement,
  position,
  onUpdateElement,
  onDeleteElement,
  onDuplicateElement,
  onBringToFront,
  onSendToBack,
  onEditLatex,
}) => {
  if (!selectedElement) return null;

  // Position calculation: ensure it stays within screen boundaries
  // Điện thoại: thanh thuộc tính trải ngang phía trên chỗ vẽ, cuộn ngang được (không tràn màn hình)
  const isCompact = window.innerWidth < 640;
  const stylePos: React.CSSProperties = isCompact
    ? { position: 'absolute', top: '8px', left: '8px', right: '8px' }
    : position
    ? {
        position: 'absolute',
        left: `${Math.max(20, Math.min(window.innerWidth - 450, position.x))}px`,
        top: `${Math.max(70, position.y - 75)}px`,
      }
    : {
        position: 'absolute',
        top: '75px',
        left: '50%',
        transform: 'translateX(-50%)',
      };

  const hasFill =
    selectedElement.type === 'circle' ||
    selectedElement.type === 'polygon' ||
    selectedElement.type === 'angle' ||
    selectedElement.type === 'right_angle';
  const hasLabel = selectedElement.type === 'point';
  const isLatex = selectedElement.type === 'latex';

  return (
    <div
      style={stylePos}
      className="z-30 bg-white/98 text-slate-800 rounded-2xl shadow-xl border border-slate-200/90 backdrop-blur-md px-3.5 py-2 flex items-center gap-3 max-sm:overflow-x-auto max-sm:no-scrollbar max-sm:*:shrink-0 animate-in fade-in zoom-in-95 duration-150 select-none"
    >
      {/* Element Type badge */}
      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1 border-r border-slate-200 pr-2">
        {selectedElement.type === 'point' && 'Điểm'}
        {selectedElement.type === 'segment' && 'Đoạn thẳng'}
        {selectedElement.type === 'line' && (selectedElement.isRay ? 'Tia' : 'Đường thẳng')}
        {selectedElement.type === 'circle' && 'Đường tròn'}
        {selectedElement.type === 'polygon' && 'Đa giác'}
        {(selectedElement.type === 'angle' || selectedElement.type === 'right_angle') && 'Ký hiệu góc'}
        {selectedElement.type === 'latex' && 'LaTeX'}
      </span>

      {/* Angle Degree & Arc Size Editor */}
      {(selectedElement.type === 'angle' || selectedElement.type === 'right_angle') && (
        <div className="flex items-center gap-2 border-r border-slate-200 pr-2">
          {(() => {
            const d = computeAngleDetails(
              selectedElement.vx,
              selectedElement.vy,
              selectedElement.p1x,
              selectedElement.p1y,
              selectedElement.p2x,
              selectedElement.p2y,
              selectedElement.size || 24
            );
            return (
              <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                {d.isRightAngle ? '90° (Vuông)' : `${Math.round(d.degrees)}°`}
              </span>
            );
          })()}
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium text-slate-500">Cỡ:</span>
            <select
              value={selectedElement.size || 24}
              onChange={(e) => onUpdateElement({ size: Number(e.target.value) })}
              className="text-xs border border-slate-300 rounded px-1.5 py-0.5 bg-slate-50 font-medium"
            >
              <option value={16}>16px (Nhỏ)</option>
              <option value={20}>20px (Vừa)</option>
              <option value={24}>24px (Chuẩn)</option>
              <option value={32}>32px (Lớn)</option>
              <option value={40}>40px (Rất lớn)</option>
            </select>
          </div>
          {/* Angle Arc Type diversity */}
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium text-slate-500">Nét:</span>
            <select
              value={(selectedElement as any).arcType || 'single'}
              onChange={(e) => onUpdateElement({ arcType: e.target.value as any })}
              className="text-xs border border-slate-300 rounded px-1.5 py-0.5 bg-slate-50 font-semibold text-blue-700"
              title="Đa dạng kiểu nét ký hiệu góc (Nét đơn, nét đôi, nét ba, nét gạch)"
            >
              <option value="single">1 Cung (Nét đơn)</option>
              <option value="double">2 Cung (Nét đôi)</option>
              <option value="triple">3 Cung (Nét ba)</option>
              <option value="tick">1 Vạch gạch</option>
              <option value="double_tick">2 Vạch gạch</option>
            </select>
          </div>
        </div>
      )}

      {/* Ký hiệu đoạn bằng nhau: số gạch nhỏ ở giữa đoạn (các đoạn cùng số gạch là bằng nhau) */}
      {selectedElement.type === 'segment' && (
        <div className="flex items-center gap-1 border-r border-slate-200 pr-2">
          <span className="text-xs font-medium text-slate-500">Ký hiệu:</span>
          {[0, 1, 2, 3].map((n) => (
            <button
              key={n}
              onClick={() => onUpdateElement({ ticks: n } as Partial<GeoElement>)}
              className={`w-7 h-6 text-xs font-bold rounded border ${
                (selectedElement.ticks || 0) === n
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
              title={n === 0 ? 'Không ký hiệu' : `${n} gạch: đánh dấu các đoạn bằng nhau`}
            >
              {n === 0 ? '–' : '|'.repeat(n)}
            </button>
          ))}
        </div>
      )}

      {/* Nhãn của tia / đường thẳng: tia Ox → "x"; đường thẳng xy → "x", "y"; đường thẳng d → "d" */}
      {selectedElement.type === 'line' && (
        <div className="flex items-center gap-1.5 border-r border-slate-200 pr-2">
          <span className="text-xs font-medium text-slate-500">Nhãn:</span>
          {!selectedElement.isRay && (
            <input
              type="text"
              maxLength={3}
              value={selectedElement.startLabel || ''}
              onChange={(e) => onUpdateElement({ startLabel: e.target.value } as Partial<GeoElement>)}
              placeholder="x"
              className="w-8 px-1 py-0.5 text-xs font-bold italic font-serif text-center border border-slate-300 rounded bg-slate-50 focus:bg-white focus:outline-blue-500"
              title="Nhãn ở đầu thứ nhất của đường thẳng (vd: x trong đường thẳng xy). Để trống nếu chỉ cần một nhãn."
            />
          )}
          <input
            type="text"
            maxLength={3}
            value={selectedElement.endLabel || ''}
            onChange={(e) => onUpdateElement({ endLabel: e.target.value } as Partial<GeoElement>)}
            placeholder={selectedElement.isRay ? 'x' : 'd'}
            className="w-8 px-1 py-0.5 text-xs font-bold italic font-serif text-center border border-slate-300 rounded bg-slate-50 focus:bg-white focus:outline-blue-500"
            title={selectedElement.isRay ? 'Nhãn tia (vd: x trong tia Ox)' : 'Nhãn đường thẳng (vd: d, hoặc y trong đường thẳng xy)'}
          />
          <button
            onClick={() => onUpdateElement({ isRay: !selectedElement.isRay } as Partial<GeoElement>)}
            className="px-1.5 py-0.5 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
            title="Chuyển giữa đường thẳng và tia"
          >
            {selectedElement.isRay ? '→ Đường thẳng' : '→ Tia'}
          </button>
        </div>
      )}

      {/* Point Label Editor & Individual Label Styling */}
      {hasLabel && (
        <div className="flex items-center gap-1.5 border-r border-slate-200 pr-2">
          <span className="text-xs font-medium text-slate-500">Tên:</span>
          <input
            type="text"
            maxLength={4}
            value={selectedElement.label || ''}
            onChange={(e) => onUpdateElement({ label: e.target.value })}
            className="w-10 px-1 py-0.5 text-xs font-bold text-center border border-slate-300 rounded bg-slate-50 focus:bg-white focus:outline-blue-500"
            title="Đổi tên điểm (A, B, O...)"
          />
          {/* Individual label font size */}
          <select
            value={selectedElement.labelFontSize || ''}
            onChange={(e) =>
              onUpdateElement({
                labelFontSize: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="text-xs border border-slate-300 rounded px-1 py-0.5 bg-slate-50 font-medium"
            title="Cỡ chữ nhãn riêng điểm này"
          >
            <option value="">Cỡ: Mặc định</option>
            <option value="12">12px (Nhỏ)</option>
            <option value="15">15px (Chuẩn)</option>
            <option value="18">18px (Lớn)</option>
            <option value="22">22px (Rất lớn)</option>
          </select>
          {/* Individual label font style */}
          <select
            value={selectedElement.labelFontStyle || ''}
            onChange={(e) =>
              onUpdateElement({
                labelFontStyle: e.target.value ? e.target.value : undefined,
              })
            }
            className="text-xs border border-slate-300 rounded px-1 py-0.5 bg-slate-50 italic font-medium"
            title="Kiểu dáng nhãn riêng điểm này"
          >
            <option value="">Kiểu: Mặc định</option>
            <option value="italic bold">In nghiêng đậm (A)</option>
            <option value="italic">In nghiêng (A)</option>
            <option value="bold">In đậm (A)</option>
            <option value="normal">Bình thường (A)</option>
          </select>
        </div>
      )}

      {/* Point Constraint Mode: Đặc tính 1 (Trượt) vs Đặc tính 2 (Khóa dính / Đổi bán kính) */}
      {selectedElement.type === 'point' && (
        <div className="flex items-center gap-1 border-r border-slate-200 pr-2">
          <span className="text-xs font-medium text-slate-500">Đặc tính:</span>
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={() => onUpdateElement({ constraintMode: 'attached' })}
              className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition-all ${
                (selectedElement.constraintMode || 'attached') === 'attached'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Đặc tính 1 (Mặc định): Điểm trượt tự do / bám theo đối tượng chính"
            >
              1: Điểm trượt
            </button>
            <button
              onClick={() => onUpdateElement({ constraintMode: 'control' })}
              className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition-all ${
                selectedElement.constraintMode === 'control'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Đặc tính 2: Khóa dính / Điều khiển hình (kéo điểm làm thay đổi bán kính đường tròn hoặc kéo co dãn hình)"
            >
              2: Khóa / Đổi bán kính
            </button>
          </div>
        </div>
      )}

      {/* LaTeX Edit Button */}
      {isLatex && onEditLatex && (
        <button
          onClick={onEditLatex}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200/60 transition-colors"
          title="Chỉnh sửa công thức LaTeX"
        >
          <Edit3 className="w-3.5 h-3.5" />
          <span>Sửa công thức</span>
        </button>
      )}

      {/* Stroke Color Picker */}
      <div className="flex items-center gap-1.5 border-r border-slate-200 pr-2">
        <span className="text-xs font-medium text-slate-500">Nét:</span>
        <div className="flex items-center gap-1">
          {STROKE_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onUpdateElement({ stroke: c })}
              style={{ backgroundColor: c }}
              className={`w-5 h-5 rounded-full transition-all ${
                selectedElement.stroke === c
                  ? 'ring-2 ring-blue-500 ring-offset-1 scale-110 shadow-sm'
                  : 'hover:scale-105 opacity-80 hover:opacity-100'
              }`}
            />
          ))}
          {/* Custom color input */}
          <input
            type="color"
            value={selectedElement.stroke || '#0f172a'}
            onChange={(e) => onUpdateElement({ stroke: e.target.value })}
            className="w-5 h-5 rounded-full cursor-pointer p-0 border-0 bg-transparent"
            title="Chọn màu khác"
          />
        </div>
      </div>

      {/* Stroke Style: Solid, Dashed, Dotted */}
      <div className="flex items-center gap-1 border-r border-slate-200 pr-2">
        {(['solid', 'dashed', 'dotted'] as StrokeStyle[]).map((style) => (
          <button
            key={style}
            onClick={() => onUpdateElement({ strokeStyle: style })}
            title={
              style === 'solid'
                ? 'Nét liền'
                : style === 'dashed'
                ? 'Nét đứt'
                : 'Nét chấm'
            }
            className={`px-2 py-1 text-xs font-medium rounded-lg transition-colors flex items-center ${
              selectedElement.strokeStyle === style
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {style === 'solid' && '— Liền'}
            {style === 'dashed' && '- - Đứt'}
            {style === 'dotted' && '··· Chấm'}
          </button>
        ))}
      </div>

      {/* Stroke Width Selector: Mảnh, Vừa, Đậm */}
      <div className="flex items-center gap-1 border-r border-slate-200 pr-2">
        {[1, 1.5, 2.5, 4].map((w) => (
          <button
            key={w}
            onClick={() => onUpdateElement({ strokeWidth: w })}
            title={
              w === 1
                ? 'Nét mảnh: 1px'
                : w === 1.5
                ? 'Nét chuẩn: 1.5px'
                : w === 2.5
                ? 'Nét vừa: 2.5px'
                : 'Nét đậm: 4px'
            }
            className={`w-6 h-6 flex items-center justify-center rounded-md text-xs font-bold transition-colors ${
              selectedElement.strokeWidth === w
                ? 'bg-slate-800 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <div
              style={{
                width: '12px',
                height: `${w}px`,
                backgroundColor: 'currentColor',
                borderRadius: '1px',
              }}
            />
          </button>
        ))}
      </div>

      {/* Fill Color (if circle or polygon) */}
      {hasFill && (
        <div className="flex items-center gap-1.5 border-r border-slate-200 pr-2">
          <span className="text-xs font-medium text-slate-500">Tô:</span>
          <div className="flex items-center gap-1">
            {FILL_COLORS.map((f) => (
              <button
                key={f.value}
                onClick={() => onUpdateElement({ fill: f.value } as any)}
                title={f.label}
                style={{
                  backgroundColor: f.value === 'transparent' ? '#fff' : f.value,
                  backgroundImage:
                    f.value === 'transparent'
                      ? 'linear-gradient(45deg, #cbd5e1 25%, transparent 25%), linear-gradient(-45deg, #cbd5e1 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #cbd5e1 75%), linear-gradient(-45deg, transparent 75%, #cbd5e1 75%)'
                      : undefined,
                  backgroundSize: '6px 6px',
                }}
                className={`w-5 h-5 rounded-full border border-slate-300 transition-all ${
                  (selectedElement as any).fill === f.value
                    ? 'ring-2 ring-blue-500 ring-offset-1 scale-110 shadow-sm'
                    : 'hover:scale-105'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Layer Actions: Front / Back */}
      <div className="flex items-center gap-0.5 border-r border-slate-200 pr-2">
        <button
          onClick={onBringToFront}
          title="Đưa lên trên cùng"
          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onSendToBack}
          title="Đưa xuống dưới cùng"
          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Duplicate Button */}
      <button
        onClick={onDuplicateElement}
        title="Nhân bản đối tượng"
        className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
      >
        <Copy className="w-4 h-4" />
      </button>

      {/* Delete Button (with Delete key hint) */}
      <button
        onClick={onDeleteElement}
        title="Xóa đối tượng (Phím Delete hoặc Backspace)"
        className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-rose-200/80 active:scale-95"
      >
        <Trash2 className="w-3.5 h-3.5" />
        <span>Xóa</span>
        <span className="text-[10px] text-rose-400 font-normal">Del</span>
      </button>
    </div>
  );
};
