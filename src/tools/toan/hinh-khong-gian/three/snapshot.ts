/** Ghép ảnh mô hình 3D với nhãn thành ảnh PNG nền trong suốt, cắt vừa khít nội dung. */
import { LABEL_FONT, type DrawStyle } from '../exportImage';
import type { Frame, View } from '../scene';
import type { Engine } from './engine';
import type { Label3 } from './model3d';

/** Khung nhỏ nhất chứa mọi điểm ảnh không trong suốt; null nếu ảnh trống */
export function contentBounds(data: Uint8ClampedArray, width: number, height: number) {
  let [left, top, right, bottom] = [width, height, -1, -1];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Bỏ qua rìa bóng đổ rất mờ
      if (data[(y * width + x) * 4 + 3] > 8) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = y;
      }
    }
  }
  return right < 0 ? null : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

export function snapshotPng(engine: Engine, view: View, frame: Frame, size: { width: number; height: number }, labels: Label3[], style: DrawStyle): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const ratio = Math.min(3, 2400 / Math.max(size.width, size.height));
    const full = document.createElement('canvas');
    full.width = Math.floor(size.width * ratio);
    full.height = Math.floor(size.height * ratio);
    const context = full.getContext('2d', { willReadFrequently: true });
    if (!context) return reject(new Error('Trình duyệt không hỗ trợ tạo ảnh'));
    // Phải chép ngay sau khi vẽ, trước khi trình duyệt xóa khung vẽ 3D
    engine.snapshot(view, frame, ratio, (canvas) => context.drawImage(canvas, 0, 0));
    context.scale(ratio, ratio);
    context.font = `italic bold ${style.fontSize}px ${LABEL_FONT}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (const label of labels) {
      context.fillStyle = label.color;
      context.fillText(label.text, label.x, label.y);
    }
    const bounds = contentBounds(context.getImageData(0, 0, full.width, full.height).data, full.width, full.height);
    if (!bounds) return reject(new Error('Không tạo được ảnh PNG'));
    const padding = Math.round(16 * ratio);
    const out = document.createElement('canvas');
    out.width = bounds.width + padding * 2;
    out.height = bounds.height + padding * 2;
    out.getContext('2d')!.drawImage(full, bounds.left, bounds.top, bounds.width, bounds.height, padding, padding, bounds.width, bounds.height);
    out.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Không tạo được ảnh PNG'))), 'image/png');
  });
}
