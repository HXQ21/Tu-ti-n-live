import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { WebSocket } from 'ws';
import {
  connectTikTok,
  createApp,
  loadConfig,
  normalizeTikTokEvent,
  normalizeTikTokUsername,
  openStore,
  simEvents,
} from '../server/server.js';

const config = loadConfig();
const BIG_ID = '7234567890123456789';
const user = { id: BIG_ID, nickname: 'Lâm Động', avatarThumb: { urlList: ['http://a/b.jpg'] } };

let dir;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'tmvd-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ---------- Chuẩn hóa ----------

test('giữ nguyên userId 19 chữ số dạng chuỗi', () => {
  const event = normalizeTikTokEvent('chat', { user, content: 'tu luyện', common: { msgId: 'm1' } });
  assert.deepEqual(event, {
    type: 'chat',
    user: { id: BIG_ID, name: 'Lâm Động', avatar: 'http://a/b.jpg' },
    msgId: 'm1',
    text: 'tu luyện',
  });
});

test('bỏ sự kiện không có người gửi', () => {
  assert.equal(normalizeTikTokEvent('chat', { content: 'x' }), null);
  assert.equal(normalizeTikTokEvent('chat', { user: { id: '0' }, content: 'x' }), null);
});

test('đọc đúng số tim và quà, repeatEnd dạng số', () => {
  assert.equal(normalizeTikTokEvent('like', { user, count: 15 }).count, 15);
  const gift = normalizeTikTokEvent('gift', {
    user,
    giftId: '5655',
    groupId: 'g1',
    repeatCount: 7,
    repeatEnd: 1,
    gift: { name: 'Rose', diamondCount: 1, type: 1 },
  });
  assert.equal(gift.giftId, '5655');
  assert.equal(gift.diamonds, 1);
  assert.equal(gift.combo, true);
  assert.equal(gift.repeatCount, 7);
  assert.equal(gift.repeatEnd, true);
  assert.equal(normalizeTikTokEvent('gift', { user, repeatEnd: 0, gift: { type: 1 } }).repeatEnd, false);
});

test('đọc được cả tên trường theo README', () => {
  const event = normalizeTikTokEvent('gift', {
    user: { userId: BIG_ID, uniqueId: 'lamdong' },
    giftId: 5655,
    repeatCount: 1,
    giftDetails: { giftName: 'Rose', diamondCount: 1, giftType: 1 },
  });
  assert.equal(event.user.id, BIG_ID);
  assert.equal(event.user.name, 'lamdong');
  assert.equal(event.giftId, '5655');
  assert.equal(event.combo, true);
  assert.equal(normalizeTikTokEvent('chat', { user, comment: 'hi' }).text, 'hi');
});

// ---------- Giả lập ----------

test('giả lập quà combo: chỉ một sự kiện kết thúc, mang số lượng cuối', () => {
  const events = simEvents({ action: 'gift', name: 'A', diamonds: 1, count: 20, combo: true }, config);
  const ended = events.filter((e) => e.repeatEnd);
  assert.equal(ended.length, 1);
  assert.equal(ended[0].repeatCount, 20);
  assert.equal(events.at(-1), ended[0]);
  assert.equal(new Set(events.map((e) => e.groupId)).size, 1);
});

test('giả lập quà đặc biệt dùng đúng giftId trong config', () => {
  const [donut] = simEvents({ action: 'gift', name: 'A', diamonds: 30 }, config);
  assert.equal(donut.giftId, String(config.gifts.washMarrow.giftIds[0]));
  assert.equal(donut.giftName, 'Donut');
  assert.equal(donut.combo, false);
});

test('giả lập từ chối hành động lạ', () => {
  assert.equal(simEvents({ action: 'xoa-het' }, config), null);
});

// ---------- SQLite ----------

test('lưu rồi mở lại vẫn còn dữ liệu, ghi đè đúng người', () => {
  const file = path.join(dir, 'sub', 'game.db');
  const first = openStore(file);
  first.save({ players: [{ id: BIG_ID, total: 1 }], meta: { session: 'r1' } });
  first.save({ players: [{ id: BIG_ID, total: 2 }], meta: {} });
  first.close();

  const second = openStore(file);
  assert.deepEqual(second.load(), { players: [{ id: BIG_ID, total: 2 }], meta: { session: 'r1' } });
  second.close();
});

// ---------- Kết nối TikTok ----------

function fakeConnector(behaviours) {
  const created = [];
  class TikTokLiveConnection extends EventEmitter {
    constructor(username, options) {
      super();
      this.username = username;
      this.options = options;
      created.push(this);
    }
    async connect() {
      const next = behaviours.shift();
      if (next instanceof Error) throw next;
      return { roomId: next };
    }
    async disconnect() {}
  }
  const module = {
    TikTokLiveConnection,
    WebcastEvent: { CHAT: 'chat', LIKE: 'like', GIFT: 'gift', SHARE: 'share', FOLLOW: 'follow' },
    ControlEvent: { DISCONNECTED: 'disconnected', ERROR: 'error' },
  };
  return { load: async () => module, created };
}

const quiet = { log() {}, warn() {}, error() {} };
const liveConfig = { ...config, tiktok: { username: 'host', signApiKey: '', reconnectSec: 0.01 } };

function waitFor(check, ms = 1000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (check()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > ms) {
        clearInterval(timer);
        reject(new Error('hết thời gian chờ'));
      }
    }, 2);
  });
}

test('không có username thì không kết nối', () => {
  const statuses = [];
  connectTikTok({ config, onEvent() {}, onRoom() {}, onStatus: (s) => statuses.push(s), log: quiet });
  assert.deepEqual(statuses, ['off']);
});

test('tự thử lại khi lỗi và khi mất kết nối', async () => {
  const { load, created } = fakeConnector([new Error('offline'), 'room1', 'room2']);
  const statuses = [];
  const rooms = [];
  const link = connectTikTok({
    config: liveConfig,
    onEvent() {},
    onRoom: (id) => rooms.push(id),
    onStatus: (s) => statuses.push(s),
    loadConnector: load,
    log: quiet,
  });
  await waitFor(() => rooms.length === 1);
  assert.equal(created[1].options.processInitialData, false);

  created[1].emit('disconnected');
  await waitFor(() => rooms.length === 2);
  link.stop();

  assert.deepEqual(rooms, ['room1', 'room2']);
  assert.equal(statuses.at(-1), 'connected');
  assert.ok(statuses.includes('disconnected'));
});

test('bỏ tin trùng msgId khi kết nối lại', async () => {
  const { load, created } = fakeConnector(['room1']);
  const events = [];
  const rooms = [];
  const link = connectTikTok({
    config: liveConfig,
    onEvent: (e) => events.push(e),
    onRoom: (id) => rooms.push(id),
    onStatus() {},
    loadConnector: load,
    log: quiet,
  });
  await waitFor(() => rooms.length === 1);
  const message = { user, content: 'a', common: { msgId: 'same' } };
  created[0].emit('chat', message);
  created[0].emit('chat', message);
  link.stop();
  assert.equal(events.length, 1);
});

test('sau khi dừng không thử lại nữa', async () => {
  const { load, created } = fakeConnector([new Error('offline'), 'room1']);
  const link = connectTikTok({
    config: liveConfig,
    onEvent() {},
    onRoom() {},
    onStatus() {},
    loadConnector: load,
    log: quiet,
  });
  link.stop();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(created.length <= 1);
});

// ---------- Ứng dụng đầy đủ ----------

function openClient(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const messages = [];
  ws.on('message', (data) => messages.push(JSON.parse(data)));
  return { ws, messages };
}

function postSim(port, body) {
  return fetch(`http://127.0.0.1:${port}/api/sim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('giả lập đi qua máy chủ tới WebSocket, không lộ API key, khởi động lại vẫn còn dữ liệu', async () => {
  const dbPath = path.join(dir, 'game.db');
  const secretConfig = { ...config, tiktok: { username: '', signApiKey: 'BI-MAT', reconnectSec: 10 } };

  const app = createApp({ config: secretConfig, dbPath, log: quiet });
  const port = await app.start(0);
  const { ws, messages } = openClient(port);
  await waitFor(() => messages.some((m) => m.t === 'hello'));

  const hello = messages.find((m) => m.t === 'hello');
  assert.equal(hello.tiktok, 'off');
  assert.ok(!JSON.stringify(hello).includes('BI-MAT'));

  assert.equal((await postSim(port, { action: 'chat', name: 'Lâm', text: 'tu luyện' })).status, 200);
  assert.equal((await postSim(port, { action: 'bots' })).status, 200);
  await waitFor(() => messages.filter((m) => m.t === 'event').length === 51);
  assert.equal(messages.find((m) => m.t === 'event').event.user.id, 'sim:Lâm');

  ws.terminate();
  await app.stop();

  const again = createApp({ config: secretConfig, dbPath, log: quiet });
  assert.equal(again.game.snapshot().totalPlayers, 51);
  await again.stop();
});

test('chuẩn hóa ID TikTok: bỏ @, nhận link, từ chối ký tự lạ', () => {
  assert.equal(normalizeTikTokUsername('  @Lam.Dong_99 '), 'Lam.Dong_99');
  assert.equal(normalizeTikTokUsername('https://www.tiktok.com/@lam.dong/live?lang=vi'), 'lam.dong');
  assert.equal(normalizeTikTokUsername(''), '');
  assert.equal(normalizeTikTokUsername('   '), '');
  assert.equal(normalizeTikTokUsername('lâm động'), null);
  assert.equal(normalizeTikTokUsername('a'.repeat(25)), null);
  assert.equal(normalizeTikTokUsername(42), null);
});

test('điền ID TikTok từ bảng điều khiển: kết nối phòng mới, lưu vào config.json, xóa thì tắt', async () => {
  const dbPath = path.join(dir, 'game.db');
  const configPath = path.join(dir, 'config.json');
  writeFileSync(configPath, '{\n  "tiktok": { "username": "", "signApiKey": "BI-MAT", "reconnectSec": 10 },\n  "x": 1\n}\n');
  const { load, created } = fakeConnector(['room1']);
  const appConfig = { ...config, tiktok: { username: '', signApiKey: 'BI-MAT', reconnectSec: 10 } };
  const app = createApp({ config: appConfig, dbPath, configPath, loadConnector: load, log: quiet });
  const port = await app.start(0);
  const { ws, messages } = openClient(port);
  await waitFor(() => messages.some((m) => m.t === 'hello'));
  assert.equal(messages.find((m) => m.t === 'hello').tiktokUser, '');

  assert.equal((await postSim(port, { action: 'tiktok', username: 'lâm động' })).status, 400);
  assert.equal(created.length, 0);

  assert.equal((await postSim(port, { action: 'tiktok', username: '@chu.phong' })).status, 200);
  await waitFor(() => messages.some((m) => m.t === 'tiktok' && m.status === 'connected'));
  assert.equal(created.length, 1);
  assert.equal(created[0].username, 'chu.phong');
  assert.equal(messages.findLast((m) => m.t === 'tiktok').user, 'chu.phong');
  assert.ok(app.game.ctx.session.active);

  const saved = readFileSync(configPath, 'utf8');
  assert.equal(JSON.parse(saved).tiktok.username, 'chu.phong');
  assert.equal(JSON.parse(saved).tiktok.signApiKey, 'BI-MAT');
  assert.ok(saved.includes('"x": 1'), 'giữ nguyên phần còn lại của file');

  assert.equal((await postSim(port, { action: 'tiktok', username: '' })).status, 200);
  await waitFor(() => messages.findLast((m) => m.t === 'tiktok').status === 'off');
  assert.equal(JSON.parse(readFileSync(configPath, 'utf8')).tiktok.username, '');

  ws.terminate();
  await app.stop();
});

test('bật tắt âm thanh: phát tới giao diện, khởi động lại vẫn giữ', async () => {
  const dbPath = path.join(dir, 'game.db');
  const publicDir = path.join(dir, 'public');
  mkdirSync(publicDir);

  const app = createApp({ config, dbPath, publicDir, log: quiet });
  const port = await app.start(0);
  const { ws, messages } = openClient(port);
  await waitFor(() => messages.some((m) => m.t === 'hello'));
  const hello = messages.find((m) => m.t === 'hello');
  assert.deepEqual(hello.audio, { bell: true, thunder: true, drum: true, bgm: true, voice: true, welcome: true, thanks: true });
  assert.equal(hello.hasBgm, false);

  assert.equal((await postSim(port, { action: 'audio', kind: 'bgm', on: false })).status, 200);
  await waitFor(() => messages.some((m) => m.t === 'audio'));
  assert.deepEqual(messages.find((m) => m.t === 'audio').audio, { bell: true, thunder: true, drum: true, bgm: false, voice: true, welcome: true, thanks: true });
  assert.equal((await postSim(port, { action: 'audio', kind: 'xoa-het', on: false })).status, 400);

  assert.equal((await postSim(port, { action: 'audioTest', kind: 'thunder' })).status, 200);
  await waitFor(() => messages.some((m) => m.t === 'audioTest' && m.kind === 'thunder'));
  assert.equal((await postSim(port, { action: 'audioTest', kind: 'bgm' })).status, 400);

  ws.terminate();
  await app.stop();

  mkdirSync(path.join(publicDir, 'sounds'));
  writeFileSync(path.join(publicDir, 'sounds', 'bgm.mp3'), 'x');
  const again = createApp({ config, dbPath, publicDir, log: quiet });
  const portAgain = await again.start(0);
  const second = openClient(portAgain);
  await waitFor(() => second.messages.some((m) => m.t === 'hello'));
  const helloAgain = second.messages.find((m) => m.t === 'hello');
  assert.deepEqual(helloAgain.audio, { bell: true, thunder: true, drum: true, bgm: false, voice: true, welcome: true, thanks: true });
  assert.equal(helloAgain.hasBgm, true);
  second.ws.terminate();
  await again.stop();
});

test('bảng quản trị: bắt đầu, kết thúc phiên và lưu lịch sử phiên', async () => {
  const dbPath = path.join(dir, 'game.db');
  const app = createApp({ config, dbPath, log: quiet });
  const port = await app.start(0);
  assert.equal((await postSim(port, { action: 'startSession' })).status, 200);
  assert.equal(app.game.ctx.session.active, true);
  assert.equal((await postSim(port, { action: 'startSession' })).status, 400, 'đang có phiên');
  await postSim(port, { action: 'gift', name: 'Lâm', diamonds: 5, count: 1 });
  for (const action of ['pause', 'newDay', 'newWeek', 'rain']) {
    assert.equal((await postSim(port, { action })).status, 200, action);
  }
  assert.equal((await postSim(port, { action: 'endSession' })).status, 200);
  const sessions = await (await fetch(`http://127.0.0.1:${port}/api/sessions`)).json();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].top[0].name, 'Lâm');
  await app.stop();
});

test('tải ảnh đại diện về máy chủ và phục vụ lại, dùng được khi link gốc hết hạn', async () => {
  const dbPath = path.join(dir, 'game.db');
  const fetchImpl = async () => new Response(Buffer.from('JPEGDATA'), { headers: { 'content-type': 'image/jpeg' } });
  const app = createApp({ config, dbPath, fetchImpl, log: quiet });
  const port = await app.start(0);
  app.game.handleEvent({ type: 'like', user: { id: BIG_ID, name: 'Lâm', avatar: 'https://cdn/a.jpg' }, count: 1 });
  // Sự kiện đi qua handleEvent của máy chủ mới kích hoạt tải ảnh.
  await postSim(port, { action: 'like', name: 'Lâm', count: 1 });
  app.avatars.want(BIG_ID, 'https://cdn/a.jpg');
  await waitFor(() => app.game.view(BIG_ID).avatar.startsWith('avatars/'));
  const url = app.game.view(BIG_ID).avatar.split('?')[0];
  const res = await fetch(`http://127.0.0.1:${port}/${url}`);
  assert.equal(await res.text(), 'JPEGDATA');
  await app.stop();
});

test('trùng cổng: báo lỗi EADDRINUSE để hiện thông báo dễ hiểu, không làm sập chương trình', async () => {
  const first = createApp({ config, dbPath: path.join(dir, 'a.db'), log: quiet });
  const port = await first.start(0);
  const second = createApp({ config, dbPath: path.join(dir, 'b.db'), log: quiet });
  await assert.rejects(second.start(port), { code: 'EADDRINUSE' });
  await second.stop();
  await first.stop();
});

test('người xem vào phòng từ TikTok được chuẩn hóa thành sự kiện member', () => {
  assert.deepEqual(normalizeTikTokEvent('member', { user, common: { msgId: 'v1' } }), {
    type: 'member',
    user: { id: BIG_ID, name: 'Lâm Động', avatar: 'http://a/b.jpg' },
    msgId: 'v1',
  });
});

test('giọng chào và cảm ơn: phát tới màn LIVE, không chào người ảo, tắt công tắc thì im', async () => {
  const dbPath = path.join(dir, 'game.db');
  const asked = [];
  const ttsFetch = async (url) => {
    asked.push(new URL(url).searchParams.get('q'));
    return new Response(Buffer.from('MP3DATA'), { headers: { 'content-type': 'audio/mpeg' } });
  };
  const app = createApp({ config, dbPath, ttsFetch, log: quiet });
  const port = await app.start(0);
  const { ws, messages } = openClient(port);
  await waitFor(() => messages.some((m) => m.t === 'hello'));

  await postSim(port, { action: 'bots' });
  await postSim(port, { action: 'member', name: 'Minh' });
  await waitFor(() => messages.some((m) => m.t === 'speak'));
  const welcome = messages.find((m) => m.t === 'speak');
  assert.equal(welcome.kind, 'welcome');
  assert.deepEqual(asked, ['Chào mừng đệ tử Minh đã đến với Tiên Môn Vấn Đạo']);
  const res = await fetch(`http://127.0.0.1:${port}/${welcome.url}`);
  assert.equal(res.headers.get('content-type'), 'audio/mpeg');
  assert.equal(await res.text(), 'MP3DATA');
  assert.equal((await fetch(`http://127.0.0.1:${port}/tts/..%2Fgame.db`)).status, 404);

  await postSim(port, { action: 'gift', name: 'Minh', diamonds: 1, count: 20, combo: true });
  await waitFor(() => messages.filter((m) => m.t === 'speak').length === 2);
  assert.equal(asked[1], 'Cảm ơn đệ tử Minh đã cống hiến 20 Hoa hồng cho tông môn');

  await postSim(port, { action: 'audio', kind: 'thanks', on: false });
  await postSim(port, { action: 'gift', name: 'Lan', diamonds: 5, count: 1 });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(asked.length, 2);

  ws.terminate();
  await app.stop();
});

test('API giả lập từ chối yêu cầu sai', async () => {
  const app = createApp({ config, dbPath: path.join(dir, 'game.db'), log: quiet });
  const port = await app.start(0);
  const url = `http://127.0.0.1:${port}/api/sim`;

  assert.equal((await fetch(url)).status, 405);
  assert.equal((await fetch(url, { method: 'POST', body: '{}', headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await fetch(url, { method: 'POST', body: 'hỏng', headers: { 'Content-Type': 'application/json' } })).status, 400);
  assert.equal((await postSim(port, { action: 'xoa-het' })).status, 400);

  await app.stop();
});

test('chỉ phục vụ file trong thư mục public', async () => {
  const publicDir = path.join(dir, 'public');
  mkdirSync(publicDir);
  writeFileSync(path.join(publicDir, 'sim.html'), 'trang sim');
  writeFileSync(path.join(dir, 'secret.txt'), 'bí mật');

  const app = createApp({ config, dbPath: path.join(dir, 'game.db'), publicDir, log: quiet });
  const port = await app.start(0);
  const get = (p) => fetch(`http://127.0.0.1:${port}${p}`);

  assert.equal(await (await get('/sim')).text(), 'trang sim');
  assert.equal((await get('/khong-co.html')).status, 404);
  assert.equal((await get('/%2e%2e/secret.txt')).status, 404);
  assert.equal((await get('/%E0%A4%A')).status, 404);

  await app.stop();
});
