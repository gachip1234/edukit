/** Tự xoay hình nhẹ nhàng quanh trục đứng ẩn */
import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { spinView, type View } from './scene';

/** Tốc độ xoay (độ mỗi giây): một vòng hết 24 giây */
export const SPIN_SPEED = 15;
/** Thời gian tăng tốc từ lúc đứng yên (giây) */
const RAMP = 0.8;

/** @param paused đang giữ chuột hoặc ngón tay trên bảng vẽ thì tạm đứng yên */
export function useAutoRotate(spinning: boolean, paused: RefObject<boolean>, setView: Dispatch<SetStateAction<View>>) {
  // Khi chuyển sang công cụ khác, effect được gỡ nên hình ẩn không tốn máy; quay lại thì xoay tiếp
  useEffect(() => {
    if (!spinning) return;
    let frame = 0;
    let last: number | null = null;
    let elapsed = 0;
    const tick = (now: number) => {
      // Chặn bước nhảy lớn khi trình duyệt vừa bị treo hoặc thẻ vừa được mở lại
      const dt = last === null ? 0 : Math.min(now - last, 100) / 1000;
      last = now;
      if (paused.current) {
        elapsed = 0;
      } else if (dt > 0) {
        elapsed += dt;
        const degrees = SPIN_SPEED * Math.min(1, elapsed / RAMP) * dt;
        setView((view) => spinView(view, degrees));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [spinning, paused, setView]);
}
