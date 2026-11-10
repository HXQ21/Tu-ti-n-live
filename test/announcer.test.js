import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { cleanName, createAnnouncer, createTts, googleTtsUrl } from '../server/announcer.js';

const announcerConfig = {
  announcer: {
    welcomeText: 'Chào mừng đệ tử {name} đã đến với Tiên Môn Vấn Đạo',
    thanksText: 'Cảm ơn đệ tử {name} đã cống hiến {count} {gift} cho tông môn',
    welcomeGapSec: 5,
    comboWaitSec: 3,
    giftNames: { 5655: 'Hoa hồng' },
  },
};

// Đồng hồ và hẹn giờ giả để kiểm tra khoảng cách giữa các lời chào và combo bị mất tín hiệu kết thúc.
function setup({ on = { welcome: true, thanks: true }, session = 1 } = {}) {
  let clock = 0;
  let timers = [];
  const spoken = [];
  const state = { session, on };
  const announcer = createAnnouncer({
    config: announcerConfig,
    speak: (text, kind) => spoken.push({ text, kind }),
    isOn: (kind) => state.on[kind],
    sessionKey: () => state.session,
    now: () => clock,
    setTimer: (fn, ms) => {
      const timer = { fn, at: clock + ms };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      timers = timers.filter((t) => t !== timer);
    },
  });
  const advance = (ms) => {
    clock += ms;
    const due = timers.filter((t) => t.at <= clock);
    timers = timers.filter((t) => t.at > clock);
    due.forEach((t) => t.fn());
  };
  return { announcer, spoken, state, advance, pending: () => timers.length };
}

const member = (id, name) => ({ type: 'member', user: { id, name, avatar: '' }, msgId: null });
const gift = (extra) => ({
  type: 'gift',
  user: { id: 'u1', name: 'Minh', avatar: '' },
  msgId: null,
  giftId: '5655',
  giftName: 'Rose',
  diamonds: 1,
  combo: false,
  repeatCount: 1,
  repeatEnd: false,
  groupId: '',
  ...extra,
});

test('lọc tên: bỏ emoji và ký tự lạ, giữ chữ có dấu, trống thì gọi là đạo hữu', () => {
  assert.equal(cleanName('🌸Lâm  Động✨'), 'Lâm Động');
  assert.equal(cleanName('nguyen_van.a99'), 'nguyen van a99');
  assert.equal(cleanName('🔥🔥'), 'đạo hữu');
  assert.equal(cleanName('a'.repeat(50)).length, 30);
});

test('chào người vào phòng: mỗi người một lần mỗi phiên', () => {
  const { announcer, spoken, state, advance } = setup();
  announcer.handle(member('u1', 'Minh'));
  advance(10_000);
  announcer.handle(member('u1', 'Minh'));
  assert.deepEqual(spoken, [{ text: 'Chào mừng đệ tử Minh đã đến với Tiên Môn Vấn Đạo', kind: 'welcome' }]);

  state.session = 2;
  announcer.handle(member('u1', 'Minh'));
  assert.equal(spoken.length, 2, 'phiên mới thì chào lại');
});

test('chào cách nhau tối thiểu vài giây, người vào lúc chờ thì bỏ qua', () => {
  const { announcer, spoken, advance } = setup();
  announcer.handle(member('u1', 'A'));
  advance(2000);
  announcer.handle(member('u2', 'B'));
  advance(3000);
  announcer.handle(member('u3', 'C'));
  assert.deepEqual(spoken.map((s) => s.text.split(' ')[4]), ['A', 'C']);
});

test('không chào người chơi ảo, không chào khi tắt công tắc', () => {
  const { announcer, spoken, state } = setup();
  announcer.handle(member('bot:7', 'Đạo hữu 7'));
  state.on.welcome = false;
  announcer.handle(member('u1', 'Minh'));
  assert.equal(spoken.length, 0);
});

test('cảm ơn quà thường ngay, dùng tên quà tiếng Việt trong config', () => {
  const { announcer, spoken } = setup();
  announcer.handle(gift({ repeatCount: 2 }));
  announcer.handle(gift({ giftId: '999', giftName: 'Galaxy', repeatCount: 1 }));
  assert.deepEqual(spoken, [
    { text: 'Cảm ơn đệ tử Minh đã cống hiến 2 Hoa hồng cho tông môn', kind: 'thanks' },
    { text: 'Cảm ơn đệ tử Minh đã cống hiến 1 Galaxy cho tông môn', kind: 'thanks' },
  ]);
});

test('combo chỉ cảm ơn một lần với tổng số khi kết thúc', () => {
  const { announcer, spoken, advance, pending } = setup();
  for (let i = 1; i <= 5; i++) announcer.handle(gift({ combo: true, repeatCount: i, groupId: 'g1' }));
  advance(1000);
  assert.equal(spoken.length, 0);
  announcer.handle(gift({ combo: true, repeatCount: 20, repeatEnd: true, groupId: 'g1' }));
  // Tín hiệu đến trễ của combo đã xong không được đọc thêm.
  announcer.handle(gift({ combo: true, repeatCount: 20, groupId: 'g1' }));
  advance(10_000);
  assert.deepEqual(spoken.map((s) => s.text), ['Cảm ơn đệ tử Minh đã cống hiến 20 Hoa hồng cho tông môn']);
  assert.equal(pending(), 0);
});

test('combo mất tín hiệu kết thúc: người tặng ngừng 3 giây thì vẫn cảm ơn với số cuối', () => {
  const { announcer, spoken, advance } = setup();
  announcer.handle(gift({ combo: true, repeatCount: 1, groupId: 'g2' }));
  advance(2000);
  announcer.handle(gift({ combo: true, repeatCount: 7, groupId: 'g2' }));
  advance(2000);
  assert.equal(spoken.length, 0, 'vẫn đang combo');
  advance(1000);
  assert.deepEqual(spoken.map((s) => s.text), ['Cảm ơn đệ tử Minh đã cống hiến 7 Hoa hồng cho tông môn']);
});

test('tắt cảm ơn quà thì không đọc, dừng thì hủy hẹn giờ combo', () => {
  const { announcer, spoken, state, pending } = setup();
  announcer.handle(gift({ combo: true, repeatCount: 1, groupId: 'g3' }));
  announcer.stop();
  assert.equal(pending(), 0);
  state.on.thanks = false;
  announcer.handle(gift({}));
  assert.equal(spoken.length, 0);
});

// ---------- Giọng chị Google ----------

let dir;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'tmvd-tts-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const quiet = { log() {}, warn() {}, error() {} };

test('link Google TTS tiếng Việt, câu quá dài bị cắt còn 200 ký tự', () => {
  const url = new URL(googleTtsUrl('Xin chào'));
  assert.equal(url.hostname, 'translate.google.com');
  assert.equal(url.searchParams.get('tl'), 'vi');
  assert.equal(url.searchParams.get('q'), 'Xin chào');
  assert.equal(new URL(googleTtsUrl('a'.repeat(300))).searchParams.get('q').length, 200);
});

test('tạo giọng một lần rồi dùng lại file đã lưu, gọi trùng lúc chỉ tải một lần', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(Buffer.from('MP3DATA'), { headers: { 'content-type': 'audio/mpeg' } });
  };
  const tts = createTts({ dir, fetchImpl, log: quiet });
  const [a, b] = await Promise.all([tts.get('Xin chào'), tts.get('Xin chào')]);
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{40}\.mp3$/);
  assert.equal(readFileSync(path.join(dir, a), 'utf8'), 'MP3DATA');
  assert.equal(await tts.get('Xin chào'), a);
  assert.equal(calls, 1);

  const again = createTts({ dir, fetchImpl, log: quiet });
  assert.equal(await again.get('Xin chào'), a, 'khởi động lại vẫn dùng file cũ');
  assert.equal(calls, 1);
});

test('Google lỗi hoặc trả về không phải âm thanh thì bỏ qua câu đó', async () => {
  const tts = createTts({ dir, fetchImpl: async () => new Response('chặn', { status: 429 }), log: quiet });
  assert.equal(await tts.get('Xin chào'), null);
  const html = createTts({ dir, fetchImpl: async () => new Response('<html>', { headers: { 'content-type': 'text/html' } }), log: quiet });
  assert.equal(await html.get('Xin chào'), null);
  const down = createTts({ dir, fetchImpl: async () => { throw new Error('mất mạng'); }, log: quiet });
  assert.equal(await down.get('Xin chào'), null);
  assert.equal(existsSync(path.join(dir, 'x')), false);
});
