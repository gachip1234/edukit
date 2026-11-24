import React, { useEffect, useState } from 'react';
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
  Sun,
  Moon,
  Monitor,
  Type,
  Save,
  FolderOpen,
  MoreHorizontal,
  Check,
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
  /** Chế độ giao diện hiện tại và hàm chuyển Sáng → Tối → Tự động */
  themePreference?: 'light' | 'dark' | 'system';
  onCycleTheme?: () => void;
  /** Giao diện đang hiển thị tối hay sáng (kể cả khi ở chế độ Tự động) */
  themeIsDark?: boolean;
}

const THEME_LABEL = {
  light: 'Sáng',
  dark: 'Tối',
  system: 'Tự động',
} as const;

/** Một dòng trong menu "Thêm" */
const MenuItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  checked?: boolean;
  disabled?: boolean;
}> = ({ icon, label, hint, onClick, checked, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
    aria-checked={checked}
    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition-colors ${
      disabled ? 'text-slate-300 cursor-not-allowed' : 'text-slate-700 hover:bg-slate-100 active:bg-slate-100'
    }`}
  >
    <span className="w-5 flex justify-center shrink-0">{icon}</span>
    <span className="flex-1 min-w-0 truncate">{label}</span>
    {hint && <span className="text-xs text-slate-400 shrink-0">{hint}</span>}
    {checked !== undefined && (
      <span
        className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
          checked ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300'
        }`}
      >
        {checked && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
      </span>
    )}
  </button>
);

const MenuSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="py-1">
    <div className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{title}</div>
    {children}
  </div>
);

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
  themePreference = 'system',
  onCycleTheme,
  themeIsDark = false,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  // Esc đóng menu
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  /** Bấm một mục rồi đóng menu (dùng cho các thao tác một lần như mở/lưu file, tải ảnh) */
  const run = (fn?: () => void) => () => {
    setMenuOpen(false);
    fn?.();
  };

  const themeIcon = themeIsDark ? (
    <Moon className="w-[18px] h-[18px] text-indigo-400" />
  ) : (
    <Sun className="w-[18px] h-[18px] text-amber-500" />
  );

  const zoomControls = (
    <div className="flex items-center gap-1 shrink-0 bg-slate-50 border border-slate-200 px-1.5 py-1 rounded-xl">
      <button onClick={onZoomOut} title="Thu nhỏ" aria-label="Thu nhỏ" className="p-1 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
        <ZoomOut className="w-4 h-4" />
      </button>
      <button onClick={onResetZoom} title="Đặt lại tỉ lệ 100%" className="min-w-11 text-xs font-semibold text-slate-700 px-1 hover:text-blue-600">
        {Math.round(zoom * 100)}%
      </button>
      <button onClick={onZoomIn} title="Phóng to" aria-label="Phóng to" className="p-1 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
        <ZoomIn className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <header className="relative h-12 md:h-16 short:h-12 bg-white/75 backdrop-blur-xl backdrop-saturate-150 border-b border-slate-200/80 px-2 md:px-4 flex items-center justify-between gap-2 z-40 shadow-xs select-none">
      {/* Logo & tên */}
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        <div className="w-8 h-8 md:w-10 md:h-10 short:w-8 short:h-8 shrink-0 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
          <Shapes className="w-4 h-4 md:w-5 md:h-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm md:text-base font-bold text-slate-800 leading-tight flex items-center gap-2 truncate">
            EduKit<span className="hidden sm:inline">Geometry</span>
            <span className="hidden md:inline short:hidden text-[10px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
              Toán Học
            </span>
          </h1>
          <p className="hidden md:block short:hidden text-[11px] text-slate-400 font-medium">
            Vẽ hình học & Xuất ảnh PNG cho Word, PowerPoint
          </p>
        </div>
      </div>

      {/* Các nút luôn hiện: thu phóng (màn hình rộng), sao chép ảnh, trợ lý AI, menu Thêm */}
      <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
        <div className="hidden lg:flex">{zoomControls}</div>

        <button
          onClick={onCopyAll}
          disabled={isExporting}
          title="Sao chép toàn bộ hình vẽ thành ảnh PNG nền trong suốt để dán trực tiếp (Ctrl+V) vào Word, PowerPoint"
          aria-label="Sao chép toàn bộ hình vẽ"
          className="flex items-center gap-2 px-2.5 md:px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-97 transition-all shadow-md shadow-blue-500/25"
        >
          <Copy className="w-4 h-4" />
          <span className="hidden md:inline short:hidden">Sao chép ảnh</span>
        </button>

        {onToggleChat && (
          <button
            onClick={onToggleChat}
            title="Bật/Tắt khung chat vẽ bằng tiếng Việt & Gemini AI"
            aria-label="Trợ lý AI"
            aria-pressed={isChatOpen}
            className={`flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
              isChatOpen
                ? 'bg-blue-50 text-blue-700 border-blue-300 shadow-xs ring-1 ring-blue-500/20'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Sparkles className="w-4 h-4 text-blue-600" />
            <span className="hidden sm:inline">Trợ lý AI</span>
          </button>
        )}

        <button
          onClick={() => setMenuOpen((o) => !o)}
          title="Thêm: lưới, trục tọa độ, nhãn, giao diện, mở/lưu file, xuất ảnh"
          aria-label="Thêm tùy chọn"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={`flex items-center gap-1.5 px-2 md:px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
            menuOpen ? 'bg-slate-100 border-slate-300 text-slate-900' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <MoreHorizontal className="w-4 h-4" />
          <span className="hidden md:inline short:hidden">Thêm</span>
        </button>
      </div>

      {/* Menu "Thêm" */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden="true" />
          <div
            role="menu"
            className="absolute right-2 md:right-4 top-full mt-2 z-50 w-[min(20rem,calc(100vw-1rem))] max-h-[calc(100dvh-4.5rem)] overflow-y-auto p-1.5 rounded-2xl bg-white border border-slate-200 shadow-xl divide-y divide-slate-100 animate-in fade-in slide-in-from-top-2 duration-150"
          >
            <MenuSection title="Hiển thị">
              <MenuItem icon={<Grid className="w-4 h-4 text-slate-500" />} label="Lưới ô vuông" checked={showGrid} onClick={onToggleGrid} />
              <MenuItem
                icon={<span className="text-xs font-serif font-bold italic text-slate-500">Oxy</span>}
                label="Trục tọa độ"
                checked={showAxes}
                onClick={onToggleAxes}
              />
              <MenuItem icon={<Magnet className="w-4 h-4 text-slate-500" />} label="Bắt điểm vào lưới" checked={snapToGrid} onClick={onToggleSnap} />
              {onOpenLabelSettings && (
                <MenuItem icon={<Type className="w-4 h-4 text-blue-600" />} label="Định dạng nhãn điểm" onClick={run(onOpenLabelSettings)} />
              )}
              {onCycleTheme && (
                <MenuItem
                  icon={themePreference === 'system' ? <Monitor className="w-4 h-4 text-slate-500" /> : themeIcon}
                  label="Giao diện"
                  hint={THEME_LABEL[themePreference]}
                  onClick={onCycleTheme}
                />
              )}
              {/* Thu phóng: trên màn hình rộng đã có sẵn ở thanh trên */}
              <div className="lg:hidden flex items-center gap-3 px-3 py-1.5">
                <span className="w-5 flex justify-center shrink-0">
                  <ZoomIn className="w-4 h-4 text-slate-500" />
                </span>
                <span className="flex-1 text-sm text-slate-700">Thu phóng</span>
                {zoomControls}
              </div>
            </MenuSection>

            <MenuSection title="Xuất ảnh">
              <MenuItem
                icon={<Scissors className="w-4 h-4 text-amber-600" />}
                label="Sao chép vùng chọn"
                hint={selectedCount > 0 ? `${selectedCount} đối tượng` : 'Chưa chọn'}
                disabled={selectedCount === 0 || isExporting}
                onClick={run(onCopySelection)}
              />
              <MenuItem icon={<Download className="w-4 h-4 text-slate-500" />} label="Tải ảnh PNG về máy" disabled={isExporting} onClick={run(onDownloadPng)} />
            </MenuSection>

            {(onOpenProject || onSaveProject) && (
              <MenuSection title="Tệp">
                {onOpenProject && (
                  <MenuItem icon={<FolderOpen className="w-4 h-4 text-blue-600" />} label="Mở file (.edukit)" onClick={run(onOpenProject)} />
                )}
                {onSaveProject && (
                  <MenuItem icon={<Save className="w-4 h-4 text-blue-600" />} label="Lưu file (.edukit)" onClick={run(onSaveProject)} />
                )}
              </MenuSection>
            )}
          </div>
        </>
      )}
    </header>
  );
};
