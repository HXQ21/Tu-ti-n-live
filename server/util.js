// Hàm dùng chung cho lõi game và các module. Không có trạng thái.

export const SEC = 1000;
export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;
const VN_OFFSET = 7 * HOUR;

export function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Số ngày tính theo giờ Việt Nam (UTC+7): đổi ngày lúc 00:00.
export function vnDay(t) {
  return Math.floor((t + VN_OFFSET) / DAY);
}

// Ngày 0 (01/01/1970) là thứ Năm nên cộng 3 để tuần đổi lúc 00:00 thứ Hai.
export function vnWeek(day) {
  return Math.floor((day + 3) / 7);
}

// Số ngày còn lại tới thứ Hai kế tiếp (1..7).
export function daysToMonday(day) {
  return 7 - ((day + 3) % 7);
}

// Định dạng kiểu Việt Nam: 2.990
export function fmt(n) {
  return Math.trunc(Number(n) || 0).toLocaleString('vi-VN');
}

export function shuffle(list, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
