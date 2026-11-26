import React, { useState } from 'react';
import { Eye, EyeOff, Trash2 } from 'lucide-react';
import {
  MAX_COORD,
  MAX_DIM,
  MIN_DIM,
  SOLIDS,
  buildMesh,
  curveKey,
  hasHidden,
  lineKey,
  meshEdges,
  outlineLabel,
  pointKey,
  resolvePoints,
  roundCurves,
  solidFaces,
  type Dims,
  type ExtraPoint,
  type SolidDoc,
  type SolidKind,
  type Vec3,
} from './model';
import { SGK_VIEW, effectiveView, type View } from './scene';
import { INK, type DrawStyle } from './exportImage';
import { Swatches } from './Swatches';
import type { Look3 } from './three/engine';

interface Props {
  /** Đang xem mô hình 3D */
  solid3d: boolean;
  onSolid3d: (on: boolean) => void;
  look3d: Look3;
  onLook3d: (look: Look3) => void;
  doc: SolidDoc;
  view: View;
  style: DrawStyle;
  onSolid: (kind: SolidKind) => void;
  onDim: (key: keyof Dims, value: number) => void;
  onRename: (id: string, name: string) => void;
  onMovePoint: (id: string, change: { at?: Vec3; t?: number }) => void;
  onRemovePoint: (id: string) => void;
  onRemoveSegment: (id: string) => void;
  onLook: (key: string, change: { color?: string | null; hidden?: boolean }) => void;
  onFill: (keys: string[], color: string | null) => void;
  onShowAll: () => void;
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

const rowButton = 'w-9 h-9 shrink-0 flex items-center justify-center rounded-lg';

/** Nút tròn cho biết màu hiện tại, bấm để mở bảng màu */
const ColorButton: React.FC<{ name: string; color: string | undefined; fallback: string; open: boolean; onToggle: () => void }> = ({ name, color, fallback, open, onToggle }) => (
  <button type="button" onClick={onToggle} title={`Màu của ${name}`} aria-label={`Màu của ${name}`} aria-expanded={open} className={`${rowButton} hover:bg-slate-100 ${open ? 'bg-slate-100' : ''}`}>
    <span className="w-5 h-5 rounded-full border border-slate-300" style={{ background: color ?? fallback }} />
  </button>
);

const EyeButton: React.FC<{ name: string; hidden: boolean; onToggle: () => void }> = ({ name, hidden, onToggle }) => (
  <button type="button" onClick={onToggle} title={`${hidden ? 'Hiện' : 'Ẩn'} ${name}`} aria-label={`${hidden ? 'Hiện' : 'Ẩn'} ${name}`} className={`${rowButton} hover:bg-slate-100 ${hidden ? 'text-slate-400' : 'text-slate-700'}`}>
    {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
  </button>
);

const choice = (active: boolean) =>
  `min-h-11 px-2 rounded-xl border-2 text-xs font-semibold text-slate-800 transition-colors ${
    active ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'
  }`;

export const SolidPanel: React.FC<Props> = ({
  solid3d,
  onSolid3d,
  look3d,
  onLook3d,
  doc,
  view,
  style,
  onSolid,
  onDim,
  onRename,
  onMovePoint,
  onRemovePoint,
  onRemoveSegment,
  onLook,
  onFill,
  onShowAll,
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
  const baseY = mesh.round ? mesh.round.y0 : mesh.vertices[mesh.base[0]].p[1];
  const faces = solidFaces(mesh);
  /** Dòng đang mở bảng màu */
  const [openColor, setOpenColor] = useState<string | null>(null);
  const toggleColor = (key: string) => setOpenColor((open) => (open === key ? null : key));

  /** Nút màu và nút ẩn/hiện của một điểm, đoạn hoặc đường tròn */
  const lookButtons = (key: string, name: string) => (
    <>
      <ColorButton name={name} color={doc.looks[key]?.color} fallback={INK} open={openColor === key} onToggle={() => toggleColor(key)} />
      <EyeButton name={name} hidden={doc.looks[key]?.hidden === true} onToggle={() => onLook(key, { hidden: !doc.looks[key]?.hidden })} />
    </>
  );
  const lookColors = (key: string, name: string) =>
    openColor === key && <Swatches value={doc.looks[key]?.color ?? null} onChange={(color) => onLook(key, { color })} noneLabel="Màu mặc định" label={`Chọn màu cho ${name}`} />;

  const curveRows = mesh.round
    ? [...roundCurves(mesh).map((c) => ({ key: curveKey(c.id), name: c.label })), { key: curveKey('outline'), name: outlineLabel(mesh.round.type) }]
    : [];
  const lineRows = [
    ...doc.segments.map((s) => ({ key: lineKey(s.from, s.to), from: s.from, to: s.to, segment: s.id as string | null })),
    ...meshEdges(mesh).map(([from, to]) => ({ key: lineKey(from, to), from, to, segment: null })),
  ];

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
      case 'rim':
        return `Thuộc đường tròn tâm ${a}`;
      case 'disk':
        return p.open ? `Thuộc mặt phẳng tròn qua ${a}` : `Thuộc mặt tròn tâm ${a}`;
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
      <Section title="Chế độ hiển thị">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={!solid3d} onClick={() => onSolid3d(false)} className={choice(!solid3d)}>
            Hình vẽ nét
          </button>
          <button type="button" aria-pressed={solid3d} onClick={() => onSolid3d(true)} className={choice(solid3d)}>
            Mô hình 3D
          </button>
        </div>
        {solid3d &&
          (
            [
              ['glass', 'Kính trong'],
              ['perspective', 'Phối cảnh xa gần'],
              ['floor', 'Mặt sàn và bóng đổ'],
            ] as const
          ).map(([key, title]) => (
            <label key={key} className="flex items-center gap-2 min-h-9 text-[13px] font-semibold text-slate-700">
              <input type="checkbox" checked={look3d[key]} onChange={(e) => onLook3d({ ...look3d, [key]: e.target.checked })} className="w-4 h-4" />
              {title}
            </label>
          ))}
      </Section>

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
          <button type="button" aria-pressed={view.mode === 'free'} onClick={() => onViewChange({ ...effectiveView(doc.kind, view), mode: 'free' })} className={choice(view.mode === 'free')}>
            Xoay tự do
          </button>
        </div>
        {view.mode === 'free' && (
          <>
            <Slider label="Xoay ngang" unit="°" value={Math.round(view.yaw)} min={-180} max={180} step={1} onChange={(yaw) => onViewChange({ ...view, yaw })} />
            <Slider label="Nhìn từ trên" unit="°" value={view.tilt} min={-60} max={60} step={1} onChange={(tilt) => onViewChange({ ...view, tilt })} />
          </>
        )}
      </Section>

      <Section title="Tô màu mặt">
        <p className="text-xs text-slate-500">{solid3d ? 'Ở mô hình 3D, mặt được tô đậm hơn để thấy rõ trên khối.' : 'Màu tô nhẹ, trong suốt 90%.'}</p>
        <ul className="flex flex-col gap-1">
          {faces.map((f) => (
            <li key={f.key} data-face-row={f.key} className="flex flex-col rounded-lg border border-slate-200 pl-3">
              <div className="flex items-center gap-2">
                <span className="flex-1 text-[13px] font-semibold text-slate-800">{f.label}</span>
                <ColorButton name={f.label} color={doc.fills[f.key]} fallback="#ffffff" open={openColor === f.key} onToggle={() => toggleColor(f.key)} />
              </div>
              {openColor === f.key && <Swatches value={doc.fills[f.key] ?? null} onChange={(color) => onFill([f.key], color)} noneLabel="Bỏ tô" label={`Chọn màu cho ${f.label}`} />}
            </li>
          ))}
        </ul>
        {faces.length > 1 && (
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold text-slate-700">Tô tất cả các mặt</span>
            <Swatches
              value={undefined}
              onChange={(color) => onFill(faces.map((f) => f.key), color)}
              noneLabel="Bỏ tô tất cả"
              label="Tô tất cả các mặt"
            />
          </div>
        )}
      </Section>

      <Section title="Nét và nhãn">
        <Slider label="Độ dày nét" value={style.lineWidth} min={1} max={4} step={0.5} onChange={(lineWidth) => onStyleChange({ ...style, lineWidth })} />
        <Slider label="Cỡ chữ" value={style.fontSize} min={14} max={36} step={1} onChange={(fontSize) => onStyleChange({ ...style, fontSize })} />
        {!solid3d && (
          <label className="flex items-center gap-2 min-h-9 text-[13px] font-semibold text-slate-700">
            <input type="checkbox" checked={style.showVertexDots} onChange={(e) => onStyleChange({ ...style, showVertexDots: e.target.checked })} className="w-4 h-4" />
            Chấm điểm tại các đỉnh
          </label>
        )}
      </Section>

      <Section title="Đỉnh và điểm">
        {hasHidden(doc) && (
          <button type="button" onClick={onShowAll} className="h-9 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Hiện tất cả những gì đang ẩn
          </button>
        )}
        <ul className="flex flex-col gap-1">
          {points.map((p) => (
            <li key={p.id} data-point-row={p.id} className="flex flex-col">
              <div className="flex items-center gap-1">
                <input
                  value={p.name}
                  maxLength={12}
                  onChange={(e) => onRename(p.id, e.target.value)}
                  aria-label={`Tên của điểm ${p.id}`}
                  className="min-w-0 flex-1 h-9 px-2 rounded-lg border border-slate-300 bg-white text-sm font-serif italic font-bold text-slate-900 select-text"
                />
                {lookButtons(pointKey(p.id), `điểm ${p.name}`)}
              </div>
              {lookColors(pointKey(p.id), `điểm ${p.name}`)}
            </li>
          ))}
        </ul>
        {Object.keys(doc.labelOffsets).length > 0 && (
          <button type="button" onClick={onResetLabels} className="h-9 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Đặt lại vị trí nhãn
          </button>
        )}
      </Section>

      <Section title="Cạnh và đoạn thẳng">
        <ul className="flex flex-col gap-1">
          {lineRows.map((row) => {
            const text = `${label(row.from)}${label(row.to)}`;
            const name = `đoạn ${text}`;
            return (
              <li key={row.key} data-line-row={row.key} className="flex flex-col rounded-lg border border-slate-200 pl-3">
                <div className="flex items-center gap-1">
                  <span className="flex-1 font-serif italic font-bold text-slate-900">{text}</span>
                  {lookButtons(row.key, name)}
                  {row.segment !== null && (
                    <button type="button" onClick={() => onRemoveSegment(row.segment!)} aria-label={`Xóa đoạn ${text}`} title={`Xóa đoạn ${text}`} className={`${rowButton} text-rose-600 hover:bg-rose-50`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {lookColors(row.key, name)}
              </li>
            );
          })}
        </ul>
      </Section>

      {curveRows.length > 0 && (
        <Section title="Đường tròn và nét bao">
          <ul className="flex flex-col gap-1">
            {curveRows.map((row) => (
              <li key={row.key} data-curve-row={row.key} className="flex flex-col rounded-lg border border-slate-200 pl-3">
                <div className="flex items-center gap-1">
                  <span className="flex-1 text-[13px] font-semibold text-slate-800">{row.name}</span>
                  {lookButtons(row.key, row.name)}
                </div>
                {lookColors(row.key, row.name)}
              </li>
            ))}
          </ul>
        </Section>
      )}

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
                {p.type === 'rim' && (
                  <div className="pr-3">
                    <Slider label={`Góc trên đường tròn của ${p.name}`} unit="°" value={Math.round(p.t * 360) % 360} min={0} max={359} step={1} onChange={(angle) => onMovePoint(p.id, { t: angle / 360 })} />
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
    </div>
  );
};
