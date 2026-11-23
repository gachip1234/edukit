import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import { X, Check, Sigma, Keyboard, Code2, Type, Loader2 } from 'lucide-react';
import type { MathfieldElement } from 'mathlive';

/**
 * Trình soạn công thức trực quan (giống Equation của Word), dùng MathLive:
 * - Gõ trực tiếp ra công thức: "/" → phân số, "^" → số mũ, "_" → chỉ số, "sqrt" → căn, "alpha" → α...
 * - Dải nút "Cấu trúc" / "Ký hiệu" chèn mẫu có ô trống (Tab để chuyển ô).
 * - Bàn phím toán ảo (hữu ích trên điện thoại).
 * - Chế độ "Chữ thường" cho nhãn văn bản; ô "Mã LaTeX" đồng bộ hai chiều cho người quen LaTeX.
 */

interface LatexDialogProps {
  isOpen: boolean;
  initialLatex?: string;
  initialFontSize?: number;
  initialColor?: string;
  onSave: (latex: string, fontSize: number, color: string) => void;
  onClose: () => void;
}

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'math-field': React.DetailedHTMLProps<React.HTMLAttributes<MathfieldElement>, MathfieldElement> & {
        'math-virtual-keyboard-policy'?: string;
        'smart-fence'?: string;
      };
    }
  }
}

interface RibbonItem {
  /** Mẫu chèn: #0 = vùng đang chọn, #? = ô trống */
  insert: string;
  /** Mã KaTeX để vẽ biểu tượng nút (mặc định: từ mẫu, ô trống hiện thành □) */
  icon?: string;
  title: string;
}

const STRUCTURES: { group: string; items: RibbonItem[] }[] = [
  {
    group: 'Phân số',
    items: [
      { insert: '\\frac{#0}{#?}', title: 'Phân số (gõ / )' },
      { insert: '\\dfrac{#0}{#?}', icon: '\\dfrac{\\square}{\\square}', title: 'Phân số lớn' },
      { insert: '#0/#?', icon: '\\square/\\square', title: 'Phân số viết ngang' },
    ],
  },
  {
    group: 'Mũ & chỉ số',
    items: [
      { insert: '#0^{#?}', title: 'Số mũ (gõ ^ )' },
      { insert: '#0_{#?}', title: 'Chỉ số dưới (gõ _ )' },
      { insert: '#0_{#?}^{#?}', title: 'Chỉ số dưới và trên' },
    ],
  },
  {
    group: 'Căn',
    items: [
      { insert: '\\sqrt{#0}', title: 'Căn bậc hai (gõ sqrt)' },
      { insert: '\\sqrt[#?]{#0}', title: 'Căn bậc n' },
    ],
  },
  {
    group: 'Tích phân & tổng',
    items: [
      { insert: '\\int_{#?}^{#?}#0\\,dx', icon: '\\int_{\\square}^{\\square}\\square\\,dx', title: 'Tích phân xác định' },
      { insert: '\\sum_{#?}^{#?}#0', title: 'Tổng sigma' },
      { insert: '\\lim_{#?\\to #?}#0', title: 'Giới hạn' },
    ],
  },
  {
    group: 'Ngoặc',
    items: [
      { insert: '\\left(#0\\right)', title: 'Ngoặc tròn' },
      { insert: '\\left[#0\\right]', title: 'Ngoặc vuông' },
      { insert: '\\left|#0\\right|', title: 'Giá trị tuyệt đối' },
      { insert: '\\begin{cases}#0\\\\#?\\end{cases}', icon: '\\begin{cases}\\square\\\\\\square\\end{cases}', title: 'Hệ phương trình' },
      { insert: '\\left[\\begin{array}{l}#0\\\\#?\\end{array}\\right.', icon: '\\left[\\begin{array}{l}\\square\\\\\\square\\end{array}\\right.', title: 'Hoặc (ngoặc vuông)' },
    ],
  },
  {
    group: 'Ký hiệu trên',
    items: [
      { insert: '\\overrightarrow{#0}', icon: '\\overrightarrow{AB}', title: 'Vectơ' },
      { insert: '\\widehat{#0}', icon: '\\widehat{ABC}', title: 'Góc (mũ)' },
      { insert: '\\overline{#0}', icon: '\\overline{AB}', title: 'Gạch trên' },
      { insert: '\\overset{\\frown}{#0}', icon: '\\overset{\\frown}{AB}', title: 'Cung' },
    ],
  },
  {
    group: 'Hàm',
    items: [
      { insert: '\\sin #0', icon: '\\sin', title: 'sin' },
      { insert: '\\cos #0', icon: '\\cos', title: 'cos' },
      { insert: '\\tan #0', icon: '\\tan', title: 'tan' },
      { insert: '\\log_{#?}#0', icon: '\\log_{\\square}', title: 'logarit' },
      { insert: '\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}', icon: '\\begin{pmatrix}\\square&\\square\\\\\\square&\\square\\end{pmatrix}', title: 'Ma trận 2×2' },
    ],
  },
];

const SYMBOLS: { group: string; items: string[] }[] = [
  { group: 'Hình học', items: ['\\triangle', '\\angle', '\\perp', '\\parallel', '^\\circ', '\\cong', '\\sim', '\\backsim', '\\odot'] },
  { group: 'Phép toán', items: ['\\pm', '\\mp', '\\times', '\\div', '\\cdot', '\\infty', '\\%'] },
  { group: 'Quan hệ', items: ['\\ne', '\\approx', '\\equiv', '\\le', '\\ge', '<', '>'] },
  { group: 'Hy Lạp', items: ['\\alpha', '\\beta', '\\gamma', '\\delta', '\\varepsilon', '\\theta', '\\lambda', '\\mu', '\\pi', '\\sigma', '\\varphi', '\\omega', '\\Delta', '\\Omega'] },
  { group: 'Tập hợp & logic', items: ['\\in', '\\notin', '\\subset', '\\subseteq', '\\cup', '\\cap', '\\varnothing', '\\mathbb{N}', '\\mathbb{Z}', '\\mathbb{Q}', '\\mathbb{R}', '\\forall', '\\exists'] },
  { group: 'Mũi tên', items: ['\\Rightarrow', '\\Leftrightarrow', '\\rightarrow', '\\leftarrow', '\\leftrightarrow'] },
];

/** Vẽ biểu tượng nút bằng KaTeX (ô trống hiện thành □) */
function iconHtml(tex: string): string {
  const shown = tex.replace(/#0|#\?/g, '\\square');
  try {
    return katex.renderToString(shown, { throwOnError: false, displayMode: false });
  } catch {
    return tex;
  }
}

/** Nhận diện nội dung là chữ thường được bọc \text{...} */
function unwrapText(latex: string): string | null {
  const m = latex.trim().match(/^\\text\{([\s\S]*)\}$/);
  return m && !m[1].includes('}') ? m[1] : null;
}

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
  const [mode, setMode] = useState<'math' | 'text'>('math');
  const [plainText, setPlainText] = useState('');
  const [tab, setTab] = useState<'structures' | 'symbols'>('structures');
  const [showCode, setShowCode] = useState(false);
  const [mathliveReady, setMathliveReady] = useState(false);
  const [mathliveFailed, setMathliveFailed] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const mfRef = useRef<MathfieldElement | null>(null);
  const latexRef = useRef(latex);
  latexRef.current = latex;
  const previewRef = useRef<HTMLDivElement>(null);

  // Nạp MathLive khi mở hộp thoại lần đầu (tải riêng để trang chính nhẹ hơn)
  useEffect(() => {
    if (!isOpen || mathliveReady) return;
    let cancelled = false;
    import('mathlive')
      .then(({ MathfieldElement }) => {
        // Font KaTeX đã có sẵn trong app (katex.min.css) → không tải thêm; tắt âm thanh phím
        MathfieldElement.fontsDirectory = null;
        MathfieldElement.soundsDirectory = null;
        if (!cancelled) setMathliveReady(true);
      })
      .catch(() => {
        if (!cancelled) setMathliveFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, mathliveReady]);

  // Mở hộp thoại: nạp nội dung ban đầu
  useEffect(() => {
    if (!isOpen) return;
    const start = initialLatex || '';
    const asText = unwrapText(start);
    setMode(asText !== null ? 'text' : 'math');
    setPlainText(asText ?? '');
    setLatex(start);
    latexRef.current = start;
    if (mfRef.current) mfRef.current.value = asText !== null ? '' : start;
    setFontSize(initialFontSize || 22);
    setColor(initialColor || '#0f172a');
    setPreviewError(null);
  }, [isOpen, initialLatex, initialFontSize, initialColor]);

  // Gắn ô soạn công thức: giá trị ban đầu, sự kiện gõ, tùy chọn
  const attachMathfield = useCallback(
    (el: MathfieldElement | null) => {
      mfRef.current = el;
      if (!el) return;
      el.smartFence = true;
      el.smartSuperscript = true;
      el.mathVirtualKeyboardPolicy = 'manual';
      el.setAttribute('math-virtual-keyboard-policy', 'manual');
      const current = latexRef.current;
      el.value = unwrapText(current) !== null ? '' : current;
      el.oninput = () => setLatex(el.getValue('latex-without-placeholders'));
      requestAnimationFrame(() => el.focus());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mathliveReady, isOpen, mode],
  );

  // Xem trước đúng như sẽ hiện trên bản vẽ (KaTeX)
  const finalLatex = mode === 'text' ? (plainText.trim() ? `\\text{${plainText.trim()}}` : '') : latex.trim();
  useEffect(() => {
    if (!previewRef.current) return;
    try {
      katex.render(finalLatex || '\\text{(trống)}', previewRef.current, { throwOnError: true, displayMode: true });
      setPreviewError(null);
    } catch (err: any) {
      setPreviewError(err?.message || 'Lỗi cú pháp LaTeX');
    }
    // isOpen: vẽ lại khi vừa mở hộp thoại (lúc đó khung xem trước mới xuất hiện)
  }, [finalLatex, fontSize, color, isOpen, mode]);

  const ribbonIcons = useMemo(
    () => ({
      structures: STRUCTURES.map((g) => g.items.map((it) => iconHtml(it.icon || it.insert))),
      symbols: SYMBOLS.map((g) => g.items.map((s) => iconHtml(s))),
    }),
    [],
  );

  if (!isOpen) return null;

  const insertTemplate = (tpl: string) => {
    const mf = mfRef.current;
    if (mode === 'math' && mf) {
      mf.insert(tpl, { selectionMode: 'placeholder', insertionMode: 'replaceSelection', format: 'latex' });
      mf.focus();
      setLatex(mf.getValue('latex-without-placeholders'));
    } else if (mode === 'math') {
      // Chưa tải được MathLive: chèn vào ô mã LaTeX
      setLatex((prev) => `${prev}${prev ? ' ' : ''}${tpl.replace(/#0|#\?/g, '')}`);
    }
  };

  const toggleKeyboard = () => {
    const kb = (window as any).mathVirtualKeyboard;
    if (!kb) return;
    mfRef.current?.focus();
    if (kb.visible) kb.hide();
    else kb.show();
  };

  const handleConfirm = () => {
    if (!finalLatex || previewError) return;
    (window as any).mathVirtualKeyboard?.hide?.();
    onSave(finalLatex, fontSize, color);
    onClose();
  };

  const handleClose = () => {
    (window as any).mathVirtualKeyboard?.hide?.();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-3 animate-in fade-in duration-150"
      onKeyDown={(e) => {
        if (e.key === 'Escape') handleClose();
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleConfirm();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92dvh] overflow-hidden flex flex-col">
        {/* Tiêu đề */}
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Sigma className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-bold text-slate-800">Soạn công thức</h3>
          </div>
          <div className="flex items-center gap-2">
            {/* Công thức / Chữ thường */}
            <div className="flex p-0.5 bg-slate-200/70 rounded-lg text-xs font-semibold">
              <button
                onClick={() => setMode('math')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md ${mode === 'math' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'}`}
              >
                <Sigma className="w-3.5 h-3.5" /> Công thức
              </button>
              <button
                onClick={() => setMode('text')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md ${mode === 'text' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'}`}
              >
                <Type className="w-3.5 h-3.5" /> Chữ thường
              </button>
            </div>
            <button
              onClick={handleClose}
              aria-label="Đóng"
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-3 overflow-y-auto">
          {mode === 'math' && (
            <>
              {/* Dải công cụ kiểu Word: Cấu trúc / Ký hiệu */}
              <div className="rounded-xl border border-slate-200 bg-slate-50">
                <div className="flex items-center gap-1 px-2 pt-2 text-xs font-semibold">
                  {(
                    [
                      ['structures', 'Cấu trúc'],
                      ['symbols', 'Ký hiệu'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setTab(id)}
                      className={`px-3 py-1 rounded-t-lg border-b-2 ${tab === id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                      {label}
                    </button>
                  ))}
                  <div className="flex-1" />
                  <button
                    onClick={toggleKeyboard}
                    disabled={!mathliveReady}
                    title="Bật/tắt bàn phím toán ảo"
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-slate-600 hover:bg-slate-200 disabled:opacity-40"
                  >
                    <Keyboard className="w-4 h-4" />
                    <span className="hidden sm:inline">Bàn phím</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 px-2 py-2 border-t border-slate-200 max-h-56 overflow-y-auto">
                  {(tab === 'structures' ? STRUCTURES : SYMBOLS).map((g, gi) => (
                    <div key={g.group} className="shrink-0">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{g.group}</div>
                      <div className="flex flex-wrap gap-1">
                        {g.items.map((it, ii) => {
                          const insert = typeof it === 'string' ? it : it.insert;
                          const title = typeof it === 'string' ? it.replace(/\\/g, '') : it.title;
                          const html =
                            tab === 'structures' ? ribbonIcons.structures[gi][ii] : ribbonIcons.symbols[gi][ii];
                          return (
                            <button
                              key={insert}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => insertTemplate(insert)}
                              title={title}
                              className="min-w-9 h-9 px-1.5 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-800 hover:border-blue-400 hover:bg-blue-50 transition-colors text-[13px]"
                              dangerouslySetInnerHTML={{ __html: html }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ô soạn công thức trực quan */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">Công thức</label>
                  <span className="text-[11px] text-slate-400">
                    Gõ <b>/</b> phân số · <b>^</b> mũ · <b>_</b> chỉ số · <b>sqrt</b> căn · <b>Tab</b> sang ô kế
                  </span>
                </div>
                {mathliveReady ? (
                  <math-field
                    key={`mf-${isOpen}`}
                    ref={attachMathfield}
                    className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500"
                    style={{ fontSize: '1.6rem', minHeight: '3.2rem', color: '#0f172a', background: '#fff' } as React.CSSProperties}
                  />
                ) : mathliveFailed ? (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2">
                    Không tải được trình soạn trực quan. Bạn vẫn gõ được mã LaTeX ở ô bên dưới.
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-slate-500 h-[3.2rem] px-3 border border-slate-200 rounded-xl">
                    <Loader2 className="w-4 h-4 animate-spin" /> Đang tải trình soạn công thức…
                  </div>
                )}
              </div>

              {/* Mã LaTeX (đồng bộ hai chiều) */}
              <div>
                <button
                  onClick={() => setShowCode((v) => !v)}
                  className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  <Code2 className="w-3.5 h-3.5" /> {showCode || mathliveFailed ? 'Ẩn' : 'Xem / sửa'} mã LaTeX
                </button>
                {(showCode || mathliveFailed) && (
                  <textarea
                    rows={2}
                    value={latex}
                    onChange={(e) => {
                      setLatex(e.target.value);
                      if (mfRef.current) mfRef.current.value = e.target.value;
                    }}
                    spellCheck={false}
                    placeholder="Ví dụ: S_{ABC}=\frac{1}{2}ah"
                    className="mt-1 w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>
            </>
          )}

          {mode === 'text' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nội dung chữ (giữ nguyên dấu cách, tiếng Việt)</label>
              <input
                type="text"
                value={plainText}
                onChange={(e) => setPlainText(e.target.value.replace(/[{}\\]/g, ''))}
                placeholder="Ví dụ: Hình 1, (d), Bài 3"
                autoFocus
                className="w-full px-3 py-2 text-base border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Cỡ chữ & màu */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Cỡ chữ: {fontSize}px</label>
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
              <label className="block text-xs font-medium text-slate-600 mb-1">Màu</label>
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

          {/* Xem trước đúng như trên bản vẽ */}
          <div>
            <span className="block text-xs font-semibold text-slate-500 mb-1">Xem trước trên bản vẽ</span>
            <div
              className="canvas-paper p-3 rounded-xl border border-slate-200 min-h-[64px] flex items-center justify-center overflow-x-auto"
              style={{ color }}
            >
              {previewError ? (
                <span className="text-xs text-rose-500 font-mono">{previewError}</span>
              ) : (
                <div ref={previewRef} style={{ fontSize: `${fontSize}px` }} />
              )}
            </div>
          </div>
        </div>

        {/* Nút */}
        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-2 bg-slate-50">
          <span className="hidden sm:inline text-[11px] text-slate-400">Ctrl + Enter để chèn</span>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
            >
              Hủy
            </button>
            <button
              onClick={handleConfirm}
              disabled={!finalLatex || Boolean(previewError)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow-md shadow-blue-500/20 active:scale-97 transition-all"
            >
              <Check className="w-4 h-4" />
              <span>Chèn vào bản vẽ</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
