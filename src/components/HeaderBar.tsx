import React from 'react';
import {
  Grid,
  Magnet,
  Copy,
  Download,
  Scissors,
  Shapes,
  ZoomIn,
  ZoomOut,
  Sparkles,
  Type,
  Save,
  FolderOpen,
} from 'lucide-react';

interface HeaderBarProps {
  showGrid: boolean;
  onToggleGrid: () => void;
  showAxes: boolean;
  onToggleAxes: () => void;
  snapToGrid: boolean;
  onToggleSnap: () => void;
  onOpenLabelSettings?: () => void;
  onSaveProject?: () => void;
  onOpenProject?: () => void;
  selectedCount: number;
  onCopyAll: () => void;
  onCopySelection: () => void;
  onDownloadPng: () => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  isExporting?: boolean;
  isChatOpen?: boolean;
  onToggleChat?: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  showGrid,
  onToggleGrid,
  showAxes,
  onToggleAxes,
  snapToGrid,
  onToggleSnap,
  onOpenLabelSettings,
  onSaveProject,
  onOpenProject,
  selectedCount,
  onCopyAll,
  onCopySelection,
  onDownloadPng,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  isExporting = false,
  isChatOpen = false,
  onToggleChat,
}) => {
  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 flex items-center justify-between z-20 shadow-xs select-none">
      {/* Brand & Title */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
          <Shapes className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-base font-bold text-slate-800 leading-tight flex items-center gap-2">
            EduKit Geometry
            <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
              Toán Học
            </span>
          </h1>
          <p className="text-[11px] text-slate-400 font-medium">
            Vẽ hình học & Xuất ảnh PNG trong suốt cho PowerPoint
          </p>
        </div>
      </div>

      {/* Grid & Snap Controls */}
      <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
        <button
          onClick={onToggleGrid}
          title="Bật/Tắt lưới tọa độ"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            showGrid
              ? 'bg-white text-blue-600 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Grid className="w-3.5 h-3.5" />
          <span>Lưới ô vuông</span>
        </button>

        <button
          onClick={onToggleAxes}
          title="Bật/Tắt hệ trục tọa độ Oxy"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            showAxes
              ? 'bg-white text-blue-600 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span className="text-xs font-serif font-bold italic">Oxy</span>
          <span>Trục tọa độ</span>
        </button>

        <div className="w-px h-4 bg-slate-300 mx-0.5" />

        <button
          onClick={onToggleSnap}
          title="Tự động bắt điểm vào giao điểm lưới"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            snapToGrid
              ? 'bg-white text-emerald-600 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Magnet className="w-3.5 h-3.5" />
          <span>Bắt điểm</span>
        </button>

        {onOpenLabelSettings && (
          <>
            <div className="w-px h-4 bg-slate-300 mx-0.5" />
            <button
              onClick={onOpenLabelSettings}
              title="Định dạng tên nhãn đồng bộ toàn Canvas"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:text-blue-600 hover:bg-white transition-all shadow-xs"
            >
              <Type className="w-3.5 h-3.5 text-blue-600" />
              <span className="font-serif italic font-bold">Aa</span>
              <span>Định dạng nhãn</span>
            </button>
          </>
        )}
      </div>

      {/* Zoom controls */}
      <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-1.5 py-1 rounded-xl">
        <button
          onClick={onZoomOut}
          title="Thu nhỏ"
          className="p-1 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onResetZoom}
          title="Đặt lại tỉ lệ 100%"
          className="text-xs font-semibold text-slate-700 px-1 hover:text-blue-600"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={onZoomIn}
          title="Phóng to"
          className="p-1 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Save Project Session & Open Project File */}
      <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
        {onOpenProject && (
          <button
            onClick={onOpenProject}
            title="Mở phiên làm việc (.edukit / .json) đã lưu từ máy tính"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:text-blue-700 hover:bg-white transition-all shadow-xs"
          >
            <FolderOpen className="w-3.5 h-3.5 text-blue-600" />
            <span>Mở file</span>
          </button>
        )}

        {onSaveProject && (
          <button
            onClick={onSaveProject}
            title="Lưu toàn bộ phiên làm việc (.edukit) vào máy tính để tiện mở lại lần sau"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all shadow-xs"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Lưu file</span>
          </button>
        )}
      </div>

      {/* Export Actions: Copy All & Copy Selection */}
      <div className="flex items-center gap-2">
        {/* Copy Selection Button */}
        <button
          onClick={onCopySelection}
          disabled={selectedCount === 0 || isExporting}
          title="Sao chép các đối tượng đang chọn ra ảnh PNG trong suốt vào Clipboard"
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 border ${
            selectedCount > 0 && !isExporting
              ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 hover:border-amber-400 active:scale-97 shadow-xs'
              : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
          }`}
        >
          <Scissors className="w-3.5 h-3.5 text-amber-600" />
          <span>Sao chép vùng chọn</span>
          {selectedCount > 0 && (
            <span className="bg-amber-200 text-amber-900 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
              {selectedCount}
            </span>
          )}
        </button>

        {/* Copy All Button (Main action requested) */}
        <button
          onClick={onCopyAll}
          disabled={isExporting}
          title="Sao chép toàn bộ hình vẽ thành ảnh PNG nền trong suốt độ nét cao (300 DPI) để dán trực tiếp vào PowerPoint"
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-97 transition-all shadow-md shadow-blue-500/25"
        >
          <Copy className="w-4 h-4" />
          <span>Sao chép toàn bộ</span>
          <span className="text-[10px] bg-white/25 px-1.5 py-0.5 rounded font-normal">
            PPT
          </span>
        </button>

        {/* Download Button */}
        <button
          onClick={onDownloadPng}
          disabled={isExporting}
          title="Tải ảnh PNG nền trong suốt về máy"
          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors"
        >
          <Download className="w-4 h-4" />
        </button>

        {/* Toggle Chat AI Sidebar Button */}
        {onToggleChat && (
          <button
            onClick={onToggleChat}
            title="Bật/Tắt khung chat vẽ bằng tiếng Việt & Gemini AI"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
              isChatOpen
                ? 'bg-blue-50 text-blue-700 border-blue-300 shadow-xs ring-1 ring-blue-500/20'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden sm:inline">Trợ lý AI</span>
          </button>
        )}
      </div>
    </header>
  );
};
