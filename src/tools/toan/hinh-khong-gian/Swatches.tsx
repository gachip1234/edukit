import React from 'react';
import { Ban, Plus } from 'lucide-react';
import { PALETTE } from './palette';

interface Props {
  /** Màu đang chọn; null: không màu; undefined: không đánh dấu ô nào */
  value: string | null | undefined;
  onChange: (color: string | null) => void;
  /** Tên của lựa chọn không màu, vd. "Mặc định", "Bỏ tô" */
  noneLabel: string;
  /** Nhãn của cả nhóm cho trình đọc màn hình */
  label: string;
  /** Một hàng gọn (cuộn ngang khi hẹp), dùng trên thanh nhắc */
  compact?: boolean;
}

const ring = (active: boolean) => (active ? 'outline-2 outline-offset-2 outline-slate-900' : '');

export const Swatches: React.FC<Props> = ({ value, onChange, noneLabel, label, compact = false }) => {
  const swatch = `${compact ? 'w-7 h-7' : 'w-8 h-8'} shrink-0 rounded-full border border-slate-300 flex items-center justify-center`;
  const custom = typeof value === 'string' && !PALETTE.some((c) => c.value === value);
  return (
    <div role="group" aria-label={label} className={`flex items-center p-1 ${compact ? 'max-w-full gap-1 overflow-x-auto no-scrollbar' : 'flex-wrap gap-1.5'}`}>
      <button type="button" title={noneLabel} aria-label={noneLabel} aria-pressed={value === null} onClick={() => onChange(null)} className={`${swatch} bg-white text-slate-500 ${ring(value === null)}`}>
        <Ban className="w-4 h-4" />
      </button>
      {PALETTE.map((c) => (
        <button
          key={c.value}
          type="button"
          title={c.label}
          aria-label={c.label}
          aria-pressed={value === c.value}
          onClick={() => onChange(c.value)}
          className={`${swatch} ${ring(value === c.value)}`}
          style={{ background: c.value }}
        />
      ))}
      <label title="Màu khác" className={`${swatch} relative cursor-pointer text-slate-600 ${custom ? ring(true) : 'bg-white'}`} style={custom ? { background: value } : undefined}>
        {!custom && <Plus className="w-4 h-4" />}
        <input type="color" aria-label="Màu khác" value={value ?? '#2563eb'} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
      </label>
    </div>
  );
};
