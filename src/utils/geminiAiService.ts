import type { GeoElement } from '../types/geometry';
import { augmentWithProblemText } from './problemTextAugmenter';
import {
  executeConstructionCommands,
  type ConstructionCommand,
} from './constructionEngine';

export interface StructuredPoint {
  id?: string;
  label: string;
  x: number;
  y: number;
}

export interface StructuredSegment {
  from: string;
  to: string;
  style?: 'solid' | 'dashed' | 'dotted';
}

export interface StructuredPolygon {
  vertices: string[];
  fill?: string;
  stroke?: string;
}

export interface StructuredCircle {
  center: string;
  radius: number;
  fill?: string;
}

export interface GeminiApiResponse {
  success: boolean;
  reasoning?: string;
  explanation: string;
  commands: string[];
  constructionCommands?: ConstructionCommand[];
  constructedElements?: GeoElement[];
  rawParsedJson?: any;
  elementCount?: number;
  points?: StructuredPoint[];
  segments?: StructuredSegment[];
  polygons?: StructuredPolygon[];
  circles?: StructuredCircle[];
  rawText?: string;
  /** Model thực sự đã dùng (có thể là model dự phòng) */
  model?: string;
  error?: string;
}

/**
 * Danh sách model theo thứ tự ưu tiên. Nếu Google trả về 404 (model không tồn tại
 * hoặc đã ngừng hỗ trợ), tự động thử model tiếp theo. Model chạy được sẽ được nhớ lại.
 */
export const VALID_TEXT_MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-flash-latest'];

export function sanitizeModelName(name?: string): string {
  return name && VALID_TEXT_MODELS.includes(name) ? name : VALID_TEXT_MODELS[0];
}

export function getCachedModel(): string {
  try {
    return sanitizeModelName(localStorage.getItem('edukit_gemini_model') || undefined);
  } catch {
    return VALID_TEXT_MODELS[0];
  }
}

export function setCachedModel(modelName: string) {
  try {
    localStorage.setItem('edukit_gemini_model', sanitizeModelName(modelName));
  } catch {}
}

/**
 * Clean extract JSON string before JSON.parse()
 * Strips out ```json, ```, and any prose/explanations outside the outermost { ... }
 */
export function extractCleanJson(rawText: string): any {
  let clean = rawText.trim();
  clean = clean.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();

  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    clean = clean.substring(firstBrace, lastBrace + 1);
  }

  return JSON.parse(clean);
}

/**
 * Gọi Gemini Geometry AI với độ trễ dưới 5s, timeout 25s, hủy ngắt kết nối thực sự
 */
export async function callGeminiGeometryAi(
  prompt: string,
  apiKey: string,
  model?: string,
  canvasWidth: number = 1000,
  canvasHeight: number = 700,
  externalSignal?: AbortSignal
): Promise<GeminiApiResponse> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    return {
      success: false,
      explanation: '',
      commands: [],
      error: 'Vui lòng nhập API Key của Gemini!',
    };
  }

  if (externalSignal?.aborted) {
    return {
      success: false,
      explanation: '',
      commands: [],
      error: 'Yêu cầu đã bị hủy.',
    };
  }

  // 1. Model ưu tiên (đã nhớ từ lần chạy thành công trước), sau đó là các model dự phòng
  const preferredModel = model ? sanitizeModelName(model) : getCachedModel();
  const modelQueue = [preferredModel, ...VALID_TEXT_MODELS.filter((m) => m !== preferredModel)];
  let curModel = modelQueue[0];
  const endpointFor = (m: string) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;

  const systemInstruction = `
Bạn là Trợ lý Dựng hình Toán học cho hệ thống EduKit Geometry.
Nhiệm vụ: Phân tích bài toán hình học tiếng Việt và xuất ra cấu trúc hình học chuẩn xác dạng JSON (100% tương thích với Canvas).

CẤU TRÚC JSON ĐẦU RA YÊU CẦU:
1. "points": Mảng các điểm toán học (tọa độ Decartes Oxy, hệ đơn vị chuẩn).
   Ví dụ:
   [
     {"name": "O", "x": 0, "y": 0, "label": "O"},
     {"name": "M", "x": 6, "y": 0, "label": "M"},
     {"name": "A", "x": 0, "y": 3, "label": "A"}
   ]

2. "circles": Mảng các đường tròn (tâm và bán kính r).
   Ví dụ:
   [
     {"name": "c1", "center": "O", "r": 3}
   ]

3. "segments": Mảng các đoạn thẳng kết nối giữa 2 điểm (theo tên điểm).
   Ví dụ:
   [
     {"from": "O", "to": "M", "dashed": true},
     {"from": "A", "to": "B", "dashed": false}
   ]

4. "polygons": Mảng các đa giác / tam giác (danh sách tên các đỉnh).
   Ví dụ:
   [
     {"vertices": ["A", "B", "C"]}
   ]

5. "commands": Các lệnh dựng hình giải tích bổ trợ (nếu có các yếu tố hình học giải tích cần tính toán chính xác):
   - {"cmd": "TANGENTS", "from": "M", "circle": "c1", "names": ["A", "B"]} (Tự động tính 2 tiếp điểm A, B, vẽ 2 tiếp tuyến MA, MB, bán kính OA, OB và góc vuông)
   - {"cmd": "DIAMETER", "circle": "c1", "through": "A", "otherEnd": "C"} (Đường kính AC qua tâm O)
   - {"cmd": "MIDPOINT", "of": ["A", "B"], "name": "I"} (Trung điểm I của AB)
   - {"cmd": "PERPENDICULAR", "from": "A", "to": ["B", "C"], "foot": "H"} (Chân đường cao H hạ từ A xuống BC)
   - {"cmd": "INTERSECT", "obj1": ["A", "B"], "obj2": ["C", "D"], "name": "E"} (Giao điểm E của AB và CD)
   - {"cmd": "TRIANGLE", "names": ["A", "B", "C"], "type": "right_at_A", "ab": 3, "ac": 4} (Tam giác vuông tại A)

QUY TẮC BẮT BUỘC:
- Đặt tên các điểm bằng chữ cái in hoa (A, B, C, M, N, O, ...).
- MỌI điểm gốc xuất hiện trong "segments", "polygons" hoặc "commands" PHẢI có trong "points" kèm tọa độ x, y cụ thể.
  Chỉ được bỏ qua các điểm do "commands" tự tính ra (chân đường cao "foot", trung điểm, giao điểm, tiếp điểm, đầu kia đường kính).
- Chọn tọa độ đúng với giả thiết đề bài (vuông tại A, cân tại A, độ dài cạnh, điểm nằm trên đường tròn...) và có dáng tổng quát, dễ nhìn.
- Điểm nằm trên đường tròn tâm O bán kính R phải có khoảng cách tới O đúng bằng R.
- MỖI yếu tố đề bài nêu ra PHẢI có lệnh tương ứng trong "commands" (không được chỉ nhắc trong "reasoning"):
  đường cao → PERPENDICULAR; trung điểm → MIDPOINT; giao điểm / "cắt nhau tại" / "đồng quy tại" → INTERSECT;
  tiếp tuyến → TANGENTS; đường kính → DIAMETER. Trước khi trả lời, đối chiếu lại đề bài để không bỏ sót yếu tố nào.

VÍ DỤ ĐẦY ĐỦ — Đề: "Cho tam giác ABC nhọn, đường cao AH. Gọi M là trung điểm BC."
{
  "reasoning": "Đặt B, C trên trục hoành, A phía trên để tam giác nhọn. H là chân đường cao từ A xuống BC, M là trung điểm BC.",
  "points": [
    {"name": "A", "x": 1, "y": 4},
    {"name": "B", "x": -3, "y": 0},
    {"name": "C", "x": 4, "y": 0}
  ],
  "commands": [
    {"cmd": "PERPENDICULAR", "from": "A", "to": ["B", "C"], "foot": "H"},
    {"cmd": "MIDPOINT", "of": ["B", "C"], "name": "M"}
  ],
  "polygons": [{"vertices": ["A", "B", "C"]}],
  "segments": [{"from": "A", "to": "M", "dashed": true}],
  "explanation": "Tam giác ABC nhọn với đường cao AH và trung điểm M của BC."
}

VÍ DỤ 2 — Đề: "Cho tam giác ABC nhọn nội tiếp đường tròn (O). Các đường cao AD, BE, CF cắt nhau tại H."
{
  "reasoning": "A, B, C nằm trên đường tròn tâm O bán kính 4 (tọa độ 4cos, 4sin). Ba đường cao dựng bằng PERPENDICULAR, trực tâm H là giao của AD và BE.",
  "points": [
    {"name": "O", "x": 0, "y": 0},
    {"name": "A", "x": 1.035, "y": 3.864},
    {"name": "B", "x": -3.759, "y": -1.368},
    {"name": "C", "x": 3.464, "y": -2}
  ],
  "circles": [{"name": "c1", "center": "O", "r": 4}],
  "commands": [
    {"cmd": "PERPENDICULAR", "from": "A", "to": ["B", "C"], "foot": "D"},
    {"cmd": "PERPENDICULAR", "from": "B", "to": ["A", "C"], "foot": "E"},
    {"cmd": "PERPENDICULAR", "from": "C", "to": ["A", "B"], "foot": "F"},
    {"cmd": "INTERSECT", "obj1": ["A", "D"], "obj2": ["B", "E"], "name": "H"}
  ],
  "polygons": [{"vertices": ["A", "B", "C"]}],
  "segments": [],
  "explanation": "Tam giác ABC nhọn nội tiếp (O), ba đường cao AD, BE, CF đồng quy tại trực tâm H."
}
`;

  let lastActualError = '';
  let useThinking = true;

  // 3. ĐẶT TIMEOUT 25 GIÂY VÀ TRUYỀN SIGNAL THỰC SỰ ĐỂ HỦY KẾT NỐI MẠNG
  const controller = new AbortController();
  const internalTimeout = setTimeout(() => {
    controller.abort();
  }, 25000);

  // Liên kết signal bên ngoài từ UI
  const onExternalAbort = () => {
    controller.abort();
  };
  if (externalSignal) {
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    // 2. Cấu hình theo tài liệu Gemini 3.x: dùng thinkingLevel thay cho thinkingBudget,
    //    không gửi temperature/topP/topK (đã bị loại bỏ ở Gemini 3.8).
    //    maxOutputTokens đủ lớn vì token suy nghĩ cũng tính vào giới hạn đầu ra.
    const generationConfig: any = {
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        // Cho AI suy luận trước, rồi khai báo điểm, sau đó mới tới các đối tượng dùng điểm
        propertyOrdering: ['reasoning', 'points', 'circles', 'commands', 'segments', 'polygons', 'explanation'],
        properties: {
          explanation: {
            type: 'STRING',
            description: 'Mô tả ngắn gọn hình vẽ và các đối tượng chính',
          },
          reasoning: {
            type: 'STRING',
            description: 'Tóm tắt các bước hình học logic cần dựng theo đề bài',
          },
          points: {
            type: 'ARRAY',
            description:
              'BẮT BUỘC: tọa độ Oxy của MỌI điểm gốc dùng trong segments/polygons/commands (chỉ trừ điểm do commands tự tính: chân đường cao, trung điểm, giao điểm, tiếp điểm)',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                x: { type: 'NUMBER' },
                y: { type: 'NUMBER' },
                label: { type: 'STRING' },
              },
              required: ['name', 'x', 'y'],
            },
          },
          circles: {
            type: 'ARRAY',
            description: 'Danh sách các đường tròn (tâm, bán kính r)',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                center: { type: 'STRING' },
                r: { type: 'NUMBER' },
              },
              required: ['center', 'r'],
            },
          },
          segments: {
            type: 'ARRAY',
            description: 'Danh sách các đoạn thẳng kết nối điểm',
            items: {
              type: 'OBJECT',
              properties: {
                from: { type: 'STRING' },
                to: { type: 'STRING' },
                dashed: { type: 'BOOLEAN' },
              },
              required: ['from', 'to'],
            },
          },
          polygons: {
            type: 'ARRAY',
            description: 'Danh sách các đa giác / tam giác theo đỉnh',
            items: {
              type: 'OBJECT',
              properties: {
                vertices: {
                  type: 'ARRAY',
                  items: { type: 'STRING' },
                },
              },
              required: ['vertices'],
            },
          },
          commands: {
            type: 'ARRAY',
            description: 'Danh sách các lệnh dựng hình chuẩn xác bổ trợ',
            items: {
              type: 'OBJECT',
              properties: {
                cmd: { type: 'STRING' },
                name: { type: 'STRING' },
                names: { type: 'ARRAY', items: { type: 'STRING' } },
                x: { type: 'NUMBER' },
                y: { type: 'NUMBER' },
                center: { type: 'STRING' },
                r: { type: 'NUMBER' },
                from: { type: 'STRING' },
                to: { type: 'STRING' },
                circle: { type: 'STRING' },
                through: { type: 'STRING' },
                otherEnd: { type: 'STRING' },
                of: { type: 'ARRAY', items: { type: 'STRING' } },
                foot: { type: 'STRING' },
                obj1: { type: 'ARRAY', items: { type: 'STRING' } },
                obj2: { type: 'ARRAY', items: { type: 'STRING' } },
                type: { type: 'STRING' },
                ab: { type: 'NUMBER' },
                ac: { type: 'NUMBER' },
                bc: { type: 'NUMBER' },
                dashed: { type: 'BOOLEAN' },
              },
              required: ['cmd'],
            },
          },
        },
        required: ['reasoning', 'points', 'commands', 'explanation'],
      },
    };

    if (useThinking) {
      generationConfig.thinkingConfig = { thinkingLevel: 'low' };
    }

    const sendRequest = (m: string) => fetch(endpointFor(m), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Gửi key qua header thay vì URL để key không bị ghi vào log/lịch sử
        'x-goog-api-key': cleanKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${systemInstruction}\n\nĐề bài tập / Yêu cầu vẽ hình học của người dùng:\n"""\n${prompt}\n"""`,
              },
            ],
          },
        ],
        generationConfig,
      }),
      signal: controller.signal,
    });

    let response = await sendRequest(curModel);
    // Model không nhận tham số suy nghĩ (400 INVALID_ARGUMENT) → gửi lại không kèm thinkingConfig
    if (response.status === 400 && generationConfig.thinkingConfig) {
      const errText = await response.clone().text().catch(() => '');
      if (/thinking/i.test(errText)) {
        console.warn(`[Gemini API] ${curModel} không nhận thinkingConfig, gửi lại không kèm tham số này.`);
        delete generationConfig.thinkingConfig;
        response = await sendRequest(curModel);
      }
    }
    // Model không tồn tại (404) → thử model dự phòng tiếp theo
    for (let i = 1; response.status === 404 && i < modelQueue.length; i++) {
      console.warn(`[Gemini API] Model ${curModel} không khả dụng (404), thử ${modelQueue[i]}...`);
      curModel = modelQueue[i];
      response = await sendRequest(curModel);
    }

    clearTimeout(internalTimeout);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }

    // LỖI 429: Tuyệt đối không retry để tránh làm cạn kiệt thêm hạn mức API Key
    if (response.status === 429) {
      const quotaMsg =
        'API Key đang tạm chạm giới hạn lượt gọi/phút của gói miễn phí. Vui lòng đợi khoảng 30–60 giây rồi bấm gửi lại (hoặc dùng các câu lệnh vẽ nhanh như tam giác, tứ giác, hình tròn, đa giác đều không tốn API).';
      console.warn('[Gemini API] HTTP 429 Quota Exceeded.');
      return {
        success: false,
        explanation: '',
        commands: [],
        error: quotaMsg,
      };
    }

    // LỖI 503: Máy chủ quá tải tạm thời
    if (response.status === 503) {
      const overloadMsg =
        'Máy chủ Google đang quá tải tạm thời, vui lòng đợi vài giây rồi thử lại.';
      console.warn('[Gemini API] HTTP 503 Service Unavailable.');
      return {
        success: false,
        explanation: '',
        commands: [],
        error: overloadMsg,
      };
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const rawMsg = errData?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
      console.warn(`[Gemini API] Lỗi từ Google (${curModel}):`, rawMsg);
      if (/credits? (are|is) depleted|prepay|billing/i.test(rawMsg)) {
        return {
          success: false,
          explanation: '',
          commands: [],
          error:
            'Tài khoản Google AI Studio của API Key này đã hết tiền trả trước (prepayment credits), nên Google từ chối yêu cầu. ' +
            'Vào https://aistudio.google.com → Billing để nạp thêm hoặc kiểm tra gói, hoặc dùng API Key của dự án khác. ' +
            'Các lệnh vẽ đơn giản (tam giác, tứ giác, hình vuông, đường tròn...) vẫn vẽ được mà không cần AI.',
        };
      }
      return {
        success: false,
        explanation: '',
        commands: [],
        error: `Lỗi từ Google (${curModel}): ${rawMsg}`,
      };
    }

    const data = await response.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!candidateText) {
      return {
        success: false,
        explanation: '',
        commands: [],
        error: `Model ${curModel} không trả về dữ liệu hình học.`,
      };
    }

    let parsed: any;
    try {
      parsed = extractCleanJson(candidateText);
    } catch (parseErr: any) {
      console.error('JSON parse error from Gemini output:', candidateText, parseErr);
      return {
        success: false,
        explanation: '',
        commands: [],
        error: `Lỗi phân tích cú pháp JSON từ ${curModel}: ${parseErr.message}`,
      };
    }

    // Dựng hình giải tích & Auto-fit trên canvas từ toàn bộ cấu trúc AI trả về (points, circles, segments, commands)
    // Bổ sung các lệnh dựng hình AI bỏ sót (đường cao, trung điểm, giao điểm...) dựa trên đề bài
    const augmented = augmentWithProblemText(parsed, prompt);
    if (augmented.added.length > 0) {
      console.info('[EduKit] Bổ sung lệnh dựng hình từ đề bài:', augmented.added);
      parsed = augmented.data;
    }

    const constructRes = executeConstructionCommands(
      parsed,
      canvasWidth,
      canvasHeight
    );

    if (!constructRes.success || constructRes.elements.length === 0) {
      return {
        success: false,
        explanation: parsed.explanation || '',
        commands: constructRes.executedCommands,
        rawParsedJson: parsed,
        rawText: candidateText,
        elementCount: constructRes.elements.length,
        error: constructRes.error || `Model ${curModel} không xuất ra đối tượng hình học hợp lệ (0 đối tượng).`,
      };
    }

    // Lưu model hợp lệ vào cache
    setCachedModel(curModel);

    return {
      success: true,
      reasoning: parsed.reasoning,
      explanation: parsed.explanation || 'Đã dựng hình học chính xác 100% bằng JavaScript Engine.',
      commands: constructRes.executedCommands,
      constructionCommands: constructRes.constructionCommands,
      constructedElements: constructRes.elements,
      rawParsedJson: parsed,
      elementCount: constructRes.elements.length,
      rawText: candidateText,
      model: curModel,
    };
  } catch (err: any) {
    clearTimeout(internalTimeout);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }

    if (controller.signal.aborted || externalSignal?.aborted || err?.name === 'AbortError') {
      return {
        success: false,
        explanation: '',
        commands: [],
        error: 'Đã quá thời gian chờ (25 giây). Đã tự động hủy kết nối để tránh treo giao diện.',
      };
    }

    console.error(`Gemini API Exception with model ${curModel}:`, err);
    lastActualError = `Lỗi kết nối Gemini API (${curModel}): ${err.message || 'Không thể gửi yêu cầu'}`;
    return {
      success: false,
      explanation: '',
      commands: [],
      error: lastActualError,
    };
  }
}
