import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'edukit_theme';
const ORDER: ThemePreference[] = ['light', 'dark', 'system'];

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* localStorage có thể bị chặn */
  }
  return 'system';
}

/**
 * Chế độ Sáng / Tối / Tự động (theo hệ thống). Lưu lựa chọn vào localStorage,
 * gắn class "dark" lên <html>, và chuyển mượt bằng View Transitions API nếu trình duyệt hỗ trợ.
 */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = preference === 'dark' || (preference === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      setIsDark(dark);
    };
    apply();
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      /* bỏ qua */
    }
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [preference]);

  const cycleTheme = useCallback(() => {
    const next = ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length];
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (doc.startViewTransition && !reduceMotion) {
      doc.startViewTransition(() => flushSync(() => setPreference(next)));
    } else {
      setPreference(next);
    }
  }, [preference]);

  return { preference, isDark, cycleTheme };
}
