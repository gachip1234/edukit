import React, { useState, useEffect, useRef } from 'react';
import katex from 'katex';
import { X, Check, Sparkles } from 'lucide-react';

interface LatexDialogProps {
  isOpen: boolean;
  initialLatex?: string;
  initialFontSize?: number;
  initialColor?: string;
  onSave: (latex: string, fontSize: number, color: string) => void;
  onClose: () => void;
}

const MATH_SHORTCUTS = [
  // Geometry
  { label: '△ABC', latex: '\\triangle ABC' },
  { label: '∠ABC', latex: '\\angle ABC' },
  { label: 'AB ⊥ CD', latex: 'AB \\perp CD' },
  { label: 'AB // CD', latex: 'AB \\parallel CD' },
  { label: '60°', latex: '60^\\circ' },
  { label: 'vec(u)', latex: '\\vec{u}' },
  { label: 'vec(AB)', latex: '\\vec{AB}' },
  // Greek
  { label: 'α', latex: '\\alpha' },
  { label: 'β', latex: '\\beta' },
  { label: 'γ', latex: '\\gamma' },
  { label: 'θ', latex: '\\theta' },
  { label: 'π', latex: '\\pi' },
  { label: 'Δ', latex: '\\Delta' },
  // Formulas
  { label: 'a/b', latex: '\\frac{a}{b}' },
  { label: '√x', latex: '\\sqrt{x}' },
  { label: 'x²', latex: 'x^2' },
  { label: 'R²', latex: 'R^2' },
  { label: 'S_ABC', latex: 'S_{ABC}' },
  { label: 'x_0', latex: 'x_0' },
  { label: '≈', latex: '\\approx' },
  { label: '≠', latex: '\\neq' },
  { label: '≤', latex: '\\le' },
  { label: '≥', latex: '\\ge' },
];

export const LatexDialog: React.FC<LatexDialogProps> = ({
  isOpen,
  initialLatex = 'A',
  initialFontSize = 22,
  initialColor = '#0f172a',
  onSave,
  onClose,
}) => {
  const [latex, setLatex] = useState(initialLatex);
  const [fontSize, setFontSize] = useState(initialFontSize);
  const [color, setColor] = useState(initialColor);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setLatex(initialLatex || 'A');
      setFontSize(initialFontSize || 22);
      setColor(initialColor || '#0f172a');
      setPreviewError(null);
    }
  }, [isOpen, initialLatex, initialFontSize, initialColor]);

  // Live KaTeX preview update
  useEffect(() => {
    if (!previewRef.current) return;
    try {
      const clean = latex.trim();
      const expr = clean.startsWith('$') && clean.endsWith('$') ? clean.slice(1, -1) : clean;
      katex.render(expr || '\\text{trống}', previewRef.current, {
        throwOnError: true,
        displayMode: true,
      });
      setPreviewError(null);
    } catch (err: any) {
      setPreviewError(err.message || 'Lỗi cú pháp LaTeX');
    }
  }, [latex, fontSize, color]);

  if (!isOpen) return null;

  const insertSymbol = (sym: string) => {
    setLatex((prev) => (prev ? `${prev} ${sym}` : sym));
  };

  const handleConfirm = () => {
    if (!latex.trim()) return;
    onSave(latex.trim(), fontSize, color);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-bold text-slate-800">
              Chèn Chữ / Công thức Toán LaTeX
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-4">
          {/* Quick symbols bank */}
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1">
              <span>Ký hiệu toán học thông dụng (click để chèn):</span>
            </div>
            <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 rounded-xl border border-slate-200 max-h-28 overflow-y-auto">
              {MATH_SHORTCUTS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => insertSymbol(s.latex)}
                  className="px-2 py-1 text-xs font-mono font-medium bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 rounded-lg transition-colors shadow-2xs"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* LaTeX Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nội dung (Văn bản hoặc mã LaTeX):
            </label>
            <textarea
              rows={2}
              value={latex}
              onChange={(e) => setLatex(e.target.value)}
              placeholder="Ví dụ: A, S_{ABC} = \frac{1}{2}ah, \angle ABC = 60^\circ"
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              autoFocus
            />
          </div>

          {/* Styling Options: Size & Color */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Kích thước chữ: {fontSize}px
              </label>
              <input
                type="range"
                min={14}
                max={48}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full accent-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Màu chữ / công thức:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-8 h-8 rounded-lg cursor-pointer border border-slate-300 p-0"
                />
                <span className="text-xs font-mono text-slate-600">{color}</span>
              </div>
            </div>
          </div>

          {/* Live Preview Area */}
          <div>
            <span className="block text-xs font-semibold text-slate-500 mb-1">
              Xem trước hiển thị:
            </span>
            <div
              className="p-4 rounded-xl border border-slate-200 min-h-[70px] flex items-center justify-center bg-slate-50/50"
              style={{ color }}
            >
              {previewError ? (
                <span className="text-xs text-rose-500 font-mono">
                  {previewError}
                </span>
              ) : (
                <div
                  ref={previewRef}
                  style={{ fontSize: `${fontSize}px` }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={handleConfirm}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-500/20 active:scale-97 transition-all"
          >
            <Check className="w-4 h-4" />
            <span>Chèn vào bản vẽ</span>
          </button>
        </div>
      </div>
    </div>
  );
};
