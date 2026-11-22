import type { GeoElement, GlobalLabelStyle } from '../types/geometry';

export interface EdukitProjectData {
  appName: string;
  version: string;
  timestamp: number;
  date: string;
  elements: GeoElement[];
  globalLabelStyle?: GlobalLabelStyle;
  canvasSettings?: {
    showGrid: boolean;
    showAxes: boolean;
    snapToGrid: boolean;
    zoom: number;
  };
}

/**
 * Xuất và tải tệp phiên làm việc (.edukit) về máy tính
 */
export function exportProjectToFile(
  elements: GeoElement[],
  globalLabelStyle?: GlobalLabelStyle,
  canvasSettings?: {
    showGrid: boolean;
    showAxes: boolean;
    snapToGrid: boolean;
    zoom: number;
  },
  customFilename?: string
): void {
  const project: EdukitProjectData = {
    appName: 'EduKit Geometry',
    version: '2.0',
    timestamp: Date.now(),
    date: new Date().toLocaleString('vi-VN'),
    elements,
    globalLabelStyle,
    canvasSettings,
  };

  const jsonStr = JSON.stringify(project, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  a.download = customFilename || `hinh-hoc-toan-${dateStr}.edukit`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Đọc và giải mã tệp dự án (.edukit / .json) từ máy tính
 */
export function readProjectFromFile(file: File): Promise<EdukitProjectData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const data = JSON.parse(text) as EdukitProjectData;
        if (!data || !Array.isArray(data.elements)) {
          reject(new Error('Tệp không đúng định dạng dự án EduKit hợp lệ!'));
          return;
        }
        resolve(data);
      } catch (err: any) {
        reject(new Error('Lỗi khi đọc tệp dự án: ' + (err?.message || err)));
      }
    };
    reader.onerror = () => {
      reject(new Error('Không thể đọc tệp từ thiết bị!'));
    };
    reader.readAsText(file, 'utf-8');
  });
}

/**
 * Tự động sao lưu phiên làm việc hiện tại vào LocalStorage
 */
export function autoSaveProjectSession(
  elements: GeoElement[],
  globalLabelStyle?: GlobalLabelStyle,
  canvasSettings?: {
    showGrid: boolean;
    showAxes: boolean;
    snapToGrid: boolean;
    zoom: number;
  }
): void {
  try {
    const project: EdukitProjectData = {
      appName: 'EduKit Geometry',
      version: '2.0',
      timestamp: Date.now(),
      date: new Date().toLocaleString('vi-VN'),
      elements,
      globalLabelStyle,
      canvasSettings,
    };
    localStorage.setItem('edukit_auto_saved_session', JSON.stringify(project));
  } catch (e) {
    console.warn('Auto-save to localStorage failed:', e);
  }
}

/**
 * Khôi phục phiên làm việc đã tự động lưu gần nhất (nếu có)
 */
export function getAutoSavedProjectSession(): EdukitProjectData | null {
  try {
    const raw = localStorage.getItem('edukit_auto_saved_session');
    if (!raw) return null;
    const data = JSON.parse(raw) as EdukitProjectData;
    if (data && Array.isArray(data.elements)) {
      return data;
    }
  } catch (e) {
    console.warn('Failed to restore auto-saved session:', e);
  }
  return null;
}
