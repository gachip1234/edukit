import React from 'react';
import { AppHeader } from './AppHeader';
import { ToolThumb } from './ToolThumb';
import { homeHref, toolHref } from './router';
import { SUBJECTS, toolsOf, type SubjectId } from '../tools/registry';

export const SubjectPage: React.FC<{ subjectId: SubjectId }> = ({ subjectId }) => {
  const subject = SUBJECTS.find((s) => s.id === subjectId)!;
  return (
    <div className="overflow-y-auto bg-slate-50" style={{ height: 'var(--app-h, 100%)' }}>
      <AppHeader current={subjectId} />
      <main className="max-w-[1120px] mx-auto px-4 md:px-8 py-6 md:py-8 flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <div className="text-[13px] text-slate-600">
            <a href={homeHref} className="text-blue-700 hover:underline">Trang chủ</a> / {subject.name}
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Công cụ môn {subject.name}</h1>
        </div>

        <div className="grid gap-5 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
          {toolsOf(subjectId).map((t) => (
            <article key={t.id} className="bg-white border border-slate-200 rounded-3xl p-5 flex flex-col gap-3.5">
              <div className={`h-44 rounded-xl flex items-center justify-center ${subject.badge}`}>
                <ToolThumb id={t.id} className="w-56 h-36" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
                {t.name}
                {t.isNew && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">Mới</span>}
              </h2>
              <p className="flex-1 text-sm leading-relaxed text-slate-600">{t.description}</p>
              <a href={toolHref(t.id)} className="h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center justify-center">
                Mở công cụ
              </a>
            </article>
          ))}
        </div>

        {subject.planned.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-slate-900">Dự kiến bổ sung</h2>
            <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
              {subject.planned.map((name) => (
                <div key={name} className="p-4 rounded-2xl border border-dashed border-slate-400 bg-white text-sm font-semibold text-slate-700">
                  {name}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};
