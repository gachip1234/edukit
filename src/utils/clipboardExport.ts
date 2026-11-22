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
 * Exports Konva Stage to high-res transparent PNG and writes directly to clipboard
 */
export async function copyStageToClipboard(
  stage: Konva.Stage,
  elements: GeoElement[],
  selectedIds: string[] = [],
  mode: 'all' | 'selection' = 'all'
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

    // High resolution pixelRatio (3 = 300dpi crisp quality for 4K / PowerPoint)
    const pixelRatio = 3;

    // Crop precisely to target bounding box
    const cropConfig = {
      x: bbox.minX,
      y: bbox.minY,
      width: bbox.width,
      height: bbox.height,
      pixelRatio,
      mimeType: 'image/png',
    };

    const dataUrl = stage.toDataURL(cropConfig);

    // Restore visibility
    if (gridLayer) gridLayer.visible(wasGridVisible);
    if (helperLayer) helperLayer.visible(wasHelperVisible);
    if (transformer) transformer.visible(wasTransformerVisible);
    hiddenNodes.forEach((node) => node.visible(true));
    stage.batchDraw();

    // Convert dataUrl to Blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    // Check Clipboard API support
    if (navigator.clipboard && window.ClipboardItem) {
      const item = new ClipboardItem({ 'image/png': blob });
      await navigator.clipboard.write([item]);
      return {
        success: true,
        message: mode === 'selection'
          ? 'Đã sao chép vùng chọn (PNG trong suốt HD) vào Clipboard!'
          : 'Đã sao chép toàn bộ hình vẽ (PNG trong suốt HD) vào Clipboard!',
        blob,
        dataUrl,
      };
    } else {
      // Fallback: download image if clipboard write is blocked
      downloadDataUrl(dataUrl, `hinh-hoc-${Date.now()}.png`);
      return {
        success: true,
        message: 'Trình duyệt không hỗ trợ chép ảnh trực tiếp, đã tự động tải về file PNG!',
        blob,
        dataUrl,
      };
    }
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
