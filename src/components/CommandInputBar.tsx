import React, { useState, useRef } from 'react';
import { Terminal, HelpCircle, ChevronRight, CornerDownLeft } from 'lucide-react';

interface CommandInputBarProps {
  onExecute: (command: string) => void;
  lastMessage?: { text: string; isError?: boolean } | null;
}

const EXAMPLE_COMMANDS = [
  { label: 'A = (2, 3)', cmd: 'A = (2, 3)' },
  { label: 'B = (5, 3)', cmd: 'B = (5, 3)' },
  { label: 'C = (2, 7)', cmd: 'C = (2, 7)' },
  { label: 'DoanThang(A, B)', cmd: 'DoanThang(A, B)' },
  { label: 'DuongTron(A, 4)', cmd: 'DuongTron(A, 4)' },
  { label: 'DaGiac(A, B, C)', cmd: 'DaGiac(A, B, C)' },
  { label: 'M = TrungDiem(A, B)', cmd: 'M = TrungDiem(A, B)' },
];

export const CommandInputBar: React.FC<CommandInputBarProps> = ({
  onExecute,
  lastMessage,
}) => {
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [showHelp, setShowHelp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = command.trim();
    if (!trimmed) return;

    onExecute(trimmed);

    // Add to history
    setHistory((prev) => [...prev, trimmed]);
    setHistoryIndex(-1);
    setCommand('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setCommand(history[nextIndex]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex >= history.length) {
        setHistoryIndex(-1);
        setCommand('');
      } else {
        setHistoryIndex(nextIndex);
        setCommand(history[nextIndex]);
      }
    }
  };

  return (
    <div className="bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 py-2 z-20 shadow-md">
      <div className="max-w-6xl mx-auto flex flex-col gap-1.5">
        {/* Input line and buttons */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          {/* Terminal label */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 rounded-xl text-slate-600 border border-slate-200 text-xs font-semibold shrink-0">
            <Terminal className="w-4 h-4 text-blue-600" />
            <span className="hidden sm:inline">Lệnh tọa độ</span>
          </div>

          {/* Main Input */}
          <div className="relative flex-1 flex items-center">
            <ChevronRight className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nhập lệnh: A = (2, 3), DoanThang(A, B), DuongTron(A, 4), DaGiac(A, B, C)... (Ấn Enter)"
              className="w-full pl-8 pr-16 py-2 bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 focus:border-blue-500 rounded-xl text-xs sm:text-sm font-mono text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 transition-all shadow-2xs"
            />
            <button
              type="submit"
              disabled={!command.trim()}
              className={`absolute right-1.5 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                command.trim()
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-xs'
                  : 'text-slate-300 cursor-not-allowed'
              }`}
            >
              <span>Chạy</span>
              <CornerDownLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Help toggle button */}
          <button
            type="button"
            onClick={() => setShowHelp(!showHelp)}
            className={`p-2 rounded-xl border transition-colors shrink-0 ${
              showHelp
                ? 'bg-blue-50 border-blue-300 text-blue-600'
                : 'text-slate-500 border-slate-200 hover:bg-slate-100'
            }`}
            title="Xem hướng dẫn cú pháp lệnh"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </form>

        {/* Quick Example Chips & Last message */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto text-[11px] pt-0.5">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-slate-400 font-medium hidden md:inline">Gợi ý:</span>
            {EXAMPLE_COMMANDS.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => {
                  setCommand(c.cmd);
                  inputRef.current?.focus();
                }}
                className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-700 border border-slate-200/80 font-mono transition-colors"
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Feedback message */}
          {lastMessage && (
            <span
              className={`font-medium truncate max-w-sm shrink-0 px-2 py-0.5 rounded ${
                lastMessage.isError
                  ? 'text-rose-600 bg-rose-50 border border-rose-200'
                  : 'text-emerald-700 bg-emerald-50 border border-emerald-200'
              }`}
            >
              {lastMessage.text}
            </span>
          )}
        </div>

        {/* Syntax help popup */}
        {showHelp && (
          <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 grid grid-cols-1 md:grid-cols-3 gap-3 animate-in fade-in duration-150">
            <div>
              <span className="font-bold text-slate-900 block mb-1">1. Điểm & Tọa độ</span>
              <ul className="space-y-1 font-mono text-[11px] text-slate-600">
                <li>• <span className="text-blue-600">A = (2, 3)</span> : Tạo điểm A</li>
                <li>• <span className="text-blue-600">B = (-1.5, 4)</span> : Tạo điểm B</li>
                <li>• <span className="text-blue-600">(0, 0)</span> : Điểm không tên</li>
              </ul>
            </div>
            <div>
              <span className="font-bold text-slate-900 block mb-1">2. Đường & Hình học</span>
              <ul className="space-y-1 font-mono text-[11px] text-slate-600">
                <li>• <span className="text-blue-600">DoanThang(A, B)</span> : Đoạn thẳng AB</li>
                <li>• <span className="text-blue-600">DuongThang(A, B)</span> : Đường thẳng AB</li>
                <li>• <span className="text-blue-600">DuongTron(A, 4)</span> : Tròn tâm A, R=4</li>
                <li>• <span className="text-blue-600">M = TrungDiem(A, B)</span> : Trung điểm</li>
              </ul>
            </div>
            <div>
              <span className="font-bold text-slate-900 block mb-1">3. Đa giác & Chữ/LaTeX</span>
              <ul className="space-y-1 font-mono text-[11px] text-slate-600">
                <li>• <span className="text-blue-600">DaGiac(A, B, C)</span> : Tam giác ABC</li>
                <li>• <span className="text-blue-600">DaGiac(A, B, C, D)</span> : Tứ giác ABCD</li>
                <li>• <span className="text-blue-600">LaTeX("x^2+y^2=1", 1, 2)</span> : Chèn LaTeX</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
