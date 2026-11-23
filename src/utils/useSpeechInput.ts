import { useCallback, useEffect, useRef, useState } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */
type SpeechRecognitionCtor = new () => any;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return (w.SpeechRecognition || w.webkitSpeechRecognition || null) as SpeechRecognitionCtor | null;
}

export interface SpeechInputOptions {
  lang?: string;
  /** Gọi liên tục với văn bản tạm thời (đang nói) */
  onInterim?: (text: string) => void;
  /** Gọi khi người dùng ngừng nói, với toàn bộ câu đã nhận dạng */
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'Trình duyệt chưa được cấp quyền dùng micro. Hãy bấm biểu tượng ổ khoá trên thanh địa chỉ và cho phép Micro.',
  'service-not-allowed': 'Trình duyệt không cho phép nhận dạng giọng nói trên trang này.',
  'no-speech': 'Không nghe thấy giọng nói. Hãy bấm micro và nói lại.',
  'audio-capture': 'Không tìm thấy micro trên thiết bị.',
  network: 'Nhận dạng giọng nói cần kết nối Internet. Hãy kiểm tra mạng.',
  'language-not-supported': 'Trình duyệt chưa hỗ trợ nhận dạng tiếng Việt.',
};

export function useSpeechInput({ lang = 'vi-VN', onInterim, onFinal, onError }: SpeechInputOptions) {
  const [isListening, setIsListening] = useState(false);
  const [supported] = useState(() => getRecognitionCtor() !== null);
  const recRef = useRef<any>(null);
  const finalRef = useRef('');
  const cbRef = useRef({ onInterim, onFinal, onError });
  cbRef.current = { onInterim, onFinal, onError };

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      cbRef.current.onError?.('Trình duyệt này chưa hỗ trợ nhập bằng giọng nói. Hãy dùng Chrome, Edge hoặc Safari.');
      return;
    }
    if (recRef.current) return;

    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false; // tự dừng khi người dùng ngừng nói
    rec.maxAlternatives = 1;
    finalRef.current = '';
    let errored = false;

    rec.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      finalRef.current = final;
      cbRef.current.onInterim?.((final + ' ' + interim).trim());
    };
    rec.onerror = (event: any) => {
      if (event.error === 'aborted') return;
      errored = true;
      cbRef.current.onError?.(ERROR_MESSAGES[event.error] ?? `Lỗi nhận dạng giọng nói: ${event.error}`);
    };
    rec.onend = () => {
      recRef.current = null;
      setIsListening(false);
      const text = finalRef.current.trim();
      if (text && !errored) cbRef.current.onFinal?.(text);
    };

    recRef.current = rec;
    try {
      rec.start();
      setIsListening(true);
    } catch (e: any) {
      recRef.current = null;
      cbRef.current.onError?.(`Không bật được micro: ${e?.message ?? e}`);
    }
  }, [lang]);

  const toggle = useCallback(() => {
    if (recRef.current) stop();
    else start();
  }, [start, stop]);

  useEffect(() => () => recRef.current?.abort(), []);

  return { supported, isListening, start, stop, toggle };
}
