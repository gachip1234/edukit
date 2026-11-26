/**
 * Danh bạ môn học và công cụ của EduKit.
 * Thêm công cụ mới: (1) khai báo ở TOOLS bên dưới, (2) gắn thành phần giao diện trong src/app/Root.tsx.
 * Trang chủ, trang môn học và ô tìm kiếm tự hiển thị theo danh bạ này.
 */
import toanArt from '../app/art/toan.svg';
import khtnArt from '../app/art/khoa-hoc-tu-nhien.svg';
import tinArt from '../app/art/tin-hoc.svg';
import suArt from '../app/art/lich-su-dia-li.svg';

export type SubjectId = 'toan' | 'khoa-hoc-tu-nhien' | 'tin-hoc' | 'lich-su-dia-li';
export type ToolId = 'hinh-phang' | 'hinh-khong-gian';

export interface Subject {
  id: SubjectId;
  name: string;
  description: string;
  /** Tên các công cụ dự kiến (chưa lập trình) */
  planned: string[];
  art: string;
  /** Lớp Tailwind cho nền hình minh họa, nhãn và mặt sau thẻ */
  tint: string;
  badge: string;
  solid: string;
  solidText: string;
}

export interface ToolInfo {
  id: ToolId;
  subject: SubjectId;
  name: string;
  summary: string;
  description: string;
  isNew?: boolean;
}

export const SUBJECTS: Subject[] = [
  {
    id: 'toan',
    name: 'Toán học',
    description: 'Vẽ hình phẳng và hình không gian, xuất ảnh cho bài giảng.',
    planned: ['Đồ thị hàm số', 'Biểu đồ thống kê'],
    art: toanArt,
    tint: 'bg-[#dbeafe]',
    badge: 'bg-[#dbeafe] text-[#1d4ed8]',
    solid: 'bg-[#1d4ed8]',
    solidText: 'text-[#1d4ed8]',
  },
  {
    id: 'khoa-hoc-tu-nhien',
    name: 'Khoa học tự nhiên',
    description: 'Công cụ trực quan cho Vật lí, Hóa học, Sinh học.',
    planned: ['Sơ đồ mạch điện', 'Mô hình nguyên tử'],
    art: khtnArt,
    tint: 'bg-[#ccfbf1]',
    badge: 'bg-[#ccfbf1] text-[#0f766e]',
    solid: 'bg-[#0f766e]',
    solidText: 'text-[#0f766e]',
  },
  {
    id: 'tin-hoc',
    name: 'Tin học',
    description: 'Công cụ trực quan cho tư duy thuật toán.',
    planned: ['Sơ đồ khối', 'Chạy thử thuật toán'],
    art: tinArt,
    tint: 'bg-[#ede9fe]',
    badge: 'bg-[#ede9fe] text-[#6d28d9]',
    solid: 'bg-[#6d28d9]',
    solidText: 'text-[#6d28d9]',
  },
  {
    id: 'lich-su-dia-li',
    name: 'Lịch sử và Địa lí',
    description: 'Công cụ minh họa thời gian và không gian.',
    planned: ['Dòng thời gian', 'Bản đồ ghi chú'],
    art: suArt,
    tint: 'bg-[#ffedd5]',
    badge: 'bg-[#ffedd5] text-[#9a3412]',
    solid: 'bg-[#9a3412]',
    solidText: 'text-[#9a3412]',
  },
];

export const TOOLS: ToolInfo[] = [
  {
    id: 'hinh-phang',
    subject: 'toan',
    name: 'Hình học phẳng',
    summary: 'Vẽ tay, gõ lệnh, trợ lý AI',
    description: 'Điểm, đoạn, đường tròn, đa giác, ký hiệu góc, công thức LaTeX. Vẽ từ đề bài bằng tiếng Việt.',
  },
  {
    id: 'hinh-khong-gian',
    subject: 'toan',
    name: 'Hình học không gian',
    summary: 'Khối đa diện, nét khuất tự động',
    description: 'Hình hộp, lập phương, lăng trụ, hình chóp. Xoay hình, nét khuất tự chuyển thành nét đứt.',
    isNew: true,
  },
];

export const toolsOf = (subject: SubjectId) => TOOLS.filter((t) => t.subject === subject);
