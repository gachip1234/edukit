/**
 * Chuẩn hoá văn bản nhận dạng giọng nói tiếng Việt thành câu lệnh hình học:
 *  - "tam giác a b c"      -> "tam giác ABC"
 *  - "tam giác bê xê đê"   -> "tam giác BCD"
 *  - "đường tròn tâm o"    -> "đường tròn tâm O"
 *  - "đoạn thẳng ab"       -> "đoạn thẳng AB"
 */

// Tên chữ cái đọc theo tiếng Việt (cả kiểu "bê" và kiểu "bờ")
const LETTER_NAMES: Record<string, string> = {
  a: 'A', 'á': 'A', 'ây': 'A',
  b: 'B', 'bê': 'B', 'bờ': 'B', 'bi': 'B',
  c: 'C', 'xê': 'C', 'cờ': 'C', 'xi': 'C', 'si': 'C',
  d: 'D', 'đê': 'D', 'dê': 'D', 'dờ': 'D', 'đi': 'D',
  e: 'E', 'ê': 'E', 'i': 'I',
  f: 'F', 'ép': 'F', 'ếp': 'F', 'phờ': 'F',
  g: 'G', 'giê': 'G', 'gờ': 'G', 'gi': 'G',
  h: 'H', 'hát': 'H', 'hờ': 'H', 'hắt': 'H', 'ếch': 'H',
  j: 'J', 'gi-': 'J',
  k: 'K', 'ca': 'K', 'ka': 'K', 'cà': 'K',
  l: 'L', 'lờ': 'L', 'eo': 'L', 'e-lờ': 'L',
  m: 'M', 'em': 'M', 'mờ': 'M', 'ờm': 'M',
  n: 'N', 'en': 'N', 'nờ': 'N', 'anh': 'N',
  o: 'O', 'ô': 'O', 'ơ': 'O', 'ổ': 'O',
  p: 'P', 'pê': 'P', 'pờ': 'P', 'pi': 'P',
  q: 'Q', 'quy': 'Q', 'cu': 'Q', 'qu': 'Q',
  r: 'R', 'rờ': 'R', 'e-rờ': 'R',
  s: 'S', 'ét': 'S', 'sờ': 'S', 'ét-xì': 'S',
  t: 'T', 'tê': 'T', 'tờ': 'T', 'ti': 'T',
  u: 'U', 'ư': 'U',
  v: 'V', 'vê': 'V', 'vờ': 'V',
  w: 'W',
  x: 'X', 'ích': 'X', 'ích-xì': 'X', 'xờ': 'X', 'ít': 'X',
  y: 'Y', 'i-dài': 'Y', 'y-dài': 'Y', 'quai': 'Y',
  z: 'Z', 'dét': 'Z', 'zét': 'Z',
};

// Những từ đứng ngay trước tên điểm/hình
const KEYWORDS = [
  'tam giác', 'tứ giác', 'đa giác', 'ngũ giác', 'lục giác',
  'hình vuông', 'hình chữ nhật', 'hình bình hành', 'hình thoi', 'hình thang',
  'đoạn thẳng', 'đoạn', 'đường thẳng', 'đường kính', 'bán kính', 'dây',
  'tia đối', 'tia', 'góc', 'điểm', 'tâm', 'trung điểm', 'tại', 'từ', 'của', 'cắt',
  'tiếp tuyến', 'cát tuyến', 'phân giác', 'đường cao', 'trung tuyến', 'trung trực',
  'vuông góc với', 'song song với', 'đường tròn', 'và', 'là', 'kẻ', 'nối', 'gọi', 'với',
  'đều', 'vuông', 'cân', 'nhọn', 'tù', 'ngoại tiếp', 'nội tiếp',
];

const isWordChar = (ch: string) => /[\p{L}\p{N}]/u.test(ch);

function letterOf(token: string): string | null {
  const t = token.toLowerCase();
  if (LETTER_NAMES[t]) return LETTER_NAMES[t];
  return null;
}

// Âm tiết tiếng Việt không dấu (vd: "tia", "trung", "hai", "an") — không phải tên điểm
const VI_SYLLABLE = /^(ngh|ng|nh|ch|gh|gi|kh|ph|qu|th|tr|[bcdghklmnprstvx])?[aeiouy]{1,3}(ng|nh|ch|[cmnptoiuy])?$/;

/** "abc"/"ah"/"ox" (2–5 chữ cái Latin) -> "ABC"; bỏ qua từ tiếng Việt không dấu */
function compactName(token: string): string | null {
  if (!/^[a-zA-Z]{2,5}$/.test(token)) return null;
  if (token === token.toUpperCase()) return token;
  if (VI_SYLLABLE.test(token.toLowerCase())) return null;
  return token.toUpperCase();
}

export function normalizeSpokenGeometry(input: string): string {
  let text = input.replace(/\s+/g, ' ').trim();
  if (!text) return text;

  // Ghép các tên chữ cái nhiều âm tiết thành một token
  text = text
    .replace(/\bích xì\b/gi, 'ích-xì')
    .replace(/\bét xì\b/gi, 'ét-xì')
    .replace(/\bi dài\b/gi, 'i-dài')
    .replace(/\by dài\b/gi, 'y-dài')
    .replace(/\be lờ\b/gi, 'e-lờ')
    .replace(/\be rờ\b/gi, 'e-rờ')
    .replace(/\bphẩy\b|\bphảy\b/gi, "'");

  const tokens = text.split(' ');
  const out: string[] = [];
  const lower = tokens.map((t) => t.toLowerCase());

  let i = 0;
  while (i < tokens.length) {
    // Kiểm tra xem các token phía trước có kết thúc bằng một từ khoá không
    const prev = out.join(' ').toLowerCase();
    const afterKeyword = KEYWORDS.some((k) => prev.endsWith(k) && (prev.length === k.length || !isWordChar(prev[prev.length - k.length - 1])));

    if (afterKeyword) {
      // Gom một dãy chữ cái liên tiếp
      const letters: string[] = [];
      let j = i;
      while (j < tokens.length && letters.length < 6) {
        const raw = tokens[j].replace(/[.,;:!?]+$/, '');
        const punct = tokens[j].slice(raw.length);
        const l = letterOf(raw) ?? (letters.length === 0 ? compactName(raw) : null);
        if (!l) break;
        letters.push(l);
        j++;
        if (punct) break;
        // Nếu token là tên ghép sẵn (ABC) thì dừng
        if (l.length > 1) break;
        // Dấu phẩy (') đi kèm
        if (lower[j] === "'") { letters[letters.length - 1] += "'"; j++; }
      }
      if (letters.length > 0) {
        // "hai tiếp tuyến em a em bê" -> "MA, MB"
        const recent = out.slice(-4).join(' ').toLowerCase();
        if (letters.length === 4 && letters.every((l) => l.length === 1) && /\bhai\b/.test(recent)) {
          letters.splice(0, 4, letters[0] + letters[1] + ', ' + letters[2] + letters[3]);
        }
        // Tia Ox, đường thẳng xy: x, y, z viết thường theo quy ước
        const joined = letters.join('');
        if (/^[XYZ][A-Z][XYZ]$/.test(joined)) {
          // góc xOy
          letters.splice(0, letters.length, joined[0].toLowerCase() + joined[1] + joined[2].toLowerCase());
        } else if (letters.length === 2 && letters.every((l) => l.length === 1) && /(tại|tại hai điểm|tại 2 điểm)$/.test(prev)) {
          letters.splice(0, 2, letters[0] + ' và ' + letters[1]);
        } else if (/^[XYZ][XYZ]'?$/.test(joined)) {
          letters.splice(0, letters.length, joined.toLowerCase());
        } else if (/^[A-Z][XYZ]'?$/.test(joined) && /(tia|tia đối|của tia)$/.test(prev)) {
          letters.splice(0, letters.length, joined[0] + joined.slice(1).toLowerCase());
        }
        const trailing = tokens[j - 1].match(/[.,;:!?]+$/)?.[0] ?? '';
        out.push(letters.join('') + trailing);
        i = j;
        continue;
      }
    }
    out.push(tokens[i]);
    i++;
  }

  let result = out.join(' ').replace(/ '/g, "'");
  // Viết hoa chữ đầu câu
  result = result.charAt(0).toUpperCase() + result.slice(1);
  return result;
}
