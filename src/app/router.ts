/**
 * Điều hướng bằng phần "#" của địa chỉ (chạy được trên GitHub Pages, không cần cấu hình máy chủ).
 *   #/                         Trang chủ
 *   #/toan                     Trang môn Toán
 *   #/toan/hinh-phang          Công cụ
 */
import { useSyncExternalStore } from 'react';
import { SUBJECTS, TOOLS, type SubjectId, type ToolId } from '../tools/registry';

export type Route =
  | { page: 'home' }
  | { page: 'subject'; subject: SubjectId }
  | { page: 'tool'; subject: SubjectId; tool: ToolId };

export function parseHash(hash: string): Route {
  const [subjectPart, toolPart] = hash.replace(/^#\/?/, '').split('/');
  const tool = TOOLS.find((t) => t.subject === subjectPart && t.id === toolPart);
  if (tool) return { page: 'tool', subject: tool.subject, tool: tool.id };
  // Môn chưa có công cụ nào thì chưa có trang riêng → về trang chủ
  const subject = SUBJECTS.find((s) => s.id === subjectPart && TOOLS.some((t) => t.subject === s.id));
  if (subject) return { page: 'subject', subject: subject.id };
  return { page: 'home' };
}

export const homeHref = '#/';
export const subjectHref = (subject: SubjectId) => `#/${subject}`;
export const toolHref = (id: ToolId) => {
  const tool = TOOLS.find((t) => t.id === id)!;
  return `#/${tool.subject}/${tool.id}`;
};

const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseHash(hash);
}
