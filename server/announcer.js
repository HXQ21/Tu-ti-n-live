// Giọng chào người vào phòng và cảm ơn quà, đọc bằng giọng chị Google (Google Dịch).
// announcer quyết định khi nào đọc câu gì; tts tải file mp3 và lưu lại để câu lặp lại không phải tải nữa.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const NAME_MAX = 30;
const TTS_MAX_CHARS = 200; // Google Dịch không đọc câu dài hơn.
const TTS_MAX_BYTES = 1024 * 1024;
const TTS_TIMEOUT_MS = 8000;
const FINISHED_LIMIT = 500;

const DEFAULTS = {
  welcomeText: 'Chào mừng đệ tử {name} đã đến với Tiên Môn Vấn Đạo',
  thanksText: 'Cảm ơn đệ tử {name} đã cống hiến {count} {gift} cho tông môn',
  welcomeGapSec: 5,
  comboWaitSec: 3,
  giftNames: {},
};

// Tên TikTok hay có emoji, ký hiệu: chỉ giữ chữ (kể cả chữ có dấu), số và khoảng trắng để giọng đọc không vấp.
export function cleanName(name) {
  const clean = String(name ?? '')
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
    .trim();
  return clean || 'đạo hữu';
}

const fill = (template, vars) => template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');

export function createAnnouncer({
  config,
  speak,
  isOn,
  sessionKey,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  const settings = { ...DEFAULTS, ...config.announcer };
  const greeted = new Map(); // userId -> phiên đã chào
  let lastWelcomeAt = -Infinity;
  const combos = new Map(); // khóa combo -> { event, timer }
  const finished = new Set(); // groupId combo đã cảm ơn, bỏ tín hiệu đến trễ

  function welcome(user) {
    if (!isOn('welcome') || String(user.id).startsWith('bot:')) return;
    const session = sessionKey();
    if (greeted.get(user.id) === session) return;
    // Phòng đông: người vào lúc đang chờ thì bỏ qua, không dồn lại đọc mãi.
    if (now() - lastWelcomeAt < settings.welcomeGapSec * 1000) return;
    lastWelcomeAt = now();
    greeted.set(user.id, session);
    speak(fill(settings.welcomeText, { name: cleanName(user.name) }), 'welcome');
  }

  function thank(event) {
    if (!isOn('thanks')) return;
    const gift = settings.giftNames[event.giftId] || event.giftName || 'quà';
    speak(fill(settings.thanksText, { name: cleanName(event.user.name), count: event.repeatCount, gift }), 'thanks');
  }

  function finishCombo(key) {
    const entry = combos.get(key);
    if (!entry) return;
    clearTimer(entry.timer);
    combos.delete(key);
    if (entry.event.groupId) {
      finished.add(entry.event.groupId);
      if (finished.size > FINISHED_LIMIT) finished.delete(finished.values().next().value);
    }
    thank(entry.event);
  }

  function gift(event) {
    if (!event.combo) return thank(event);
    if (event.groupId && finished.has(event.groupId)) return undefined;
    const key = event.groupId || `${event.user.id}:${event.giftId}`;
    const entry = combos.get(key);
    if (entry) clearTimer(entry.timer);
    // Đôi khi mất tín hiệu kết thúc combo: người tặng ngừng vài giây thì vẫn cảm ơn với số cuối cùng.
    const timer = setTimer(() => finishCombo(key), settings.comboWaitSec * 1000);
    combos.set(key, { event, timer });
    if (event.repeatEnd) finishCombo(key);
    return undefined;
  }

  return {
    handle(event) {
      if (event.type === 'member') welcome(event.user);
      else if (event.type === 'gift') gift(event);
    },

    stop() {
      for (const { timer } of combos.values()) clearTimer(timer);
      combos.clear();
    },
  };
}

// ---------- Giọng chị Google ----------

export function googleTtsUrl(text) {
  const params = new URLSearchParams({ ie: 'UTF-8', tl: 'vi', client: 'tw-ob', q: String(text).slice(0, TTS_MAX_CHARS) });
  return `https://translate.google.com/translate_tts?${params}`;
}

export const ttsFileName = (text) => `${createHash('sha1').update(String(text)).digest('hex')}.mp3`;

export function createTts({ dir, fetchImpl = fetch, log = console }) {
  mkdirSync(dir, { recursive: true });
  const inflight = new Map(); // tên file -> Promise

  async function download(text, file) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);
    try {
      const res = await fetchImpl(googleTtsUrl(text), {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!String(res.headers.get('content-type') ?? '').startsWith('audio/')) throw new Error('không phải file âm thanh');
      const data = Buffer.from(await res.arrayBuffer());
      if (data.length === 0 || data.length > TTS_MAX_BYTES) throw new Error('file âm thanh rỗng hoặc quá lớn');
      writeFileSync(path.join(dir, file), data);
      return file;
    } catch (err) {
      log.warn(`[giọng đọc] bỏ qua câu "${text}": ${err?.message ?? err}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    // Trả về tên file mp3 trong dir, hoặc null nếu không tạo được giọng.
    get(text) {
      const file = ttsFileName(text);
      if (existsSync(path.join(dir, file))) return Promise.resolve(file);
      if (!inflight.has(file)) {
        inflight.set(file, download(text, file).finally(() => inflight.delete(file)));
      }
      return inflight.get(file);
    },
  };
}
