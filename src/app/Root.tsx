import React, { Activity, Suspense, lazy, useEffect, useState } from 'react';
import { useRoute } from './router';
import { HomePage } from './HomePage';
import { SubjectPage } from './SubjectPage';
import { SUBJECTS, TOOLS, type ToolId } from '../tools/registry';

/** Mã của mỗi công cụ chỉ được tải khi mở công cụ đó lần đầu */
const TOOL_COMPONENTS: Record<ToolId, React.LazyExoticComponent<React.ComponentType>> = {
  'hinh-phang': lazy(() => import('../App')),
  'hinh-khong-gian': lazy(() => import('../tools/toan/hinh-khong-gian/SolidApp')),
};

const Loading = () => (
  <div role="status" className="flex items-center justify-center text-sm font-medium text-slate-500" style={{ height: 'var(--app-h, 100%)' }}>
    Đang mở công cụ…
  </div>
);

export const Root: React.FC = () => {
  const route = useRoute();
  const activeTool = route.page === 'tool' ? route.tool : null;

  // Công cụ đã mở được giữ lại (ẩn đi) để chuyển qua lại không mất hình đang vẽ.
  // <Activity mode="hidden"> giữ nguyên trạng thái nhưng gỡ các effect → phím tắt của công cụ ẩn không hoạt động.
  const [opened, setOpened] = useState<ToolId[]>([]);
  if (activeTool && !opened.includes(activeTool)) setOpened([...opened, activeTool]);

  const title =
    route.page === 'tool'
      ? TOOLS.find((t) => t.id === route.tool)!.name
      : route.page === 'subject'
        ? SUBJECTS.find((s) => s.id === route.subject)!.name
        : 'Công cụ dạy học trực quan';
  useEffect(() => {
    document.title = `EduKit – ${title}`;
  }, [title]);

  return (
    <>
      {route.page === 'home' && <HomePage />}
      {route.page === 'subject' && <SubjectPage subjectId={route.subject} />}
      {opened.map((id) => {
        const Tool = TOOL_COMPONENTS[id];
        return (
          <Activity key={id} mode={id === activeTool ? 'visible' : 'hidden'}>
            <Suspense fallback={<Loading />}>
              <Tool />
            </Suspense>
          </Activity>
        );
      })}
    </>
  );
};
