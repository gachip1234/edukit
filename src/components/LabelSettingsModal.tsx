import React, { useState, useEffect } from 'react';
import type { GlobalLabelStyle } from '../types/geometry';
import { Type, Check, Sparkles, X } from 'lucide-react';

interface LabelSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentStyle: GlobalLabelStyle;
  onSave: (newStyle: GlobalLabelStyle, applyToAll: boolean) => void;
}

const FONT_COLORS = [
  { label: 'Đen Slate', value: '#0f172a' },
  { label: 'Xanh dương', value: '#2563eb' },
  { label: 'Đỏ', value: '#dc2626' },
  { label: 'Xanh lá', value: '#16a34a' },
  { label: 'Cam', value: '#d97706' },
  { label: 'Tím', value: '#9333ea' },
  { label: 'Xám đậm', value: '#475569' },
];

export const LabelSettingsModal: React.FC<LabelSettingsModalProps> = ({
  isOpen,
  onClose,
  currentStyle,
  onSave,
}) => {
  const [style, setStyle] = useState<GlobalLabelStyle>(currentStyle);

  useEffect(() => {
    if (isOpen) {
      setStyle(currentStyle);
    }
  }, [isOpen, currentStyle]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
              <Type className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                Định dạng tên nhãn toàn Canvas
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                Đồng bộ kích thước, phông chữ và màu sắc tên điểm
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Controls */}
        <div className="p-5 space-y-4">
          {/* Live Preview Box */}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 flex flex-col items-center justify-center">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Xem trước hiển thị nhãn
            </span>
            <div className="flex items-center gap-6 py-2">
              {['A', 'B', 'C'].map((lbl) => (
                <div key={lbl} className="flex items-center gap-1.5">
                  <div
                    className="w-3 h-3 rounded-full bg-slate-800 border-2 border-white shadow-xs"
                    style={{ backgroundColor: style.color }}
                  />
                  <span
                    style={{
                      fontSize: `${style.fontSize}px`,
                      color: style.color,
                      fontFamily: style.fontFamily,
                      fontStyle: style.fontStyle.includes('italic') ? 'italic' : 'normal',
                      fontWeight: style.fontStyle.includes('bold') ? 'bold' : 'normal',
                    }}
                  >
                    {lbl}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Font Size Selection */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">
              Cỡ chữ nhãn:
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {[
                { size: 12, desc: 'Nhỏ' },
                { size: 15, desc: 'Chuẩn' },
                { size: 18, desc: 'Lớn' },
                { size: 22, desc: 'Rất lớn' },
                { size: 26, desc: 'Khổng lồ' },
              ].map((item) => (
                <button
                  key={item.size}
                  type="button"
                  onClick={() => setStyle({ ...style, fontSize: item.size })}
                  className={`py-2 px-1 rounded-xl text-xs font-semibold border flex flex-col items-center gap-0.5 transition-all ${
                    style.fontSize === item.size
                      ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-xs'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-sm font-bold">{item.size}px</span>
                  <span className="text-[10px] opacity-75">{item.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Font Family Selection */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">
              Phông chữ nhãn:
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'serif', label: 'Serif (Toán học)', font: 'serif' },
                { id: 'sans-serif', label: 'Sans-serif (Hiện đại)', font: 'sans-serif' },
                { id: 'monospace', label: 'Monospace', font: 'monospace' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStyle({ ...style, fontFamily: f.id })}
                  style={{ fontFamily: f.font }}
                  className={`py-1.5 px-2 rounded-xl text-xs font-semibold border transition-all ${
                    style.fontFamily === f.id
                      ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-xs'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Font Style Selection */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">
              Kiểu dáng chữ:
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { id: 'italic bold', label: 'Nghiêng đậm', sample: 'italic bold' },
                { id: 'italic', label: 'In nghiêng', sample: 'italic' },
                { id: 'bold', label: 'In đậm', sample: 'bold' },
                { id: 'normal', label: 'Bình thường', sample: 'normal' },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStyle({ ...style, fontStyle: s.id })}
                  className={`py-1.5 px-1 rounded-xl text-xs font-semibold border text-center transition-all ${
                    style.fontStyle === s.id
                      ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-xs'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span
                    style={{
                      fontStyle: s.sample.includes('italic') ? 'italic' : 'normal',
                      fontWeight: s.sample.includes('bold') ? 'bold' : 'normal',
                    }}
                  >
                    {s.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Color Selection */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">
              Màu chữ nhãn:
            </label>
            <div className="flex items-center gap-2">
              {FONT_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setStyle({ ...style, color: c.value })}
                  title={c.label}
                  style={{ backgroundColor: c.value }}
                  className={`w-7 h-7 rounded-full border-2 border-white transition-all shadow-xs flex items-center justify-center ${
                    style.color === c.value
                      ? 'ring-2 ring-blue-500 ring-offset-2 scale-110'
                      : 'hover:scale-105'
                  }`}
                >
                  {style.color === c.value && (
                    <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200/70 transition-colors"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(style, false);
              onClose();
            }}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 shadow-xs hover:bg-slate-50 transition-colors"
          >
            Chỉ lưu cho điểm mới
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(style, true);
              onClose();
            }}
            className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Đồng bộ toàn Canvas
          </button>
        </div>
      </div>
    </div>
  );
};
