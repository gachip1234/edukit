import React, { useState, useEffect, useRef, useCallback } from "react";
import type Konva from "konva";
import type {
  GeoElement,
  ToolType,
  LatexElement,
  PointElement,
  PolygonElement,
  GlobalLabelStyle,
} from "./types/geometry";
import { Toolbar, MobileToolbar } from "./components/Toolbar";
import { HeaderBar } from "./components/HeaderBar";
import { CanvasArea } from "./components/CanvasArea";
import { FloatingPropertyBar } from "./components/FloatingPropertyBar";
import { LatexDialog } from "./components/LatexDialog";
import { PresetsModal } from "./components/PresetsModal";
import { LabelSettingsModal } from "./components/LabelSettingsModal";
import { CommandInputBar } from "./components/CommandInputBar";
import { RightChatSidebar } from "./components/RightChatSidebar";
import type { AgentInteractionLevel } from "./components/RightChatSidebar";
import {
  exportProjectToFile,
  readProjectFromFile,
} from "./utils/projectFileManager";
import { copyStageToClipboard, downloadDataUrl } from "./utils/clipboardExport";
import { parseAndExecuteCommand } from "./utils/commandParser";
import { parseVietnameseGeometry, isSimpleSingleObjectCommand } from "./utils/nlpGeometryParser";
import { solveClassicGeometry } from "./utils/geometrySolver";
import { callGeminiGeometryAi, getCachedModel } from "./utils/geminiAiService";
import { canvasToFigureSpec } from "./utils/figureContext";
import { getCanvasOrigin } from "./utils/coordinateSystem";
import { useTheme } from "./utils/useTheme";
import {
  insertPointIntoPolygon,
  isPointNearPolygonEdge,
  moveElements,
} from "./utils/mathUtils";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";

export const App: React.FC = () => {
  // Giao diện Sáng / Tối / Tự động
  const { preference: themePreference, isDark: themeIsDark, cycleTheme } = useTheme();

  // Elements & History state
  // Mỗi lần mở/tải lại trang, canvas luôn bắt đầu trống
  // (muốn giữ hình thì dùng "Lưu file" / "Mở file")
  const [elements, setElements] = useState<GeoElement[]>([]);
  const [history, setHistory] = useState<GeoElement[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Active Tool & Selection
  const [currentTool, setCurrentTool] = useState<ToolType>("select");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionPos, setSelectionPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Grid, Axes & Snapping settings
  const [showGrid, setShowGrid] = useState(true);
  // Trục tọa độ ẩn khi mở trang; bật lại bằng nút "Trục tọa độ" trên thanh công cụ
  const [showAxes, setShowAxes] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [zoom, setZoom] = useState(1);

  // Modals & Dialogs
  const [latexDialogOpen, setLatexDialogOpen] = useState(false);
  const [latexPos, setLatexPos] = useState<{ x: number; y: number }>({
    x: 400,
    y: 300,
  });
  const [editingLatexElement, setEditingLatexElement] =
    useState<LatexElement | null>(null);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  // Trên điện thoại / máy tính bảng khung chat che phần lớn chỗ vẽ → mặc định đóng, mở bằng nút ✦ "Trợ lý AI"
  const [isChatOpen, setIsChatOpen] = useState(() => window.innerWidth >= 1024 && window.innerHeight >= 500);
  const [labelSettingsOpen, setLabelSettingsOpen] = useState(false);

  // Global Point Label Style
  const [globalLabelStyle, setGlobalLabelStyle] = useState<GlobalLabelStyle>({
    fontSize: 15,
    color: "#0f172a",
    fontFamily: "serif",
    fontStyle: "italic bold",
  });

  const handleSaveGlobalLabelStyle = (
    newStyle: GlobalLabelStyle,
    applyToAll: boolean,
  ) => {
    setGlobalLabelStyle(newStyle);
    if (applyToAll) {
      const updated = elements.map((item) => {
        if (item.type === "point") {
          return {
            ...item,
            labelFontSize: newStyle.fontSize,
            labelColor: newStyle.color,
            labelFontFamily: newStyle.fontFamily,
            labelFontStyle: newStyle.fontStyle,
          };
        }
        return item;
      });
      updateElementsWithHistory(updated);
      showToast("Đã đồng bộ định dạng nhãn toàn Canvas!");
    } else {
      showToast("Đã lưu định dạng nhãn mặc định!");
    }
  };

  // Command feedback
  const [lastCommandMessage, setLastCommandMessage] = useState<{
    text: string;
    isError?: boolean;
  } | null>(null);

  // Toast feedback
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const stageRef = useRef<Konva.Stage | null>(null);
  const elementsRef = useRef(elements);
  elementsRef.current = elements;
  const isArrowRepeatingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Các yêu cầu chat Gemini đã vẽ ra hình hiện tại (để AI vẽ tiếp đúng ngữ cảnh). Xóa khi bắt đầu hình mới.
  const chatHistoryRef = useRef<string[]>([]);


  // Save project (.edukit) to computer
  const handleSaveProject = () => {
    exportProjectToFile(elements, globalLabelStyle);
    showToast("Đã tải tệp phiên làm việc (.edukit) về máy tính!", "success");
  };

  // Trigger open project file dialog
  const handleOpenProject = () => {
    fileInputRef.current?.click();
  };

  // Handle uploaded project file (.edukit or .json)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await readProjectFromFile(file);
      updateElementsWithHistory(data.elements);
      chatHistoryRef.current = [];
      if (data.globalLabelStyle) {
        setGlobalLabelStyle(data.globalLabelStyle);
      }
      setSelectedIds([]);
      showToast(`Đã mở thành công: ${file.name} (${data.elements.length} đối tượng)`, "success");
    } catch (err: any) {
      console.error("Open project error:", err);
      showToast(`Lỗi mở tệp: ${err?.message || "Định dạng không hợp lệ"}`, "error");
    } finally {
      e.target.value = "";
    }
  };

  const showToast = (
    message: string,
    type: "success" | "error" | "info" = "success",
  ) => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3800);
  };

  // Push state to history
  const updateElementsWithHistory = useCallback(
    (newElements: GeoElement[]) => {
      setElements(newElements);
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newElements);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    },
    [history, historyIndex],
  );

  // Undo / Redo
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const nextIndex = historyIndex - 1;
      setHistoryIndex(nextIndex);
      setElements(history[nextIndex]);
      setSelectedIds([]);
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setElements(history[nextIndex]);
      setSelectedIds([]);
    }
  }, [history, historyIndex]);

  // Clear canvas
  const handleClear = useCallback(() => {
    if (elements.length === 0) return;
    if (window.confirm("Bạn có chắc chắn muốn xóa toàn bộ bản vẽ không?")) {
      updateElementsWithHistory([]);
      setSelectedIds([]);
      chatHistoryRef.current = [];
      showToast("Đã xóa trắng bản vẽ", "info");
    }
  }, [elements, updateElementsWithHistory]);

  // Selected element for property editing
  const selectedElement =
    selectedIds.length === 1
      ? elements.find(
          (el) =>
            el.id === selectedIds[0] ||
            "label-" + el.id === selectedIds[0]
        ) || null
      : null;

  // Update selected element property
  const handleUpdateElement = (updated: Partial<GeoElement>) => {
    if (selectedIds.length === 0) return;

    // Khi người dùng chọn Đặc tính 2 (Khóa) cho 1 điểm:
    if (updated.constraintMode === "control") {
      const selectedPt = elements.find(
        (el): el is PointElement =>
          el.type === "point" && selectedIds.includes(el.id),
      );

      if (selectedPt) {
        // Tìm đa giác mà điểm này nằm trên cạnh
        const poly = elements.find(
          (el): el is PolygonElement =>
            el.type === "polygon" &&
            (el.id === selectedPt.attachedTo?.elementId ||
              isPointNearPolygonEdge(selectedPt, el, 25)),
        );

        if (poly) {
          const insertRes = insertPointIntoPolygon(poly, selectedPt);
          if (insertRes) {
            const newElements = elements.map((el) => {
              if (el.id === poly.id) {
                return insertRes.newPoly;
              }
              if (el.id === selectedPt.id) {
                return {
                  ...el,
                  ...updated,
                  x: insertRes.projected.x,
                  y: insertRes.projected.y,
                  groupId: poly.groupId,
                  attachedTo: {
                    elementId: poly.id,
                    type: "polygon" as const,
                    edgeIndex: insertRes.insertedEdgeIndex,
                  },
                } as GeoElement;
              }
              // Các điểm khác trên hình TUYỆT ĐỐI KHÔNG BỊ THAY ĐỔI ĐẶC TÍNH
              return el;
            });
            updateElementsWithHistory(newElements);
            showToast(
              "Đã khóa điểm thành đỉnh mới của đa giác (tứ giác 4 đỉnh)",
            );
            return;
          }
        }
      }
    }

    const newElements = elements.map((el) => {
      if (selectedIds.includes(el.id)) {
        if (el.type === "latex" && updated.stroke) {
          // Keep text color aligned with stroke
          return { ...el, ...updated, color: updated.stroke } as GeoElement;
        }
        return { ...el, ...updated } as GeoElement;
      }
      return el;
    });
    updateElementsWithHistory(newElements);
  };

  // Delete selected elements
  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const newElements = elements
      .map((el) => {
        if (selectedIds.includes("label-" + el.id)) {
          return { ...el, label: "" };
        }
        return el;
      })
      .filter((el) => !selectedIds.includes(el.id));
    updateElementsWithHistory(newElements);
    setSelectedIds([]);
    showToast(`Đã xóa ${selectedIds.length} đối tượng`);
  }, [elements, selectedIds, updateElementsWithHistory]);

  // Duplicate selected element
  const handleDuplicate = useCallback(() => {
    if (selectedIds.length === 0) return;
    const targets = elements.filter((el) => selectedIds.includes(el.id));
    const groupMap = new Map<string, string>();

    const newItems: GeoElement[] = targets.map((el) => {
      const copy = JSON.parse(JSON.stringify(el));
      copy.id = `${el.type}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

      // Generate a new groupId for the duplicated group if applicable
      if (copy.groupId) {
        if (!groupMap.has(copy.groupId)) {
          groupMap.set(
            copy.groupId,
            `group-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          );
        }
        copy.groupId = groupMap.get(copy.groupId);
      }

      // Shift slightly
      if (copy.type === "point" || copy.type === "latex") {
        copy.x += 25;
        copy.y += 25;
      } else if (copy.type === "segment" || copy.type === "line") {
        copy.x1 += 25;
        copy.y1 += 25;
        copy.x2 += 25;
        copy.y2 += 25;
      } else if (copy.type === "circle") {
        copy.cx += 25;
        copy.cy += 25;
      } else if (copy.type === "polygon") {
        copy.points = copy.points.map((p: number) => p + 25);
      } else if (copy.type === "right_angle" || copy.type === "angle") {
        copy.vx += 25;
        copy.vy += 25;
        copy.p1x += 25;
        copy.p1y += 25;
        copy.p2x += 25;
        copy.p2y += 25;
      }
      return copy;
    });

    const newElements = [...elements, ...newItems];
    updateElementsWithHistory(newElements);
    setSelectedIds(newItems.map((item) => item.id));
    showToast(`Đã nhân bản ${newItems.length} đối tượng`);
  }, [elements, selectedIds, updateElementsWithHistory]);

  // Bring to front / Send to back
  const handleBringToFront = () => {
    if (selectedIds.length === 0) return;
    const nonSelected = elements.filter((el) => !selectedIds.includes(el.id));
    const selected = elements.filter((el) => selectedIds.includes(el.id));
    updateElementsWithHistory([...nonSelected, ...selected]);
  };

  const handleSendToBack = () => {
    if (selectedIds.length === 0) return;
    const nonSelected = elements.filter((el) => !selectedIds.includes(el.id));
    const selected = elements.filter((el) => selectedIds.includes(el.id));
    updateElementsWithHistory([...selected, ...nonSelected]);
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing inside an input/textarea
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      // Delete / Backspace
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.length > 0) {
          e.preventDefault();
          handleDeleteSelected();
        }
      }

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      }

      // Arrow keys movement for selected objects (Up, Down, Left, Right)
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) &&
        selectedIds.length > 0
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 2;
        let dx = 0;
        let dy = 0;
        if (e.key === "ArrowUp") dy = -step;
        if (e.key === "ArrowDown") dy = step;
        if (e.key === "ArrowLeft") dx = -step;
        if (e.key === "ArrowRight") dx = step;

        const updated = moveElements(elementsRef.current, selectedIds, dx, dy);
        if (!e.repeat) {
          updateElementsWithHistory(updated);
        } else {
          isArrowRepeatingRef.current = true;
          setElements(updated);
        }
        return;
      }

      // Tool shortcuts
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case "v":
            setCurrentTool("select");
            break;
          case "p":
            setCurrentTool("point");
            break;
          case "s":
            setCurrentTool("segment");
            break;
          case "l":
            setCurrentTool("line");
            break;
          case "r":
            setCurrentTool("ray");
            break;
          case "c":
            setCurrentTool("circle");
            break;
          case "g":
            setCurrentTool("polygon");
            break;
          case "a":
            setCurrentTool("angle");
            break;
          case "t":
            setCurrentTool("latex");
            break;
          case "escape":
            setSelectedIds([]);
            setCurrentTool("select");
            break;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) &&
        isArrowRepeatingRef.current
      ) {
        isArrowRepeatingRef.current = false;
        updateElementsWithHistory(elementsRef.current);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [selectedIds, handleDeleteSelected, handleUndo, handleRedo, updateElementsWithHistory]);

  // Open LaTeX Dialog
  const handleOpenLatex = (pos: { x: number; y: number }) => {
    setEditingLatexElement(null);
    setLatexPos(pos);
    setLatexDialogOpen(true);
  };

  const handleEditLatex = () => {
    if (selectedElement && selectedElement.type === "latex") {
      setEditingLatexElement(selectedElement);
      setLatexDialogOpen(true);
    }
  };

  const handleEditLatexElement = (el: LatexElement) => {
    setSelectedIds([el.id]);
    setEditingLatexElement(el);
    setLatexDialogOpen(true);
  };

  const handleSaveLatex = (latex: string, fontSize: number, color: string) => {
    if (editingLatexElement) {
      // Update existing
      handleUpdateElement({ latex, fontSize, color, stroke: color });
      showToast("Đã cập nhật công thức LaTeX");
    } else {
      // Insert new
      const newLatexEl: LatexElement = {
        id: `latex-${Date.now()}`,
        type: "latex",
        x: latexPos.x,
        y: latexPos.y,
        latex,
        fontSize,
        color,
        stroke: color,
        strokeWidth: 1,
        strokeStyle: "solid",
      };
      updateElementsWithHistory([...elements, newLatexEl]);
      setSelectedIds([newLatexEl.id]);
      showToast("Đã thêm công thức LaTeX vào bản vẽ");
    }
    setLatexDialogOpen(false);
    setCurrentTool("select");
  };

  // Coordinate Command Execution
  const handleExecuteCommand = (cmd: string) => {
    const stage = stageRef.current;
    const width = stage ? stage.width() : window.innerWidth;
    const height = stage ? stage.height() : window.innerHeight;

    const result = parseAndExecuteCommand(cmd, elements, width, height);
    if (result.success && result.newElements) {
      updateElementsWithHistory(result.newElements);
      if (result.selectedId) {
        setSelectedIds([result.selectedId]);
        setCurrentTool("select");
      }
      setLastCommandMessage({ text: result.message, isError: false });
      showToast(result.message, "success");
      if (!showAxes) {
        setShowAxes(true);
      }
    } else {
      setLastCommandMessage({ text: result.message, isError: true });
      showToast(result.message, "error");
    }
  };

  // Natural Language & Gemini AI Chat Prompt Execution
  const handleExecuteChatPrompt = async (
    prompt: string,
    mode: "offline" | "gemini",
    apiKey?: string,
    model?: string,
    _agentLevel: AgentInteractionLevel = "analytical",
    signal?: AbortSignal,
  ): Promise<{
    success: boolean;
    message: string;
    commands?: string[];
    rawJson?: any;
    rawText?: string;
    elementCount?: number;
  }> => {
    try {
      if (signal?.aborted) {
        return { success: false, message: "Yêu cầu đã bị hủy.", elementCount: 0 };
      }
      const stage = stageRef.current;
      const width = stage ? stage.width() : window.innerWidth;
      const height = stage ? stage.height() : window.innerHeight;

      // 0. LỆNH VẼ ĐƠN GIẢN (vd: "vẽ tam giác ABC", "vẽ đường tròn tâm O"):
      // Luôn vẽ ngay bằng bộ phân tích tiếng Việt có sẵn ở CẢ HAI chế độ —
      // nhanh, chính xác, không cần API Key và không tốn lượt gọi Gemini.
      if (isSimpleSingleObjectCommand(prompt)) {
        const regexRes = parseVietnameseGeometry(prompt, elements, width, height);
        if (regexRes.success) {
          const newCount = regexRes.updatedElements?.length || regexRes.newElements?.length || 0;
          if (regexRes.updatedElements) {
            updateElementsWithHistory(regexRes.updatedElements);
          } else if (regexRes.newElements) {
            updateElementsWithHistory(regexRes.newElements);
          }
          showToast(regexRes.message, "success");
          return { success: true, message: regexRes.message, elementCount: newCount };
        }
        if (regexRes.final) {
          showToast(regexRes.message, "error");
          return { success: false, message: regexRes.message, elementCount: 0 };
        }

        // Lệnh ngắn về hình đặc biệt (hình thang, hình thoi...) → thử Bộ giải Sư phạm trước khi gọi AI
        const quickClassic = solveClassicGeometry(prompt, elements, width, height);
        if (quickClassic && quickClassic.success) {
          const newCount = quickClassic.newElements?.length || quickClassic.updatedElements?.length || 0;
          if (quickClassic.newElements) {
            updateElementsWithHistory(quickClassic.newElements);
          } else if (quickClassic.updatedElements) {
            updateElementsWithHistory(quickClassic.updatedElements);
          }
          showToast(quickClassic.message, "success");
          return { success: true, message: quickClassic.message, elementCount: newCount };
        }
      }

      // 1. NẾU CHỌN CHẾ ĐỘ THUẦN JS (OFFLINE):
      // Dùng Bộ giải hình học Sư phạm THCS/THPT chạy trực tiếp trên trình duyệt
      if (mode === "offline") {
        const classicRes = solveClassicGeometry(prompt, elements, width, height);
        if (classicRes && classicRes.success) {
          const newCount = classicRes.newElements?.length || classicRes.updatedElements?.length || 0;
          if (classicRes.newElements) {
            updateElementsWithHistory(classicRes.newElements);
          } else if (classicRes.updatedElements) {
            updateElementsWithHistory(classicRes.updatedElements);
          }
          showToast(classicRes.message, "success");
          return {
            success: true,
            message: `${classicRes.message}\n(Được vẽ tức thì bằng Bộ giải hình học Sư phạm THCS/THPT)`,
            elementCount: newCount,
          };
        }
      }

      // 2. CHẾ ĐỘ GEMINI AI:
      const activeApiKey =
        apiKey?.trim() ||
        localStorage.getItem("edukit_gemini_api_key")?.trim() ||
        (import.meta as any).env?.VITE_GEMINI_API_KEY?.trim() ||
        "";
      if (!activeApiKey) {
        // Fallback kiểm tra nếu bài toán giải được bằng bộ giải offline thì vẽ luôn
        const classicRes = solveClassicGeometry(prompt, elements, width, height);
        if (classicRes && classicRes.success) {
          const newCount = classicRes.newElements?.length || classicRes.updatedElements?.length || 0;
          if (classicRes.newElements) {
            updateElementsWithHistory(classicRes.newElements);
          } else if (classicRes.updatedElements) {
            updateElementsWithHistory(classicRes.updatedElements);
          }
          showToast(classicRes.message, "success");
          return {
            success: true,
            message: `${classicRes.message}\n(Được vẽ tức thì bằng Bộ giải hình học Sư phạm THCS/THPT)`,
            elementCount: newCount,
          };
        }

        return {
          success: false,
          message:
            "Đây là bài toán hình học tổng hợp nâng cao. Vui lòng dán Gemini API Key (miễn phí tại Google AI Studio) ở khung bên phải để AI tự động tính tọa độ và vẽ toàn bộ bài toán!",
          elementCount: 0,
        };
      }

      // Model AI ưu tiên (service sẽ tự chuyển sang model dự phòng nếu bị 404)
      const targetModel = model || getCachedModel();

      // Hình đang có trên bảng → gửi kèm để AI VẼ TIẾP thay vì vẽ lại từ đầu
      const canvasFigure = elements.length > 0 ? canvasToFigureSpec(elements, getCanvasOrigin(width, height)) : null;
      const context =
        canvasFigure && canvasFigure.spec.points.length > 0
          ? { figure: canvasFigure.spec, history: chatHistoryRef.current }
          : undefined;

      // Gọi Gemini API
      const aiRes = await callGeminiGeometryAi(
        prompt,
        activeApiKey,
        targetModel,
        width,
        height,
        signal,
        context
      );

      // Nếu đã abort trong lúc chờ phản hồi, DỪNG NGAY LẬP TỨC và KHÔNG VẼ lên canvas
      if (signal?.aborted) {
        return {
          success: false,
          message: "Yêu cầu đã quá thời gian chờ (25s) và bị hủy.",
          elementCount: 0,
        };
      }

      // ƯU TIÊN 1: Bộ dựng hình JavaScript đã tính toán giải tích và Auto-fit & Center chuẩn xác 100%
      if (aiRes.constructedElements && aiRes.constructedElements.length > 0) {
        if (!signal?.aborted) {
          // Vẽ tiếp: hình mới đã gồm cả hình cũ; giữ thêm các đối tượng không chuyển đổi được (chữ, LaTeX...)
          updateElementsWithHistory(
            aiRes.continued && canvasFigure
              ? [...aiRes.constructedElements, ...canvasFigure.untouched]
              : aiRes.constructedElements,
          );
          chatHistoryRef.current = aiRes.continued ? [...chatHistoryRef.current, prompt] : [prompt];
          showToast(aiRes.explanation, "success");
        }
        const reasoningSummary = aiRes.reasoning
          ? `\n\n📐 Kế hoạch dựng hình (reasoning):\n${aiRes.reasoning}`
          : "";
        return {
          success: true,
          message: `${aiRes.continued ? "➕ Vẽ tiếp trên hình đang có.\n" : ""}${aiRes.explanation}${reasoningSummary}\n\n(${aiRes.model || targetModel} đã xuất ${aiRes.constructedElements.length} đối tượng hình học)`,
          commands: aiRes.commands,
          rawJson: aiRes.rawParsedJson,
          rawText: aiRes.rawText,
          elementCount: aiRes.constructedElements.length,
        };
      }

      if (!aiRes.success) {
        return {
          success: false,
          message: aiRes.error || "Không thể gọi Gemini API",
          rawJson: aiRes.rawParsedJson,
          rawText: aiRes.rawText,
          elementCount: 0,
        };
      }

      // ƯU TIÊN 2: Fallback parse các lệnh riêng lẻ nếu có
      let currentList = [...elements];
      const executed: string[] = [];
      for (const cmd of aiRes.commands) {
        const pRes = parseAndExecuteCommand(cmd, currentList, width, height);
        if (pRes.success && pRes.newElements) {
          currentList = pRes.newElements;
          executed.push(cmd);
        }
      }

      if (executed.length > 0) {
        updateElementsWithHistory(currentList);
        showToast(aiRes.explanation, "success");
        const reasoningSummary = aiRes.reasoning ? `\n\n📐 Phân tích tọa độ (reasoning):\n${aiRes.reasoning}` : '';
        return {
          success: true,
          message: `${aiRes.explanation}${reasoningSummary}\n\n(${aiRes.model || targetModel} đã thực thi ${executed.length} lệnh tọa độ chuẩn xác)`,
          commands: executed,
          rawJson: aiRes.rawParsedJson,
          rawText: aiRes.rawText,
          elementCount: currentList.length,
        };
      } else {
        return {
          success: false,
          message: aiRes.error || "Không tìm thấy điểm, đoạn thẳng hoặc đường tròn hợp lệ để vẽ.",
          rawJson: aiRes.rawParsedJson,
          rawText: aiRes.rawText,
          elementCount: 0,
        };
      }
    } catch (err: any) {
      console.error("handleExecuteChatPrompt error:", err);
      return {
        success: false,
        message: `Lỗi khi vẽ: ${err?.message || String(err)}`,
      };
    }
  };

  // Preset Insertion
  const handleApplyPreset = (presetElements: GeoElement[]) => {
    updateElementsWithHistory([...elements, ...presetElements]);
    setSelectedIds(presetElements.map((el) => el.id));
    setCurrentTool("select");
    showToast("Đã chèn mẫu hình học vào bản vẽ");
  };

  // Clipboard Export Actions
  const handleCopyAll = async () => {
    if (!stageRef.current) return;
    setIsExporting(true);
    const result = await copyStageToClipboard(
      stageRef.current,
      elements,
      [],
      "all",
    );
    setIsExporting(false);
    showToast(result.message, result.success ? "success" : "error");
  };

  const handleCopySelection = async () => {
    if (!stageRef.current) return;
    setIsExporting(true);
    const result = await copyStageToClipboard(
      stageRef.current,
      elements,
      selectedIds,
      "selection",
    );
    setIsExporting(false);
    showToast(result.message, result.success ? "success" : "error");
  };

  const handleDownloadPng = async () => {
    if (!stageRef.current) return;
    setIsExporting(true);
    const result = await copyStageToClipboard(
      stageRef.current,
      elements,
      selectedIds,
      "all",
      false,
    );
    setIsExporting(false);
    if (result.dataUrl) {
      downloadDataUrl(result.dataUrl, `hinh-hoc-toan-${Date.now()}.png`);
      showToast("Đã tải xuống ảnh PNG trong suốt — chèn vào Word bằng Insert → Pictures.");
    } else {
      showToast(result.message, "error");
    }
  };

  // Initial empty canvas state (no default demo shapes)
  useEffect(() => {
    // Keep clean empty canvas on load
  }, []);

  // Dùng chung cho thanh công cụ dọc (máy tính) và thanh công cụ dưới đáy (điện thoại)
  const toolbarProps = {
    currentTool,
    onSelectTool: (tool: ToolType) => {
      setCurrentTool(tool);
      if (tool !== "select") {
        setSelectedIds([]);
      }
    },
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onClear: handleClear,
    onOpenPresets: () => setPresetsOpen(true),
  };

  return (
    <div
      className="flex flex-col w-full overflow-hidden font-sans"
      // Chiều cao đo bằng JS (xem main.tsx): một số trình duyệt điện thoại (Zalo, WebView cũ)
      // tính 100vh cao hơn phần nhìn thấy → thanh công cụ dưới đáy bị đẩy khuất
      style={{ height: "var(--app-h, 100%)" }}
    >
      {/* Top Header Bar */}
      <HeaderBar
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid(!showGrid)}
        showAxes={showAxes}
        onToggleAxes={() => setShowAxes(!showAxes)}
        snapToGrid={snapToGrid}
        onToggleSnap={() => setSnapToGrid(!snapToGrid)}
        selectedCount={selectedIds.length}
        onCopyAll={handleCopyAll}
        onCopySelection={handleCopySelection}
        onDownloadPng={handleDownloadPng}
        onSaveProject={handleSaveProject}
        onOpenProject={handleOpenProject}
        zoom={zoom}
        onZoomIn={() => setZoom((z) => Math.min(2.5, +(z + 0.1).toFixed(2)))}
        onZoomOut={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))}
        onResetZoom={() => setZoom(1)}
        isExporting={isExporting}
        isChatOpen={isChatOpen}
        onToggleChat={() => setIsChatOpen(!isChatOpen)}
        themePreference={themePreference}
        themeIsDark={themeIsDark}
        onCycleTheme={cycleTheme}
        onOpenLabelSettings={() => setLabelSettingsOpen(true)}
      />

      {/* Main Workspace: Left Toolbar + Center Canvas + Bottom Command Bar */}
      <div className="flex flex-1 min-h-0 relative overflow-hidden">
        {/* Left Toolbar */}
<Toolbar {...toolbarProps} />

        {/* Center Drawing Canvas (with bottom command input bar) */}
        <div className="flex-1 min-w-0 flex flex-col relative overflow-hidden">
          {/* Canvas Area */}
          <main className="flex-1 min-h-0 relative w-full">
            <CanvasArea
              currentTool={currentTool}
              elements={elements}
              onElementsChange={updateElementsWithHistory}
              selectedIds={selectedIds}
              onSelectIds={setSelectedIds}
              showGrid={showGrid}
              showAxes={showAxes}
              snapToGrid={snapToGrid}
              stageRef={stageRef}
              onOpenLatexDialog={handleOpenLatex}
              onEditLatexElement={handleEditLatexElement}
              onSelectionPositionChange={setSelectionPos}
              zoom={zoom}
              globalLabelStyle={globalLabelStyle}
            />

            {/* Floating Property Bar when an element is selected */}
            <FloatingPropertyBar
              selectedElement={selectedElement}
              position={selectionPos}
              onUpdateElement={handleUpdateElement}
              onDeleteElement={handleDeleteSelected}
              onDuplicateElement={handleDuplicate}
              onBringToFront={handleBringToFront}
              onSendToBack={handleSendToBack}
              onEditLatex={handleEditLatex}
            />
          </main>

          {/* Bottom Coordinate Command Input Bar */}
          <CommandInputBar
            onExecute={handleExecuteCommand}
            lastMessage={lastCommandMessage}
          />

          {/* Thanh công cụ dưới đáy (chỉ điện thoại dựng đứng): công cụ chính + Hoàn tác / Làm lại */}
          <MobileToolbar {...toolbarProps} />
        </div>
      </div>

      {/* LaTeX formula modal dialog */}
      <LatexDialog
        isOpen={latexDialogOpen}
        initialLatex={editingLatexElement?.latex || "A"}
        initialFontSize={editingLatexElement?.fontSize || 22}
        initialColor={editingLatexElement?.color || "#0f172a"}
        onSave={handleSaveLatex}
        onClose={() => setLatexDialogOpen(false)}
      />

      {/* Preset Geometry Figures modal */}
      <PresetsModal
        isOpen={presetsOpen}
        onClose={() => setPresetsOpen(false)}
        onApplyPreset={handleApplyPreset}
        canvasCenter={{ x: 550, y: 350 }}
      />

      {/* Global & Point Label Settings modal */}
      <LabelSettingsModal
        isOpen={labelSettingsOpen}
        onClose={() => setLabelSettingsOpen(false)}
        currentStyle={globalLabelStyle}
        onSave={handleSaveGlobalLabelStyle}
      />

      {/* Right AI & Vietnamese Chat Sidebar */}
      <RightChatSidebar
        isOpen={isChatOpen}
        onToggleOpen={() => setIsChatOpen(!isChatOpen)}
        onExecutePrompt={handleExecuteChatPrompt}
        onClearChat={() => {
          chatHistoryRef.current = [];
        }}
        canUndo={toolbarProps.canUndo}
        canRedo={toolbarProps.canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      {/* Hidden file input for opening saved project sessions */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".edukit,.json"
        style={{ display: "none" }}
      />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-20 md:bottom-16 short:bottom-4 left-3 right-3 md:left-auto md:right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border border-slate-200 bg-white text-slate-800 animate-in slide-in-from-bottom-5 duration-200">
          {toast.type === "success" && (
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          )}
          {toast.type === "error" && (
            <AlertCircle className="w-5 h-5 text-rose-500" />
          )}
          {toast.type === "info" && <Info className="w-5 h-5 text-blue-500" />}
          <span className="text-xs font-semibold">{toast.message}</span>
        </div>
      )}
    </div>
  );
};

export default App;
