/** Xuất hình không gian thành ảnh PNG nền trong suốt. */
import type { Scene } from './scene';

export interface DrawStyle {
  lineWidth: number;
  fontSize: number;
  showVertexDots: boolean;
}

export const INK = '#0f172a';
/** Mặt được tô nhẹ: trong suốt 90% */
export const FILL_OPACITY = 0.1;
export const LABEL_FONT = "'Times New Roman', Times, serif";
export const dashPattern = (lineWidth: number) => `${lineWidth * 3.5} ${lineWidth * 3}`;

/** Điểm có chấm tròn: điểm thêm vào, điểm được chọn màu, hoặc khi bật chấm tại các đỉnh */
export const hasDot = (d: { extra: boolean; color?: string }, style: DrawStyle) => d.extra || !!d.color || style.showVertexDots;

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Dựng SVG vừa khít nội dung. Hàm thuần, không đụng tới trang. */
export function sceneToSvg(scene: Scene, style: DrawStyle, padding = 16) {
  // Bỏ những thứ đang ẩn
  const shownFaces = scene.faces.filter((f) => f.color);
  const shownCurves = scene.curves.filter((c) => !c.off);
  const shownLines = scene.lines.filter((l) => !l.off);
  const shownDots = scene.dots.filter((d) => !d.off);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const l of shownLines) {
    xs.push(l.x1, l.x2);
    ys.push(l.y1, l.y2);
  }
  for (const shape of [...shownFaces, ...shownCurves]) {
    for (const p of shape.points) {
      xs.push(p.x);
      ys.push(p.y);
    }
  }
  for (const d of shownDots) {
    const halfWidth = (style.fontSize * 0.65 * Math.max(1, d.name.length)) / 2;
    xs.push(d.x, d.labelX - halfWidth, d.labelX + halfWidth);
    ys.push(d.y, d.labelY - style.fontSize * 0.7, d.labelY + style.fontSize * 0.7);
  }
  // Ẩn hết thì vẫn ra một ảnh trống hợp lệ
  if (xs.length === 0) {
    xs.push(0);
    ys.push(0);
  }
  const minX = Math.min(...xs) - padding;
  const minY = Math.min(...ys) - padding;
  const width = Math.max(...xs) + padding - minX;
  const height = Math.max(...ys) + padding - minY;

  const path = (points: { x: number; y: number }[]) => points.map((p) => `${p.x},${p.y}`).join(' ');
  const stroke = (color: string | undefined, hidden: boolean) =>
    `stroke="${color ?? INK}" stroke-width="${style.lineWidth}" stroke-linecap="round"${hidden ? ` stroke-dasharray="${dashPattern(style.lineWidth)}"` : ''}`;
  const faces = shownFaces.map((f) => `<polygon points="${path(f.points)}" fill="${f.color}" fill-opacity="${FILL_OPACITY}"/>`).join('');
  const curves = shownCurves.map((c) => `<polyline points="${path(c.points)}" fill="none" ${stroke(c.color, c.hidden)}/>`).join('');
  const lines = shownLines.map((l) => `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" ${stroke(l.color, l.hidden)}/>`).join('');
  const dots = shownDots
    .filter((d) => hasDot(d, style))
    .map((d) => `<circle cx="${d.x}" cy="${d.y}" r="${style.lineWidth * 1.6}" fill="${d.color ?? INK}"/>`)
    .join('');
  const labels = shownDots
    .map(
      (d) =>
        `<text x="${d.labelX}" y="${d.labelY}" text-anchor="middle" dominant-baseline="central" font-family="${LABEL_FONT}" font-size="${style.fontSize}" font-style="italic" font-weight="bold" fill="${d.color ?? INK}">${escapeXml(d.name)}</text>`,
    )
    .join('');

  const svg = (pixelRatio: number) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width * pixelRatio}" height="${height * pixelRatio}" viewBox="${minX} ${minY} ${width} ${height}">${faces}${curves}${lines}${dots}${labels}</svg>`;
  return { svg, width, height };
}

export function sceneToPng(scene: Scene, style: DrawStyle): Promise<Blob> {
  const { svg, width, height } = sceneToSvg(scene, style);
  // Giới hạn kích thước để Word dán được
  const ratio = Math.min(3, 2400 / Math.max(width, height));
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const context = canvas.getContext('2d');
      if (!context) return reject(new Error('Trình duyệt không hỗ trợ tạo ảnh'));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Không tạo được ảnh PNG'))), 'image/png');
    };
    image.onerror = () => reject(new Error('Không tạo được ảnh PNG'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg(ratio))}`;
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Chép ảnh vào bộ nhớ tạm; trình duyệt không cho phép thì tải file về */
export async function copyPng(png: Promise<Blob>): Promise<'copied' | 'downloaded'> {
  if (navigator.clipboard && typeof window.ClipboardItem !== 'undefined') {
    try {
      // Đưa Promise vào ClipboardItem ngay để Safari giữ quyền từ thao tác bấm
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      return 'copied';
    } catch (error) {
      console.warn('Không chép được ảnh, chuyển sang tải về', error);
    }
  }
  downloadBlob(await png, `hinh-khong-gian-${Date.now()}.png`);
  return 'downloaded';
}
