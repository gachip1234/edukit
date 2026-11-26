import React from 'react';
import { Shapes } from 'lucide-react';
import { homeHref, subjectHref } from './router';
import { SUBJECTS, TOOLS, type SubjectId } from '../tools/registry';

/** Thanh trên của trang chủ và trang môn học */
export const AppHeader: React.FC<{ current?: SubjectId; children?: React.ReactNode }> = ({ current, children }) => {
  const navClass = (active: boolean) =>
    `px-3.5 py-3 rounded-xl text-sm transition-colors ${active ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700 font-medium hover:bg-slate-100'}`;
  return (
    <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
      <a href={homeHref} className="flex items-center gap-2.5 min-h-11 text-lg font-bold text-slate-900">
        <span className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center">
          <Shapes className="w-5 h-5" />
        </span>
        EduKit
      </a>
      <nav aria-label="Điều hướng chính" className="flex flex-1 flex-wrap gap-1">
        <a href={homeHref} aria-current={current ? undefined : 'page'} className={navClass(!current)}>
          Trang chủ
        </a>
        {SUBJECTS.filter((s) => TOOLS.some((t) => t.subject === s.id)).map((s) => (
          <a key={s.id} href={subjectHref(s.id)} aria-current={current === s.id ? 'page' : undefined} className={navClass(current === s.id)}>
            {s.name}
          </a>
        ))}
      </nav>
      {children}
    </header>
  );
};
