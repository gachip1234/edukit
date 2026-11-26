import React from 'react';
import { Trash2 } from 'lucide-react';
import { MAX_COORD, MAX_DIM, MIN_DIM, SOLIDS, buildMesh, resolvePoints, type Dims, type ExtraPoint, type SolidDoc, type SolidKind, type Vec3 } from './model';
import { SGK_VIEW, type View } from './scene';
import type { DrawStyle } from './exportImage';

interface Props {
  doc: SolidDoc;
  view: View;
  style: DrawStyle;
  onSolid: (kind: SolidKind) => void;
  onDim: (key: keyof Dims, value: number) => void;
  onRename: (id: string, name: string) => void;
  onMovePoint: (id: string, change: { at?: Vec3; t?: number }) => void;
  onRemovePoint: (id: string) => void;
  onRemoveSegment: (id: string) => void;
  onResetLabels: () => void;
  onViewChange: (view: View) => void;
  onStyleChange: (style: DrawStyle) => void;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="flex flex-col gap-2.5">
    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h2>
    {children}
  </section>
);

const Slider: React.FC<{ label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }> = ({
  label,
  value,
  min,
  max,
  step,
  unit = '',
  onChange,
}) => (
  <label className="flex flex-col gap-1 text-[13px] font-semibold text-slate-700">
    <span className="flex justify-between">
      {label}
      <span className="text-slate-500">
        {String(value).replace('.', ',')}
        {unit}
      </span>
    </span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full h-7" />
  </label>
);

const choice = (active: boolean) =>
  `min-h-11 px-2 rounded-xl border-2 text-xs font-semibold text-slate-800 transition-colors ${
    active ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'
  }`;

export const SolidPanel: React.FC<Props> = ({
  doc,
  view,
  style,
  onSolid,
  onDim,
  onRename,
  onMovePoint,
  onRemovePoint,
  onRemoveSegment,
  onResetLabels,
  onViewChange,
  onStyleChange,
}) => {
  const mesh = buildMesh(doc);
  const points = resolvePoints(doc, mesh);
  const solid = SOLIDS.find((s) => s.kind === doc.kind)!;
  const defined = new Set(points.map((p) => p.id));
  // Tên của mọi điểm, kể cả điểm đang tạm không xác định
  const label = (id: string) => points.find((p) => p.id === id)?.name ?? doc.points.find((p) => p.id === id)?.name ?? '?';
  const baseY = mesh.vertices[mesh.base[0]].p[1];

  const describe = (p: ExtraPoint) => {
    const [a, b, c, d, e] = (p.of as string[]).map(label);
    switch (p.type) {
      case 'free':
        return 'Điểm tự do';
      case 'on':
        return `Thuộc đoạn ${a}${b}`;
      case 'face': {
        const face = mesh.faces.map((f) => f.map((i) => mesh.vertices[i].id)).find((ids) => (p.of as string[]).every((id) => ids.includes(id)));
        return `Thuộc ${p.open ? 'mặt phẳng' : 'mặt'} (${(face ?? p.of).map(label).join('')})`;
      }
      case 'line-line':
        return `Giao điểm của ${a}${b} và ${c}${d}`;
      case 'line-plane':
        return `Giao điểm của ${a}${b} và mặt phẳng (${c}${d}${e})`;
      default:
        return p.of.length === 2 ? `Trung điểm ${a}${b}` : `Tâm ${p.of.map(label).join('')}`;
    }
  };

  const coordinate = (p: ExtraPoint & { type: 'free' }, axis: number, title: string, offset = 0) => (
    <Slider
      label={title}
      value={Math.round((p.at[axis] - offset) * 10) / 10}
      min={-MAX_COORD}
      max={MAX_COORD}
      step={0.1}
      onChange={(v) => onMovePoint(p.id, { at: p.at.map((n, k) => (k === axis ? v + offset : n)) as Vec3 })}
    />
  );

  return (
    <div className="flex flex-col gap-5 p-4">
      <Section title="Khối hình">
        <div className="grid grid-cols-2 gap-2">
          {SOLIDS.map((s) => (
            <button key={s.kind} type="button" aria-pressed={s.kind === doc.kind} onClick={() => onSolid(s.kind)} className={choice(s.kind === doc.kind)}>
              {s.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Kích thước">
        {solid.dims.map((d) => (
          <Slider key={d.key} label={d.label} value={doc.dims[d.key]} min={MIN_DIM} max={MAX_DIM} step={0.5} onChange={(v) => onDim(d.key, v)} />
        ))}
      </Section>

      <Section title="Góc nhìn">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={view.mode === 'sgk'} onClick={() => onViewChange(SGK_VIEW)} className={choice(view.mode === 'sgk')}>
            Kiểu sách giáo khoa
          </button>
          <button type="button" aria-pressed={view.mode === 'free'} onClick={() => onViewChange({ ...view, mode: 'free' })} className={choice(view.mode === 'free')}>
            Xoay tự do
          </button>
        </div>
        {view.mode === 'free' && (
          <>
            <Slider label="Xoay ngang" unit="°" value={view.yaw} min={-180} max={180} step={1} onChange={(yaw) => onViewChange({ ...view, yaw })} />
            <Slider label="Nhìn từ trên" unit="°" value={view.tilt} min={-60} max={60} step={1} onChange={(tilt) => onViewChange({ ...view, tilt })} />
          </>
        )}
      </Section>

      <Section title="Nét và nhãn">
        <Slider label="Độ dày nét" value={style.lineWidth} min={1} max={4} step={0.5} onChange={(lineWidth) => onStyleChange({ ...style, lineWidth })} />
        <Slider label="Cỡ chữ" value={style.fontSize} min={14} max={36} step={1} onChange={(fontSize) => onStyleChange({ ...style, fontSize })} />
        <label className="flex items-center gap-2 min-h-9 text-[13px] font-semibold text-slate-700">
          <input type="checkbox" checked={style.showVertexDots} onChange={(e) => onStyleChange({ ...style, showVertexDots: e.target.checked })} className="w-4 h-4" />
          Chấm điểm tại các đỉnh
        </label>
      </Section>

      <Section title="Tên đỉnh và điểm">
        <div className="grid grid-cols-2 gap-2">
          {points.map((p) => (
            <input
              key={p.id}
              value={p.name}
              maxLength={12}
              onChange={(e) => onRename(p.id, e.target.value)}
              aria-label={`Tên của điểm ${p.id}`}
              className="min-w-0 w-full h-9 px-2 rounded-lg border border-slate-300 bg-white text-sm font-serif italic font-bold text-slate-900 select-text"
            />
          ))}
        </div>
        {Object.keys(doc.labelOffsets).length > 0 && (
          <button type="button" onClick={onResetLabels} className="h-9 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Đặt lại vị trí nhãn
          </button>
        )}
      </Section>

      {doc.points.length > 0 && (
        <Section title="Điểm đã thêm">
          <ul className="flex flex-col gap-2">
            {doc.points.map((p) => (
              <li key={p.id} data-added={p.id} className="flex flex-col gap-1 rounded-lg border border-slate-200 pl-3 pb-1">
                <div className="flex items-center gap-2">
                  <span className="font-serif italic font-bold text-slate-900">{p.name}</span>
                  <span className="flex-1 text-xs text-slate-600">{describe(p)}</span>
                  <button type="button" onClick={() => onRemovePoint(p.id)} aria-label={`Xóa điểm ${p.name}`} className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {!defined.has(p.id) && <p className="text-xs font-semibold text-rose-700">Hiện không xác định được (các đường không còn cắt nhau).</p>}
                {p.type === 'free' && (
                  <div className="flex flex-col gap-1 pr-3">
                    {coordinate(p, 0, `Ngang của ${p.name}`)}
                    {coordinate(p, 1, `Cao so với đáy của ${p.name}`, baseY)}
                    {coordinate(p, 2, `Sâu (về phía trước) của ${p.name}`)}
                  </div>
                )}
                {p.type === 'on' && (
                  <div className="pr-3">
                    <Slider label={`Vị trí trên ${p.of.map(label).join('')}`} value={Math.round(p.t * 100) / 100} min={0} max={1} step={0.01} onChange={(t) => onMovePoint(p.id, { t })} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {doc.segments.length > 0 && (
        <Section title="Đoạn thẳng đã nối">
          <ul className="flex flex-col gap-1">
            {doc.segments.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-lg border border-slate-200 pl-3">
                <span className="font-serif italic font-bold text-slate-900">
                  {label(s.from)}
                  {label(s.to)}
                </span>
                <button type="button" onClick={() => onRemoveSegment(s.id)} aria-label={`Xóa đoạn ${label(s.from)}${label(s.to)}`} className="w-9 h-9 flex items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
};
