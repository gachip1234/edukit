import React, { useState } from 'react';
import { Search } from 'lucide-react';
import heroArt from './art/hero.svg';
import { AppHeader } from './AppHeader';
import { ToolThumb } from './ToolThumb';
import { subjectHref, toolHref } from './router';
import { SUBJECTS, TOOLS, toolsOf, type Subject } from '../tools/registry';

/** Bỏ dấu tiếng Việt để tìm "hinh" vẫn ra "Hình" */
const fold = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

const FACE: React.CSSProperties = { backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' };

/** Thẻ môn học kiểu flash card: bấm để lật */
const SubjectCard: React.FC<{ subject: Subject }> = ({ subject }) => {
  const [flipped, setFlipped] = useState(false);
  const tools = toolsOf(subject.id);
  const items = tools.length > 0 ? tools.map((t) => t.name) : subject.planned;
  const face = 'absolute inset-0 rounded-3xl transition-[visibility] duration-0 delay-300 motion-reduce:delay-0';

  return (
    <div className="h-[360px]" style={{ perspective: 1200 }}>
      <div
        className="relative w-full h-full transition-transform duration-600 motion-reduce:transition-none"
        style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'none' }}
      >
        <button
          type="button"
          onClick={() => setFlipped(true)}
          inert={flipped}
          aria-label={`Lật thẻ ${subject.name}`}
          className={`${face} w-full p-3 flex flex-col gap-3 text-left bg-white border border-slate-200 shadow-lg cursor-pointer hover:shadow-xl ${flipped ? 'invisible' : 'visible'}`}
          style={FACE}
        >
          <span className={`flex w-full h-[220px] shrink-0 rounded-2xl overflow-hidden ${subject.tint}`}>
            <img src={subject.art} alt="" className="w-full h-full object-contain" />
          </span>
          <span className="flex flex-col gap-2 px-1.5">
            <strong className="text-lg text-slate-900">{subject.name}</strong>
            <span className="flex items-center justify-between gap-2">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${subject.badge}`}>
                {tools.length > 0 ? `${tools.length} công cụ` : 'Sắp có'}
              </span>
              <span className="text-xs text-slate-500">Bấm để lật</span>
            </span>
          </span>
        </button>

        <div
          inert={!flipped}
          className={`${face} p-5 flex flex-col gap-3 text-white ${subject.solid} ${flipped ? 'visible' : 'invisible'}`}
          style={{ ...FACE, transform: 'rotateY(180deg)' }}
        >
          <strong className="text-lg">{subject.name}</strong>
          <p className="text-sm leading-relaxed">{subject.description}</p>
          <div className="flex-1 text-sm">
            {tools.length === 0 && <div className="font-semibold mb-1">Dự kiến:</div>}
            <ul className="list-disc pl-5 leading-7">
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          {tools.length > 0 ? (
            <a href={subjectHref(subject.id)} className={`h-11 shrink-0 rounded-xl bg-[#fff] text-sm font-bold flex items-center justify-center ${subject.solidText}`}>
              Vào môn {subject.name}
            </a>
          ) : (
            <span className="text-sm font-semibold">Đang chờ phát triển</span>
          )}
          <button type="button" onClick={() => setFlipped(false)} className="h-11 shrink-0 rounded-xl border border-white/80 text-sm font-semibold cursor-pointer hover:bg-white/10">
            Lật lại
          </button>
        </div>
      </div>
    </div>
  );
};

export const HomePage: React.FC = () => {
  const [query, setQuery] = useState('');
  const q = fold(query.trim());
  const results = q
    ? TOOLS.filter((t) => fold(`${t.name} ${t.summary} ${SUBJECTS.find((s) => s.id === t.subject)!.name}`).includes(q))
    : TOOLS;

  return (
    <div className="overflow-y-auto bg-slate-50" style={{ height: 'var(--app-h, 100%)' }}>
      <AppHeader>
        <label className="flex items-center gap-2 h-11 w-full md:w-72 px-3.5 rounded-xl border border-slate-300 bg-white focus-within:border-blue-600">
          <Search className="w-4 h-4 text-slate-500 shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Tìm công cụ"
            placeholder="Tìm công cụ…"
            className="flex-1 min-w-0 bg-transparent text-sm outline-none select-text"
          />
        </label>
      </AppHeader>

      <main className="max-w-[1120px] mx-auto px-4 md:px-8 py-6 md:py-8 flex flex-col gap-7">
        {!q && (
          <section className="rounded-3xl bg-blue-600 text-white px-6 md:px-10 py-6 flex flex-wrap items-center gap-6">
            <div className="flex-[1_1_320px] flex flex-col items-start gap-3.5">
              <h1 className="text-2xl md:text-4xl font-bold leading-tight">Hôm nay thầy/cô cần công cụ gì?</h1>
              <p className="text-sm md:text-base leading-relaxed">Chọn môn học, mở công cụ, sao chép hình sang Word hoặc PowerPoint.</p>
              <a href={subjectHref('toan')} className="h-12 px-5 rounded-2xl bg-[#fff] text-[#1d4ed8] text-sm font-bold flex items-center">
                Khám phá môn Toán
              </a>
            </div>
            <img src={heroArt} alt="" className="flex-[0_1_400px] min-w-0 w-full max-w-[400px] h-auto hidden sm:block" />
          </section>
        )}

        {!q && (
          <section className="flex flex-col gap-3.5">
            <h2 className="text-xl font-bold text-slate-900">Môn học</h2>
            <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(230px,1fr))]">
              {SUBJECTS.map((s) => (
                <SubjectCard key={s.id} subject={s} />
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-3" aria-live="polite">
          <h2 className="text-base font-semibold text-slate-900">{q ? 'Kết quả tìm kiếm' : 'Mở nhanh'}</h2>
          {results.length === 0 && <p className="text-sm text-slate-600">Chưa có công cụ phù hợp với “{query.trim()}”.</p>}
          <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
            {results.map((t) => (
              <a key={t.id} href={toolHref(t.id)} className="flex items-center gap-4 p-5 rounded-2xl bg-white border border-slate-200 hover:border-blue-400 transition-colors">
                <ToolThumb id={t.id} className="w-[72px] h-14 shrink-0 text-blue-600" />
                <span className="flex flex-col gap-1 min-w-0">
                  <strong className="text-base text-slate-900">{t.name}</strong>
                  <span className="text-[13px] text-slate-600">
                    {SUBJECTS.find((s) => s.id === t.subject)!.name} · {t.summary}
                  </span>
                </span>
              </a>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};
