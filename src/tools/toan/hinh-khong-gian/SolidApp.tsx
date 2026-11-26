/** Công cụ hình học không gian */
import React, { useEffect, useReducer, useRef, useState } from 'react';
import { CircleDot, Copy, Crosshair, Dot, Download, FolderOpen, House, Minus, Move3d, Pause, Play, Redo2, Rotate3d, Save, Target, Undo2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { toolHref, subjectHref } from '../../../app/router';
import { toolsOf, type ToolId } from '../../registry';
import {
  addBaseCenter,
  addCenterPoint,
  addPoint,
  addSegment,
  createDoc,
  historyReducer,
  initHistory,
  movePoint,
  removePoint,
  removeSegment,
  resolvePoints,
  type PointSpec,
  type SolidDoc,
} from './model';
import { SGK_VIEW, roundYaw, type Frame, type Scene, type View } from './scene';
import { useAutoRotate } from './useAutoRotate';
import { basePlanePoint, freePosition, pickFace, pickLine, pickOnObject, type ScreenPoint } from './picking';
import { EMPTY_PICK, applyPick, intersectHint, type IntersectMode, type IntersectPick, type PickInput } from './intersect';
import { copyScene, downloadBlob, sceneToPng, type DrawStyle } from './exportImage';
import { parseProject, serializeProject } from './projectFile';
import { SolidCanvas, type SolidTool } from './SolidCanvas';
import { SolidPanel } from './SolidPanel';

interface ToolInfo {
  id: SolidTool;
  label: string;
  hint: string;
  icon: React.ReactNode;
}

const ROTATE: ToolInfo = { id: 'rotate', label: 'Xoay', hint: 'Kéo để xoay hình, kéo chữ để dời nhãn, kéo điểm để dời điểm (Esc)', icon: <Rotate3d className="w-5 h-5" /> };
const SEGMENT: ToolInfo = { id: 'segment', label: 'Đoạn thẳng', hint: 'Bấm hai điểm để nối', icon: <Minus className="w-5 h-5" /> };
const POINT_TOOLS: ToolInfo[] = [
  { id: 'free', label: 'Điểm tự do', hint: 'Đặt điểm ở vị trí bất kỳ', icon: <Move3d className="w-5 h-5" /> },
  { id: 'on', label: 'Điểm trên đối tượng', hint: 'Điểm thuộc cạnh, đoạn thẳng hoặc mặt', icon: <CircleDot className="w-5 h-5" /> },
  { id: 'intersect', label: 'Giao điểm', hint: 'Đường cắt đường, đường cắt mặt phẳng', icon: <Crosshair className="w-5 h-5" /> },
  { id: 'midpoint', label: 'Trung điểm', hint: 'Bấm hai điểm để lấy trung điểm', icon: <Dot className="w-6 h-6" strokeWidth={4} /> },
];

const iconButton = 'h-11 min-w-11 px-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed';

export const SolidApp: React.FC = () => {
  const [history, dispatch] = useReducer(historyReducer, undefined, () => initHistory(createDoc('chop-tu-giac')));
  const { doc } = history;
  const [view, setView] = useState<View>(SGK_VIEW);
  const [zoom, setZoom] = useState(1);
  const [style, setStyle] = useState<DrawStyle>({ lineWidth: 2, fontSize: 22, showVertexDots: false });
  const [tool, setTool] = useState<SolidTool>('rotate');
  /** Các điểm đang chọn dở trong công cụ nối đoạn / trung điểm */
  const [picked, setPicked] = useState<string[]>([]);
  const [pointMenu, setPointMenu] = useState(false);
  const [freeOnBase, setFreeOnBase] = useState(false);
  const [intersectMode, setIntersectMode] = useState<IntersectMode>('line-line');
  const [intersectPick, setIntersectPick] = useState<IntersectPick>(EMPTY_PICK);
  const [toast, setToast] = useState<{ text: string; error?: boolean; id: number } | null>(null);
  const [spinning, setSpinning] = useState(false);
  /** Đang giữ chuột hoặc ngón tay trên bảng vẽ */
  const held = useRef(false);
  useAutoRotate(spinning, held, setView);
  const sceneRef = useRef<Scene | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const change = (update: (doc: SolidDoc) => SolidDoc, key?: string) => dispatch({ type: 'change', update, key, time: Date.now() });
  const notify = (text: string, error = false) => setToast({ text, error, id: Date.now() });
  const clearPicks = () => {
    setPicked([]);
    setIntersectPick(EMPTY_PICK);
  };
  const stopSpin = () => {
    setSpinning(false);
    setView(roundYaw);
  };
  const selectTool = (next: SolidTool) => {
    // Hình đứng yên thì mới bấm chọn điểm, cạnh được chính xác
    if (next !== 'rotate') stopSpin();
    setTool(next);
    setPointMenu(false);
    clearPicks();
  };
  const toggleSpin = () => {
    if (spinning) return stopSpin();
    selectTool('rotate');
    setSpinning(true);
  };
  const timeTravel = (type: 'undo' | 'redo') => {
    clearPicks();
    dispatch({ type });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(timer);
  }, [toast]);

  // Phím tắt (tự gỡ khi chuyển sang công cụ khác)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target instanceof HTMLInputElement && target.type !== 'range' && target.type !== 'checkbox') return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (key === 'z' || key === 'y')) {
        e.preventDefault();
        setPicked([]);
        setIntersectPick(EMPTY_PICK);
        dispatch({ type: key === 'y' || e.shiftKey ? 'redo' : 'undo' });
      } else if (key === 'escape') {
        setSpinning(false);
        setView(roundYaw);
        setTool('rotate');
        setPointMenu(false);
        setPicked([]);
        setIntersectPick(EMPTY_PICK);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const release = () => (held.current = false);
    const events = ['pointerup', 'pointercancel', 'blur'] as const;
    events.forEach((name) => window.addEventListener(name, release));
    return () => {
      release();
      events.forEach((name) => window.removeEventListener(name, release));
    };
  }, []);

  const intersect = (input: PickInput) => {
    const result = applyPick(doc, intersectMode, intersectPick, input);
    if (!result.done) {
      setIntersectPick(result.pick);
      if (result.message) notify(result.message, true);
      return;
    }
    if (result.doc !== doc) change(() => result.doc);
    notify(result.message, result.error);
    setIntersectPick(EMPTY_PICK);
  };

  const handlePick = (id: string) => {
    if (tool === 'intersect') return intersect({ point: id });
    const [first] = picked;
    if (first === undefined) return setPicked([id]);
    if (first === id) return setPicked([]);
    const update = (d: SolidDoc) => (tool === 'segment' ? addSegment(d, first, id) : addCenterPoint(d, [first, id]));
    if (update(doc) === doc) {
      notify(tool === 'segment' ? 'Đoạn này đã có trên hình' : 'Vị trí này đã có điểm', true);
    } else {
      change(update);
    }
    setPicked([]);
  };

  const createPoint = (spec: PointSpec) => {
    const result = addPoint(doc, spec);
    if (result.added) {
      change(() => result.doc);
      return;
    }
    const name = resolvePoints(doc).find((p) => p.id === result.id)?.name;
    notify(name ? `Chỗ này đã có điểm ${name}` : 'Không tạo được điểm ở đây', true);
  };

  /** Bấm vào hình (không trúng điểm có sẵn) */
  const handleClickAt = (target: ScreenPoint, frame: Frame) => {
    if (tool === 'free') {
      if (freeOnBase) {
        const spec = basePlanePoint(doc, view, frame, target);
        return spec ? createPoint(spec) : notify('Đang nhìn gần ngang mặt đáy — hãy xoay hình để nhìn rõ mặt đáy', true);
      }
      const at = freePosition(view, frame, target);
      if (at) createPoint({ type: 'free', of: [], at });
    } else if (tool === 'on') {
      const spec = pickOnObject(doc, view, frame, target);
      if (spec) createPoint(spec);
      else notify('Hãy bấm vào một cạnh, đoạn thẳng hoặc mặt của khối', true);
    } else if (tool === 'intersect') {
      if (intersectMode === 'line-plane' && intersectPick.first) {
        const face = pickFace(doc, view, frame, target);
        if (face) intersect({ face: face.ids });
      } else {
        const line = pickLine(doc, view, frame, target);
        if (line) intersect({ line: [line.from, line.to] });
      }
    }
  };

  const handleCopy = async () => {
    if (!sceneRef.current) return;
    try {
      const result = await copyScene(sceneRef.current, style);
      notify(
        result === 'copied'
          ? 'Đã sao chép hình (PNG trong suốt) — mở Word và nhấn Ctrl+V để dán.'
          : 'Trình duyệt không cho chép ảnh trực tiếp — đã tải file PNG về.',
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không tạo được ảnh', true);
    }
  };

  const handleDownload = async () => {
    if (!sceneRef.current) return;
    try {
      downloadBlob(await sceneToPng(sceneRef.current, style), `hinh-khong-gian-${Date.now()}.png`);
      notify('Đã tải ảnh PNG nền trong suốt về máy.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không tạo được ảnh', true);
    }
  };

  const handleSave = () => {
    downloadBlob(new Blob([serializeProject(doc, view)], { type: 'application/json' }), `hinh-khong-gian-${Date.now()}.edukit3d`);
    notify('Đã tải tệp .edukit3d về máy.');
  };

  const handleOpen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const project = parseProject(await file.text());
      change(() => project.doc);
      stopSpin();
      setView(project.view);
      clearPicks();
      notify(`Đã mở: ${file.name}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không mở được tệp', true);
    }
  };

  const activePointTool = POINT_TOOLS.find((t) => t.id === tool);
  const status =
    tool === 'free'
      ? 'Bấm vào hình để đặt điểm'
      : tool === 'on'
        ? 'Bấm vào cạnh, đoạn thẳng hoặc mặt'
        : tool === 'intersect'
          ? intersectHint(intersectMode, intersectPick)
          : picked.length > 0
            ? 'Chọn điểm thứ hai'
            : 'Chọn điểm thứ nhất';
  const statusOption = (active: boolean, label: string, onClick: () => void) => (
    <button type="button" aria-pressed={active} onClick={onClick} className={`h-8 px-3 rounded-full text-xs font-semibold ${active ? 'bg-white text-blue-700' : 'text-white hover:bg-blue-500'}`}>
      {label}
    </button>
  );

  const toolbarButton = (active: boolean) =>
    `shrink-0 flex flex-col items-center justify-center gap-1 flex-1 md:flex-none short:flex-none h-14 md:w-16 short:w-12 short:h-11 rounded-xl text-[10px] font-semibold leading-tight text-center transition-colors disabled:opacity-40 ${
      active ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
    }`;

  return (
    <div className="flex flex-col w-full overflow-hidden bg-white" style={{ height: 'var(--app-h, 100%)' }}>
      <header className="shrink-0 h-14 short:h-12 px-2 md:px-4 flex items-center gap-1.5 md:gap-2 border-b border-slate-200 bg-white">
        <a href={subjectHref('toan')} title="Về danh sách công cụ môn Toán" aria-label="Về danh sách công cụ môn Toán" className="w-10 h-10 short:w-8 short:h-8 shrink-0 rounded-xl bg-blue-600 text-white flex items-center justify-center">
          <House className="w-5 h-5" />
        </a>
        <a href={subjectHref('toan')} className="hidden md:inline text-sm text-blue-700 px-1">
          Toán học /
        </a>
        <select
          value="hinh-khong-gian"
          onChange={(e) => (window.location.hash = toolHref(e.target.value as ToolId))}
          aria-label="Chuyển công cụ"
          className="min-w-0 h-11 short:h-9 px-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-900"
        >
          {toolsOf('toan').map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <span className="flex-1" />
        <button type="button" onClick={() => fileRef.current?.click()} title="Mở file (.edukit3d)" aria-label="Mở file" className={iconButton}>
          <FolderOpen className="w-4 h-4" />
          <span className="hidden lg:inline">Mở</span>
        </button>
        <button type="button" onClick={handleSave} title="Lưu file (.edukit3d)" aria-label="Lưu file" className={iconButton}>
          <Save className="w-4 h-4" />
          <span className="hidden lg:inline">Lưu</span>
        </button>
        <button type="button" onClick={handleDownload} title="Tải ảnh PNG về máy" aria-label="Tải ảnh PNG" className={`${iconButton} hidden sm:flex`}>
          <Download className="w-4 h-4" />
        </button>
        <button type="button" onClick={handleCopy} title="Sao chép hình thành ảnh PNG nền trong suốt" aria-label="Sao chép ảnh" className="h-11 short:h-9 px-3 md:px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2">
          <Copy className="w-4 h-4" />
          <span className="hidden md:inline">Sao chép ảnh</span>
        </button>
      </header>

      <div className="flex-1 min-h-0 flex flex-col md:flex-row short:flex-row">
        <nav aria-label="Công cụ vẽ" className="order-3 md:order-1 short:order-1 shrink-0 flex md:flex-col short:flex-col items-center gap-1 p-1.5 md:w-20 short:w-15 overflow-auto no-scrollbar border-t md:border-t-0 md:border-r short:border-t-0 short:border-r border-slate-200 bg-white">
          <button type="button" onClick={() => selectTool('rotate')} title={ROTATE.hint} aria-pressed={tool === 'rotate'} className={toolbarButton(tool === 'rotate')}>
            {ROTATE.icon}
            <span className="short:hidden">{ROTATE.label}</span>
          </button>
          <button type="button" onClick={() => setPointMenu((open) => !open)} title="Tạo điểm" aria-label="Tạo điểm" aria-expanded={pointMenu} aria-pressed={!!activePointTool} className={toolbarButton(!!activePointTool)}>
            {activePointTool?.icon ?? <CircleDot className="w-5 h-5" />}
            <span className="short:hidden">Điểm ▾</span>
          </button>
          <button type="button" onClick={() => selectTool('segment')} title={SEGMENT.hint} aria-pressed={tool === 'segment'} className={toolbarButton(tool === 'segment')}>
            {SEGMENT.icon}
            <span className="short:hidden">{SEGMENT.label}</span>
          </button>
          <span className="hidden md:block flex-1" />
          <button type="button" onClick={() => timeTravel('undo')} disabled={history.past.length === 0} title="Hoàn tác (Ctrl+Z)" className={toolbarButton(false)}>
            <Undo2 className="w-5 h-5" />
            <span className="short:hidden">Hoàn tác</span>
          </button>
          <button type="button" onClick={() => timeTravel('redo')} disabled={history.future.length === 0} title="Làm lại (Ctrl+Y)" className={toolbarButton(false)}>
            <Redo2 className="w-5 h-5" />
            <span className="short:hidden">Làm lại</span>
          </button>
        </nav>

        {/* Bảng vẽ giữ nền sáng như tờ giấy ở cả chế độ tối */}
        <main className="order-1 md:order-2 short:order-2 flex-1 min-w-0 min-h-0 relative flex flex-col bg-[var(--paper)]">
          {/* Màn hình nhỏ: lời nhắc nằm hẳn phía trên bảng vẽ để không che điểm nào; màn hình lớn: nổi trên bảng vẽ */}
          {tool !== 'rotate' && (
            <div className="shrink-0 flex justify-center px-2 pt-2 md:absolute md:inset-x-2 md:top-3 md:z-10 md:p-0 short:static short:px-2 short:pt-1 md:pointer-events-none">
              <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 max-w-full p-1 rounded-2xl bg-blue-600 text-white shadow pointer-events-auto">
                <span role="status" className="px-2 py-1 text-xs font-semibold">
                  {status}
                </span>
                {tool === 'free' && (
                  <span className="flex gap-1" role="group" aria-label="Mặt phẳng đặt điểm">
                    {statusOption(!freeOnBase, 'Đối diện mắt nhìn', () => setFreeOnBase(false))}
                    {statusOption(freeOnBase, 'Trên mặt đáy', () => setFreeOnBase(true))}
                  </span>
                )}
                {tool === 'intersect' && (
                  <span className="flex gap-1" role="group" aria-label="Loại giao điểm">
                    {(['line-line', 'line-plane'] as const).map((mode) => (
                      <React.Fragment key={mode}>
                        {statusOption(intersectMode === mode, mode === 'line-line' ? 'Đường ∩ Đường' : 'Đường ∩ Mặt', () => {
                          setIntersectMode(mode);
                          setIntersectPick(EMPTY_PICK);
                        })}
                      </React.Fragment>
                    ))}
                  </span>
                )}
                <button type="button" onClick={() => selectTool('rotate')} aria-label="Xong, trở về xoay hình" title="Xong (Esc)" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-blue-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          <div className="relative flex-1 min-h-0" onPointerDownCapture={() => (held.current = true)}>
            <SolidCanvas
              doc={doc}
              view={view}
              zoom={zoom}
              style={style}
              tool={tool}
              picked={tool === 'intersect' ? intersectPick.points : picked}
              onPick={handlePick}
              chosenLine={intersectPick.first}
              wantsPlane={intersectMode === 'line-plane' && intersectPick.first !== null}
              onClickAt={handleClickAt}
              onDragPoint={(id, next) => change((d) => movePoint(d, id, next), `point-${id}`)}
              onViewChange={setView}
              onZoom={(factor) => setZoom((z) => Math.min(2.5, Math.max(0.4, z * factor)))}
              onMoveLabel={(id, dx, dy) =>
                change((d) => {
                  const old = d.labelOffsets[id] ?? { x: 0, y: 0 };
                  return { ...d, labelOffsets: { ...d.labelOffsets, [id]: { x: old.x + dx, y: old.y + dy } } };
                }, `label-${id}`)
              }
              sceneRef={sceneRef}
            />
            <button
              type="button"
              onClick={toggleSpin}
              title={spinning ? 'Dừng xoay (Esc)' : 'Tự xoay nhẹ quanh trục đứng qua tâm hình'}
              className={`absolute left-3 top-3 md:top-auto md:bottom-3 short:top-auto short:bottom-3 h-11.5 px-3.5 rounded-xl border shadow-sm flex items-center gap-2 text-xs font-semibold ${
                spinning ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {spinning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {spinning ? 'Dừng xoay' : 'Tự xoay'}
            </button>
            <div className="absolute right-3 top-3 md:top-auto md:bottom-3 short:top-auto short:bottom-3 flex items-center gap-1 p-1 rounded-xl bg-white border border-slate-200 shadow-sm">
              <button type="button" onClick={() => setZoom((z) => Math.max(0.4, z / 1.15))} aria-label="Thu nhỏ" className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100">
                <ZoomOut className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => setZoom(1)} title="Đặt lại tỉ lệ 100%" className="min-w-12 text-xs font-semibold text-slate-700">
                {Math.round(zoom * 100)}%
              </button>
              <button type="button" onClick={() => setZoom((z) => Math.min(2.5, z * 1.15))} aria-label="Phóng to" className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100">
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
          </div>
          {pointMenu && (
            <>
              <div className="absolute inset-0 z-10" onClick={() => setPointMenu(false)} aria-hidden="true" />
              <div role="menu" aria-label="Tạo điểm" className="absolute z-20 left-2 right-2 bottom-2 md:right-auto md:bottom-auto md:top-2 md:w-72 short:right-auto short:bottom-auto short:top-2 short:w-72 max-h-[calc(100%-1rem)] overflow-y-auto p-1.5 rounded-2xl bg-white border border-slate-200 shadow-xl">
                {POINT_TOOLS.map((t) => (
                  <button key={t.id} type="button" role="menuitem" onClick={() => selectTool(t.id)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left ${tool === t.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                    <span className="w-9 h-9 shrink-0 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">{t.icon}</span>
                    <span className="flex flex-col">
                      <span className="text-[13px] font-bold text-slate-900">{t.label}</span>
                      <span className="text-xs text-slate-500">{t.hint}</span>
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  role="menuitem"
                  disabled={addBaseCenter(doc) === doc}
                  onClick={() => {
                    selectTool('rotate');
                    change(addBaseCenter);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-slate-50 disabled:opacity-40"
                >
                  <span className="w-9 h-9 shrink-0 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                    <Target className="w-5 h-5" />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[13px] font-bold text-slate-900">Tâm đáy</span>
                    <span className="text-xs text-slate-500">Thêm tâm của mặt đáy</span>
                  </span>
                </button>
              </div>
            </>
          )}
        </main>

        <aside aria-label="Thuộc tính" className="order-2 md:order-3 short:order-3 shrink-0 max-h-[38%] md:max-h-none short:max-h-none md:w-76 short:w-60 overflow-y-auto border-t md:border-t-0 md:border-l short:border-t-0 short:border-l border-slate-200 bg-white">
          <SolidPanel
            doc={doc}
            view={view}
            style={style}
            onSolid={(kind) => {
              if (kind === doc.kind) return;
              change(() => createDoc(kind));
              clearPicks();
            }}
            onDim={(key, value) => change((d) => ({ ...d, dims: { ...d.dims, [key]: value } }), `dim-${key}`)}
            onRename={(id, name) =>
              change(
                (d) =>
                  d.points.some((p) => p.id === id)
                    ? { ...d, points: d.points.map((p) => (p.id === id ? { ...p, name } : p)) }
                    : { ...d, names: { ...d.names, [id]: name } },
                `name-${id}`,
              )
            }
            onMovePoint={(id, next) => change((d) => movePoint(d, id, next), `point-${id}`)}
            onRemovePoint={(id) => {
              clearPicks();
              change((d) => removePoint(d, id));
            }}
            onRemoveSegment={(id) => change((d) => removeSegment(d, id))}
            onResetLabels={() => change((d) => ({ ...d, labelOffsets: {} }))}
            onViewChange={(next) => {
              setSpinning(false);
              setView(roundYaw(next));
            }}
            onStyleChange={setStyle}
          />
        </aside>
      </div>

      <input ref={fileRef} type="file" accept=".edukit3d" onChange={handleOpen} className="hidden" />

      {toast && (
        <div role="status" className={`fixed left-3 right-3 md:left-auto md:right-80 bottom-20 md:bottom-4 z-50 px-4 py-3 rounded-2xl border shadow-xl bg-white text-xs font-semibold ${toast.error ? 'border-rose-300 text-rose-700' : 'border-slate-200 text-slate-800'}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
};

export default SolidApp;
