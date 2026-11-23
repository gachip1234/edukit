import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Key,
  Eye,
  EyeOff,
  Send,
  Trash2,
  ChevronRight,
  Bot,
  User,
  ExternalLink,
  Code2,
  Check,
  Loader2,
  Sliders,
  Zap,
  Brain,
  X,
  Compass,
} from "lucide-react";

import { getCachedModel, setCachedModel, VALID_TEXT_MODELS } from "../utils/geminiAiService";

export type AgentInteractionLevel = "direct" | "analytical" | "deep_reasoning";

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  commands?: string[];
  isError?: boolean;
  timestamp: number;
}

export interface ChatPromptResult {
  success: boolean;
  message: string;
  commands?: string[];
  rawJson?: any;
  rawText?: string;
  elementCount?: number;
}

interface RightChatSidebarProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  onExecutePrompt: (
    prompt: string,
    mode: "offline" | "gemini",
    apiKey?: string,
    model?: string,
    agentLevel?: AgentInteractionLevel,
    signal?: AbortSignal,
  ) => Promise<ChatPromptResult>;
  /** Gọi khi xóa lịch sử chat (để lần chat sau không còn ngữ cảnh các yêu cầu cũ) */
  onClearChat?: () => void;
}

const SAMPLE_PROMPTS = [
  "Vẽ tam giác ABC vuông tại A, AB = 3, AC = 4",
  "Cho đường tròn (O; 3cm), điểm M cách O 6cm. Vẽ 2 tiếp tuyến MA, MB",
  "Vẽ tam giác đều ABC cạnh 4, đường cao AH",
  "Vẽ hình chữ nhật ABCD có AB = 5, BC = 3 và hai đường chéo",
  "Vẽ hình thang cân ABCD (AB // CD) có AB = 3, CD = 6, đường cao h = 3",
  "Vẽ lục giác đều ABCDEF cạnh 3.5",
  "Vẽ đường tròn tâm O bán kính 3, đường kính AB và dây CD vuông góc AB",
];

export const RightChatSidebar: React.FC<RightChatSidebarProps> = ({
  isOpen,
  onToggleOpen,
  onExecutePrompt,
  onClearChat,
}) => {
  const [mode, setMode] = useState<"offline" | "gemini">("gemini");
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem("edukit_gemini_api_key") || "";
  });
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return getCachedModel();
  });
  const [showApiKey, setShowApiKey] = useState(false);

  // Agent interaction level (Mức độ tương tác của Agent)
  const [agentLevel, setAgentLevel] = useState<AgentInteractionLevel>(() => {
    return (
      (localStorage.getItem("edukit_agent_level") as AgentInteractionLevel) ||
      "analytical"
    );
  });
  const [isLevelModalOpen, setIsLevelModalOpen] = useState(false);


  const [inputPrompt, setInputPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      sender: "assistant",
      text: "Xin chào Thầy/Cô và các bạn! Tôi là Trợ Lý Hình Học AI. Bạn có thể dán đề bài toán hình học tự nhiên (nhiều dòng) hoặc gõ yêu cầu vẽ hình.",
      timestamp: Date.now(),
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Save API key & agent level to localStorage
  useEffect(() => {
    if (apiKey.trim()) {
      localStorage.setItem("edukit_gemini_api_key", apiKey.trim());
    }
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem("edukit_agent_level", agentLevel);
  }, [agentLevel]);

  useEffect(() => {
    if (selectedModel) {
      setCachedModel(selectedModel);
    }
  }, [selectedModel]);

  // Auto scroll to bottom
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const handleSend = async (customPrompt?: string) => {
    const textToSend = (customPrompt || inputPrompt).trim();
    if (!textToSend || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: textToSend,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setInputPrompt("");
    setIsLoading(true);

    // 3. ĐẶT TIMEOUT 25 GIÂY VÀ TRUYỀN ABORT SIGNAL ĐỂ NGẮT THỰC SỰ KẾT NỐI MẠNG
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 25000);

    try {
      const res = await onExecutePrompt(
        textToSend,
        mode,
        apiKey,
        selectedModel,
        agentLevel,
        abortController.signal,
      );

      // In log dữ liệu thô & cấu trúc JSON ra Console
      console.log("AI Parsed Result:", res);

      // Nếu đã bị hủy/timeout thì không thêm tin nhắn phản hồi
      if (abortController.signal.aborted) return;

      const elementCount = res.elementCount ?? 0;

      if (res.success && elementCount > 0) {
        const assistantMsg: ChatMessage = {
          id: `asst-${Date.now()}`,
          sender: "assistant",
          text: res.message || "Đã vẽ hình thành công lên Canvas.",
          commands: res.commands,
          isError: false,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        // Trên điện thoại / máy tính bảng khung chat che phần lớn chỗ vẽ → tự đóng để thấy ngay hình vừa vẽ
        if ((window.innerWidth < 1024 || window.innerHeight < 500) && isOpen) onToggleOpen();
      } else {
        // CẢNH BÁO KHI SỐ LƯỢNG ĐỐI TƯỢNG VẼ ĐƯỢC BẰNG 0 HOẶC CÓ LỖI:
        // Hiển thị cảnh báo ngay trên khung chat kèm đoạn JSON thô mà AI trả về để không bao giờ im lặng mà không vẽ!
        const rawJsonStr = res.rawJson
          ? JSON.stringify(res.rawJson, null, 2)
          : res.rawText || "Không có dữ liệu JSON phản hồi từ AI";

        // Chỉ nói "AI đã phản hồi" và in JSON thô khi AI thật sự trả về dữ liệu;
        // các lỗi khác (thiếu API Key, lỗi mạng, hết hạn mức...) chỉ hiện thông báo lỗi rõ ràng.
        const hasAiData = Boolean(res.rawJson || res.rawText);
        const warningMsg = hasAiData
          ? `⚠️ Cảnh báo: AI đã phản hồi nhưng số lượng đối tượng hình học vẽ được là 0 (Không tìm thấy điểm, đoạn thẳng hoặc đường tròn hợp lệ để vẽ lên Canvas).\n\n${res.message ? `• Chi tiết: ${res.message}\n\n` : ""}📄 Dữ liệu JSON thô nhận từ AI:\n\`\`\`json\n${rawJsonStr}\n\`\`\``
          : `⚠️ ${res.message || "Không vẽ được hình từ yêu cầu này."}`;

        const assistantMsg: ChatMessage = {
          id: `asst-${Date.now()}`,
          sender: "assistant",
          text: warningMsg,
          commands: res.commands,
          isError: true,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch (err: any) {
      if (abortController.signal.aborted || err?.name === "AbortError") {
        setMessages((prev) => [
          ...prev,
          {
            id: `asst-${Date.now()}`,
            sender: "assistant",
            text: "Đã quá thời gian chờ (25 giây). Đã tự động hủy kết nối để tránh treo giao diện.",
            isError: true,
            timestamp: Date.now(),
          },
        ]);
      } else {
        console.error("Chat error:", err);
        const errorMsg =
          err?.message || String(err) || "Lỗi không xác định khi gọi API";
        setMessages((prev) => [
          ...prev,
          {
            id: `asst-${Date.now()}`,
            sender: "assistant",
            text: `Đã xảy ra lỗi: ${errorMsg}`,
            isError: true,
            timestamp: Date.now(),
          },
        ]);
      }
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    onClearChat?.();
    setMessages([
      {
        id: "welcome",
        sender: "assistant",
        text: "Đã xóa lịch sử. Bạn có thể nhập câu lệnh hoặc đề bài toán hình học mới.",
        timestamp: Date.now(),
      },
    ]);
  };

  const getAgentLevelInfo = () => {
    switch (agentLevel) {
      case "direct":
        return {
          title: "Mức 1: Nhanh / Trực tiếp",
          desc: "Vẽ tức thì các hình học cơ bản, phản hồi nhanh gọn",
          icon: Zap,
          color: "text-emerald-600 bg-emerald-50 border-emerald-200",
        };
      case "deep_reasoning":
        return {
          title: "Mức 3: Suy luận sâu & Sư phạm",
          desc: "Phân tích giả thiết toàn diện, giải tích đường phụ & cực trị",
          icon: Brain,
          color: "text-purple-600 bg-purple-50 border-purple-200",
        };
      case "analytical":
      default:
        return {
          title: "Mức 2: Tiêu chuẩn (Tọa độ giải tích)",
          desc: "Bảo toàn tỷ lệ đề bài, tính tọa độ hình học chuẩn xác 100%",
          icon: Compass,
          color: "text-blue-600 bg-blue-50 border-blue-200",
        };
    }
  };

  const levelInfo = getAgentLevelInfo();
  const LevelIcon = levelInfo.icon;

  return (
    <>
      {/* Floating Toggle Button when closed */}
      {!isOpen && (
        <button
          onClick={onToggleOpen}
          title="Mở Trợ lý Vẽ Hình Tiếng Việt / AI"
          className="fixed right-4 bottom-6 md:bottom-28 short:bottom-4 z-30 bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-3 rounded-full shadow-lg shadow-blue-500/30 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 text-xs font-bold"
        >
          <Sparkles className="w-5 h-5 animate-pulse" />
          <span className="hidden sm:inline">Vẽ bằng Tiếng Việt / AI</span>
        </button>
      )}

      {/* Main Sidebar */}
      <aside
        className={`fixed top-16 short:top-12 right-0 bottom-0 z-30 bg-white/98 backdrop-blur-md border-l border-slate-200 shadow-xl transition-all duration-300 flex flex-col select-none ${
          isOpen
            ? "w-full sm:w-96 md:w-104 translate-x-0"
            : "w-0 translate-x-full overflow-hidden"
        }`}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <span>Trợ Lý Vẽ Hình AI</span>
                <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded-full">
                  v2.0
                </span>
              </h3>
              <p className="text-[10px] text-slate-500">
                Tiếng Việt • Giải Tích • Gemini AI
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleClearChat}
              title="Xóa lịch sử chat"
              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onToggleOpen}
              title="Thu gọn"
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Active Agent & Interaction Level Selector Bar (Clickable) */}
        <div className="p-2 border-b border-slate-200 bg-slate-50/70">
          <button
            onClick={() => setIsLevelModalOpen(true)}
            title="Nhấn để đổi mức độ tương tác và cấu hình Agent"
            className="w-full text-left p-2 rounded-xl bg-white border border-slate-200 hover:border-blue-400 transition-all shadow-xs group flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center border ${levelInfo.color}`}
              >
                <LevelIcon className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                    {mode === "offline"
                      ? "Bộ giải Hình học JS (Offline)"
                      : selectedModel}
                  </span>
                  <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded-full font-medium">
                    {levelInfo.title.split(":")[0]}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 line-clamp-1">
                  {levelInfo.desc}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-slate-400 group-hover:text-blue-600 text-[10px] font-semibold pr-1">
              <Sliders className="w-3.5 h-3.5" />
              <span>Chỉnh</span>
            </div>
          </button>

        </div>

        {/* Mode Selector Tab (Thuần JS vs Gemini AI) */}
        <div className="p-2 border-b border-slate-200 bg-white">
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl text-xs font-semibold gap-1">
            <button
              onClick={() => setMode("offline")}
              className={`py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                mode === "offline"
                  ? "bg-white text-blue-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Thuần JS (Free)</span>
            </button>

            <button
              onClick={() => setMode("gemini")}
              className={`py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                mode === "gemini"
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Gemini AI</span>
            </button>
          </div>

          {/* Gemini API Key config toggle (Only if needed and user wants custom key) */}
          {mode === "gemini" && (
            <div className="mt-2 p-2 bg-indigo-50/60 rounded-xl border border-indigo-100 text-xs">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-indigo-900 flex items-center gap-1">
                  <Key className="w-3 h-3 text-indigo-600" />
                  Gemini API Key:
                </span>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5"
                >
                  <span>Lấy key miễn phí</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>

              <div className="relative flex items-center">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Dán mã Gemini API Key tại đây..."
                  className="w-full pl-2 pr-8 py-1.5 text-xs bg-white border border-indigo-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 text-slate-400 hover:text-slate-600"
                >
                  {showApiKey ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Message List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50/40 text-xs">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-2 ${m.sender === "user" ? "justify-end" : "justify-start"}`}
            >
              {m.sender === "assistant" && (
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5" />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                  m.sender === "user"
                    ? "bg-blue-600 text-white rounded-br-xs shadow-xs"
                    : m.isError
                      ? "bg-rose-50 text-rose-800 border border-rose-200 rounded-bl-xs"
                      : "bg-white text-slate-800 border border-slate-200/80 rounded-bl-xs shadow-2xs"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.text}</p>

                {/* Executed commands summary */}
                {m.commands && m.commands.length > 0 && (
                  <div className="mt-2 pt-1.5 border-t border-slate-100 font-mono text-[10px] text-slate-500 space-y-0.5">
                    <span className="font-sans font-semibold text-slate-600 block">
                      Lệnh đã chạy:
                    </span>
                    {m.commands.map((cmd, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200/50"
                      >
                        {cmd}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {m.sender === "user" && (
                <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 text-slate-500 text-xs py-1">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>Đang tính toán tọa độ giải tích và vẽ hình...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Sample Prompts Carousel */}
        <div className="p-2 border-t border-slate-200 bg-white">
          <div className="text-[10px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
            <span>Mẫu bài toán hình học kinh điển:</span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {SAMPLE_PROMPTS.map((prompt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSend(prompt)}
                disabled={isLoading}
                className="whitespace-nowrap px-2 py-1 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 rounded-lg text-[10px] font-medium transition-colors shrink-0"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        {/* Input Bar (Được làm cao thêm 4 dòng dạng Textarea cho phép dán đề dài) */}
        <div className="p-3 border-t border-slate-200 bg-white">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex flex-col gap-2"
          >
            <div className="relative">
              <textarea
                rows={5}
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={
                  mode === "gemini" && !apiKey.trim()
                    ? "Dán Gemini API Key ở trên để mở khóa vẽ tự động bằng AI..."
                    : "Nhập: Vẽ tam giác vuông ABC, cho đường tròn (O), tiếp tuyến MA MB... (Enter để vẽ)"
                }
                disabled={isLoading}
                className="w-full p-2.5 text-xs border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 text-slate-800 placeholder-slate-400 bg-slate-50 border-slate-300 focus:border-blue-500 hover:bg-white focus:bg-white resize-none shadow-2xs font-sans leading-relaxed"
              />
              <button
                type="submit"
                disabled={!inputPrompt.trim() || isLoading}
                title="Gửi đề bài (Enter)"
                className={`absolute right-2.5 bottom-3 p-2 rounded-xl transition-all ${
                  inputPrompt.trim() && !isLoading
                    ? "bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 active:scale-95"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                }`}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
              <span>
                Ấn <b>Enter</b> để vẽ hình • <b>Shift + Enter</b> xuống dòng
              </span>
              <span>{inputPrompt.length} ký tự</span>
            </div>
          </form>
        </div>
      </aside>

      {/* Modal lựa chọn Mức Độ Tương Tác Của Agent */}
      {isLevelModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-800">
                  Cấu Hình Mức Độ Tương Tác Agent
                </h3>
              </div>
              <button
                onClick={() => setIsLevelModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              {/* Level 1 */}
              <button
                type="button"
                onClick={() => {
                  setAgentLevel("direct");
                  setIsLevelModalOpen(false);
                }}
                className={`w-full text-left p-3 rounded-xl border transition-all flex items-start gap-3 ${
                  agentLevel === "direct"
                    ? "border-emerald-500 bg-emerald-50/70 shadow-xs"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Zap className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">
                      Mức 1: Nhanh / Trực tiếp
                    </span>
                    {agentLevel === "direct" && (
                      <Check className="w-4 h-4 text-emerald-600" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Dựng hình thần tốc các đa giác đều, đường tròn, tam giác cơ
                    bản. Phản hồi ngắn gọn, không giải thích dài dòng.
                  </p>
                </div>
              </button>

              {/* Level 2 */}
              <button
                type="button"
                onClick={() => {
                  setAgentLevel("analytical");
                  setIsLevelModalOpen(false);
                }}
                className={`w-full text-left p-3 rounded-xl border transition-all flex items-start gap-3 ${
                  agentLevel === "analytical"
                    ? "border-blue-500 bg-blue-50/70 shadow-xs"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Compass className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">
                      Mức 2: Tiêu chuẩn (Tọa độ giải tích)
                    </span>
                    {agentLevel === "analytical" && (
                      <Check className="w-4 h-4 text-blue-600" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Khuyên dùng cho đề thi/kiểm tra. AI giải hệ phương trình tọa
                    độ, bảo toàn tỷ lệ số học và tự động neo điểm chuẩn xác.
                  </p>
                </div>
              </button>

              {/* Level 3 */}
              <button
                type="button"
                onClick={() => {
                  setAgentLevel("deep_reasoning");
                  setIsLevelModalOpen(false);
                }}
                className={`w-full text-left p-3 rounded-xl border transition-all flex items-start gap-3 ${
                  agentLevel === "deep_reasoning"
                    ? "border-purple-500 bg-purple-50/70 shadow-xs"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Brain className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">
                      Mức 3: Suy luận sâu & Sư phạm
                    </span>
                    {agentLevel === "deep_reasoning" && (
                      <Check className="w-4 h-4 text-purple-600" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Dành cho bài toán khó, hình học không gian hoặc hình học
                    phức tạp. Tự động vẽ đường phụ nét đứt, kiểm tra giả thiết
                    và xuất phân tích sư phạm.
                  </p>
                </div>
              </button>
            </div>

            {/* Model Selection in modal */}
            <div className="pt-2 border-t border-slate-100">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Mô hình AI xử lý:
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-xs text-slate-800 font-medium focus:outline-hidden focus:border-blue-500"
              >
                {VALID_TEXT_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsLevelModalOpen(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
};
