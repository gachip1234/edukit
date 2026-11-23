import type Konva from 'konva';
import type { GeoElement } from '../types/geometry';
import { getElementsBoundingBox } from './mathUtils';

export interface ExportResult {
  success: boolean;
  message: string;
  blob?: Blob;
  dataUrl?: string;
}

/**
 * Exports Konva Stage to Word-friendly PNG (white background, capped size) and writes directly to clipboard
 */
export async function copyStageToClipboard(
  stage: Konva.Stage,
  elements: GeoElement[],
  selectedIds: string[] = [],
  mode: 'all' | 'selection' = 'all',
  writeClipboard = true
): Promise<ExportResult> {
  try {
    const targetElements =
      mode === 'selection' && selectedIds.length > 0
        ? elements.filter((el) => selectedIds.includes(el.id))
        : elements;

    if (targetElements.length === 0) {
      return {
        success: false,
        message: mode === 'selection'
          ? 'Chưa chọn đối tượng nào để sao chép!'
          : 'Bản vẽ đang trống, không có đối tượng để sao chép!',
      };
    }

    const bbox = getElementsBoundingBox(targetElements, 24);
    if (!bbox) {
      return {
        success: false,
        message: 'Không tính được kích thước vùng xuất ảnh!',
      };
    }

    // Hide grid layer, transformer, selection highlights if any
    const gridLayer = stage.findOne('.grid-layer');
    const helperLayer = stage.findOne('.helper-layer');
    const transformer = stage.findOne('Transformer');

    const wasGridVisible = gridLayer ? gridLayer.visible() : true;
    const wasHelperVisible = helperLayer ? helperLayer.visible() : true;
    const wasTransformerVisible = transformer ? transformer.visible() : true;

    if (gridLayer) gridLayer.visible(false);
    if (helperLayer) helperLayer.visible(false);
    if (transformer) transformer.visible(false);

    // If exporting selection only, temporarily hide non-selected shapes
    const hiddenNodes: Konva.Node[] = [];
    if (mode === 'selection' && selectedIds.length > 0) {
      elements.forEach((el) => {
        if (!selectedIds.includes(el.id)) {
          const node = stage.findOne(`#${el.id}`);
          if (node && node.visible()) {
            node.visible(false);
            hiddenNodes.push(node);
          }
        }
      });
    }

    stage.batchDraw();

    // Word (Windows) chokes on very large clipboard bitmaps and renders the
    // alpha channel of Chrome's clipboard PNG as a black/garbled background.
    // So: cap the pixel size and flatten onto an opaque white background.
    const MAX_SIDE = 2400;
    const MAX_PIXELS = 4_000_000;
    let pixelRatio = 2;
    pixelRatio = Math.min(pixelRatio, MAX_SIDE / Math.max(bbox.width, bbox.height));
    pixelRatio = Math.min(pixelRatio, Math.sqrt(MAX_PIXELS / (bbox.width * bbox.height)));
    pixelRatio = Math.max(0.5, pixelRatio);

    let rawCanvas: HTMLCanvasElement;
    try {
      rawCanvas = stage.toCanvas({
        x: bbox.minX,
        y: bbox.minY,
        width: bbox.width,
        height: bbox.height,
        pixelRatio,
      });
    } finally {
      // Restore visibility
      if (gridLayer) gridLayer.visible(wasGridVisible);
      if (helperLayer) helperLayer.visible(wasHelperVisible);
      if (transformer) transformer.visible(wasTransformerVisible);
      hiddenNodes.forEach((node) => node.visible(true));
      stage.batchDraw();
    }

    const out = document.createElement('canvas');
    out.width = rawCanvas.width;
    out.height = rawCanvas.height;
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error('Không tạo được canvas');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(rawCanvas, 0, 0);

    const dataUrl = out.toDataURL('image/png');
    const blobPromise = new Promise<Blob>((resolve, reject) => {
      out.toBlob((b) => (b ? resolve(b) : reject(new Error('Không tạo được ảnh PNG'))), 'image/png');
    });

    const filename = `hinh-hoc-${Date.now()}.png`;
    const okMessage = mode === 'selection'
      ? 'Đã sao chép vùng chọn (PNG nền trắng) — mở Word và nhấn Ctrl+V để dán.'
      : 'Đã sao chép hình vẽ (PNG nền trắng) — mở Word và nhấn Ctrl+V để dán.';

    if (!writeClipboard) {
      return { success: true, message: 'Đã tạo ảnh PNG', blob: await blobPromise, dataUrl };
    }

    if (navigator.clipboard && typeof window.ClipboardItem !== 'undefined') {
      try {
        // Hand the Promise to ClipboardItem synchronously so Safari keeps the
        // user-gesture permission.
        const item = new ClipboardItem({ 'image/png': blobPromise });
        await navigator.clipboard.write([item]);
        return { success: true, message: okMessage, blob: await blobPromise, dataUrl };
      } catch (clipErr) {
        console.warn('Clipboard image write failed, falling back to download', clipErr);
      }
    }

    // Fallback: download image if clipboard write is blocked/unsupported
    downloadDataUrl(dataUrl, filename);
    return {
      success: true,
      message: 'Trình duyệt không cho chép ảnh trực tiếp — đã tải file PNG về, hãy chèn vào Word bằng Insert → Pictures.',
      blob: await blobPromise,
      dataUrl,
    };
  } catch (err: any) {
    console.error('Export error:', err);
    return {
      success: false,
      message: `Lỗi khi xuất ảnh: ${err.message || 'Không thể tạo ảnh'}`,
    };
  }
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
