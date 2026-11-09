// Máy chủ HTTP/WebSocket, kết nối TikTok, lưu SQLite, tải ảnh đại diện, bảng quản trị và giả lập.
// Mọi logic tính điểm nằm ở game.js. File này chỉ nhận sự kiện, chuẩn hóa và chuyển tiếp.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { createGame } from './game.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const BOTS_PER_CLICK = 50;
const MAX_SIM_COUNT = 100_000;
const MAX_BODY_BYTES = 64 * 1024;
const SEEN_MSG_LIMIT = 5000;
const TICK_MS = 250;
const TIKTOK_EVENTS = ['chat', 'like', 'gift', 'share', 'follow'];
const AUDIO_KINDS = ['bell', 'thunder', 'drum', 'bgm', 'voice'];
const AUDIO_TEST_KINDS = ['bell', 'thunder', 'drum', 'voice'];
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TIMEOUT_MS = 8000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

export function loadConfig(file = path.join(ROOT, 'config.json')) {
  // Notepad có thể thêm BOM vào đầu file khi lưu.
  return JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
}

// ---------- Chuẩn hóa sự kiện TikTok ----------

// Khóa người chơi là userId dạng chuỗi: số 19 chữ số sẽ mất chính xác nếu ép sang Number.
function normalizeUser(user) {
  const id = String(user?.id ?? user?.userId ?? '');
  if (!id || id === '0') return null;
  return {
    id,
    name: user.nickname || user.uniqueId || user.displayId || 'Đạo hữu ẩn danh',
    avatar: user.avatarThumb?.urlList?.[0] ?? user.profilePicture?.url?.[0] ?? '',
  };
}

// README của thư viện và kiểu dữ liệu thực tế đặt tên trường khác nhau nên đọc cả hai.
export function normalizeTikTokEvent(type, data) {
  const user = normalizeUser(data?.user);
  if (!user) return null;
  const msgId = data.common?.msgId ?? null;

  switch (type) {
    case 'chat':
      return { type, user, msgId, text: String(data.content ?? data.comment ?? '') };
    case 'like':
      return { type, user, msgId, count: Number(data.count ?? data.likeCount ?? 0) };
    case 'gift': {
      const gift = data.gift ?? data.giftDetails ?? {};
      return {
        type,
        user,
        msgId,
        giftId: String(data.giftId ?? gift.id ?? ''),
        giftName: gift.name ?? gift.giftName ?? '',
        diamonds: Number(gift.diamondCount ?? 0),
        combo: (gift.type ?? gift.giftType) === 1,
        repeatCount: Number(data.repeatCount ?? 1),
        // Trường này là số 0/1 trong dữ liệu thật, không phải boolean.
        repeatEnd: Boolean(data.repeatEnd),
        groupId: String(data.groupId ?? ''),
      };
    }
    case 'share':
    case 'follow':
      return { type, user, msgId };
    default:
      return null;
  }
}

// ---------- Kết nối TikTok ----------

const TIKTOK_USERNAME = /^[A-Za-z0-9._]{1,24}$/;

// Nhận "@ten", "ten" hoặc link tiktok.com/@ten/live. Trả '' khi bỏ trống (tắt kết nối), null khi sai.
export function normalizeTikTokUsername(input) {
  if (typeof input !== 'string') return null;
  let name = input.trim();
  if (!name) return '';
  name = name.match(/tiktok\.com\/@([^/?#\s]+)/i)?.[1] ?? name;
  name = name.replace(/^@/, '');
  return TIKTOK_USERNAME.test(name) ? name : null;
}

// Chỉ thay giá trị username, giữ nguyên định dạng và chú thích còn lại của config.json.
function saveTikTokUsername(file, username) {
  const text = readFileSync(file, 'utf8');
  const pattern = /("tiktok"\s*:\s*\{[^}]*?"username"\s*:\s*)"(?:[^"\\]|\\.)*"/;
  if (!pattern.test(text)) throw new Error('không tìm thấy tiktok.username trong config.json');
  writeFileSync(file, text.replace(pattern, (_, head) => head + JSON.stringify(username)));
}

function discard(connection) {
  if (!connection) return;
  connection.removeAllListeners();
  // EventEmitter ném lỗi nếu phát 'error' mà không có listener.
  connection.on('error', () => {});
  Promise.resolve()
    .then(() => connection.disconnect())
    .catch(() => {});
}

export function connectTikTok({
  config,
  onEvent,
  onRoom,
  onStatus,
  loadConnector = () => import('tiktok-live-connector'),
  log = console,
}) {
  const { username, signApiKey, reconnectSec } = config.tiktok;
  if (!username) {
    onStatus('off');
    return { stop() {} };
  }

  let stopped = false;
  let connection = null;
  let timer = null;
  const seen = new Set();

  const forward = (type, data) => {
    const event = normalizeTikTokEvent(type, data);
    if (!event) return;
    if (event.msgId) {
      if (seen.has(event.msgId)) return;
      seen.add(event.msgId);
      if (seen.size > SEEN_MSG_LIMIT) seen.delete(seen.values().next().value);
    }
    if (type === 'gift' && (!event.combo || event.repeatEnd)) {
      // Dùng để đối chiếu giftId trong config.json với quà thật khi live.
      log.log(`[quà] ${event.user.name}: ${event.giftName} id=${event.giftId} xu=${event.diamonds} x${event.repeatCount}`);
    }
    onEvent(event);
  };

  const scheduleRetry = () => {
    if (stopped || timer) return;
    onStatus('disconnected');
    timer = setTimeout(() => {
      timer = null;
      attempt();
    }, reconnectSec * 1000);
  };

  async function attempt() {
    if (stopped) return;
    try {
      const { TikTokLiveConnection, WebcastEvent, ControlEvent } = await loadConnector();
      discard(connection);
      connection = new TikTokLiveConnection(username, {
        // Không nhận lại tin cũ khi kết nối lại, tránh cộng điểm hai lần.
        processInitialData: false,
        ...(signApiKey ? { signApiKey } : {}),
      });
      for (const type of TIKTOK_EVENTS) {
        connection.on(WebcastEvent[type.toUpperCase()], (data) => forward(type, data));
      }
      connection.on(ControlEvent.DISCONNECTED, scheduleRetry);
      connection.on(ControlEvent.ERROR, (err) => log.warn('[tiktok] lỗi:', err?.message ?? err));
      const state = await connection.connect();
      if (stopped) return;
      onRoom(String(state.roomId));
      onStatus('connected');
      log.log(`[tiktok] đã kết nối phòng ${state.roomId}`);
    } catch (err) {
      log.warn(`[tiktok] chưa kết nối được, thử lại sau ${reconnectSec} giây: ${err?.message ?? err}`);
      scheduleRetry();
    }
  }

  onStatus('disconnected');
  attempt();

  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
      discard(connection);
      connection = null;
    },
  };
}

// ---------- SQLite ----------

export function openStore(file) {
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS players (
      user_id    TEXT PRIMARY KEY,
      data       TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id         TEXT PRIMARY KEY,
      started_at INTEGER NOT NULL,
      ended_at   INTEGER NOT NULL,
      data       TEXT NOT NULL
    );
  `);
  const insertSession = db.prepare(`
    INSERT INTO sessions (id, started_at, ended_at, data) VALUES (?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET ended_at = excluded.ended_at, data = excluded.data
  `);
  const upsertPlayer = db.prepare(`
    INSERT INTO players (user_id, data, updated_at) VALUES (?, ?, ?)
    ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `);
  const upsertMeta = db.prepare(`
    INSERT INTO meta (key, value) VALUES (?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value
  `);

  return {
    load() {
      const players = db.prepare('SELECT data FROM players').all().map((row) => JSON.parse(row.data));
      const meta = {};
      for (const row of db.prepare('SELECT key, value FROM meta').all()) meta[row.key] = JSON.parse(row.value);
      return { players, meta };
    },

    save({ players, meta }) {
      const metaEntries = Object.entries(meta);
      if (players.length === 0 && metaEntries.length === 0) return;
      const updatedAt = Date.now();
      db.exec('BEGIN');
      try {
        for (const player of players) upsertPlayer.run(player.id, JSON.stringify(player), updatedAt);
        for (const [key, value] of metaEntries) upsertMeta.run(key, JSON.stringify(value));
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    saveSession(summary) {
      insertSession.run(String(summary.id), summary.startedAt, summary.endedAt, JSON.stringify(summary));
    },

    sessions() {
      return db.prepare('SELECT data FROM sessions ORDER BY ended_at DESC').all().map((row) => JSON.parse(row.data));
    },

    close() {
      db.close();
    },
  };
}

// ---------- Ảnh đại diện ----------

// Link ảnh TikTok có thể hết hạn: tải về máy chủ để ghế Lão Tổ luôn có ảnh dù người đó vắng mặt lâu.
export function createAvatarCache({ dir, onSaved, fetchImpl = fetch, log = console }) {
  mkdirSync(dir, { recursive: true });
  const tried = new Map(); // id -> url đã thử trong lần chạy này
  const queue = [];
  let busy = false;

  const fileName = (id) => `${String(id).replace(/[^0-9A-Za-z_-]/g, '_')}.jpg`;

  async function download({ id, url }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AVATAR_TIMEOUT_MS);
    try {
      const res = await fetchImpl(url, { signal: controller.signal });
      if (!res.ok || !String(res.headers.get('content-type') ?? '').startsWith('image/')) return;
      const data = Buffer.from(await res.arrayBuffer());
      if (data.length === 0 || data.length > AVATAR_MAX_BYTES) return;
      const name = fileName(id);
      writeFileSync(path.join(dir, name), data);
      onSaved(id, `avatars/${name}?v=${Date.now()}`);
    } catch (err) {
      log.warn?.(`[ảnh] không tải được ảnh đại diện ${id}: ${err?.message ?? err}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async function pump() {
    if (busy) return;
    busy = true;
    while (queue.length > 0) await download(queue.shift());
    busy = false;
  }

  return {
    want(id, url) {
      if (!/^https?:\/\//.test(url ?? '') || tried.get(id) === url) return;
      tried.set(id, url);
      queue.push({ id, url });
      pump();
    },
    idle: () => !busy && queue.length === 0,
  };
}

// ---------- Giả lập ----------

function simUser(name) {
  const clean = String(name ?? '').trim() || 'Đạo hữu';
  return { id: `sim:${clean}`, name: clean, avatar: '' };
}

function simCount(value) {
  const count = Math.floor(Number(value));
  return Number.isFinite(count) ? Math.min(Math.max(count, 1), MAX_SIM_COUNT) : 1;
}

let simGroup = 0;

function simGift(user, body, config) {
  const diamonds = Math.max(Math.floor(Number(body.diamonds)) || 0, 1);
  const count = simCount(body.count);
  const { washMarrow, mutation, vault } = config.gifts;
  const special = [washMarrow, mutation].find((g) => g.diamondCount === diamonds);
  const base = {
    type: 'gift',
    user,
    msgId: null,
    giftId: String(special?.giftIds?.[0] ?? `sim-${diamonds}`),
    giftName: vault.find((g) => g.diamonds === diamonds)?.name ?? `Quà ${diamonds} xu`,
    diamonds,
    combo: Boolean(body.combo),
    groupId: `sim-${++simGroup}`,
  };
  if (!base.combo) return [{ ...base, repeatCount: count, repeatEnd: false }];

  // Giống TikTok thật: nhiều sự kiện đang combo, rồi một sự kiện kết thúc mang số lượng cuối.
  const events = [];
  for (let i = 1; i <= Math.min(count, 5); i++) events.push({ ...base, repeatCount: i, repeatEnd: false });
  events.push({ ...base, repeatCount: count, repeatEnd: true });
  return events;
}

export function simEvents(body, config) {
  const user = simUser(body.name);
  switch (body.action) {
    case 'chat':
      return [{ type: 'chat', user, msgId: null, text: String(body.text ?? '') }];
    case 'like':
      return [{ type: 'like', user, msgId: null, count: simCount(body.count) }];
    case 'gift':
      return simGift(user, body, config);
    case 'share':
    case 'follow':
      return [{ type: body.action, user, msgId: null }];
    default:
      return null;
  }
}

// ---------- Ứng dụng ----------

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function publicFile(urlPath, publicDir) {
  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath === '/sim') urlPath = '/sim.html';
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const file = path.resolve(publicDir, `.${decoded}`);
  return file.startsWith(publicDir + path.sep) ? file : null;
}

export function createApp({ config, dbPath, configPath, publicDir = PUBLIC_DIR, loadConnector, fetchImpl, log = console }) {
  const store = openStore(dbPath);
  const avatarDir = path.join(path.dirname(dbPath), 'avatars');
  const { tiktok: _tiktok, server: _server, ...publicConfig } = config; // Không gửi API key ra trình duyệt.
  let tiktokStatus = 'off';
  let botCount = 0;
  let tiktok = null;
  let started = false;
  let disconnectedAt = null;
  let stopping = null;
  const timers = [];

  const httpServer = createServer(onRequest);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  // wss phát lại lỗi của httpServer; start() đã xử lý lỗi đó, thiếu listener này chương trình sẽ sập.
  wss.on('error', () => {});

  const broadcast = (message) => {
    const text = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(text);
    }
  };

  // Một sự kiện lỗi không được làm dừng cả buổi live.
  const guarded = (label, fn) => {
    try {
      return fn();
    } catch (err) {
      log.error(`[lỗi] ${label}:`, err);
      return undefined;
    }
  };

  const game = createGame({
    config,
    emit: (event) => {
      if (event.kind === 'sessionEnd') guarded('lưu lịch sử phiên', () => store.saveSession(event.summary));
      broadcast({ t: 'game', event });
    },
  });
  const saved = store.load();
  game.load(saved);
  botCount = Math.max(0, ...saved.players.map((p) => Number(String(p.id).match(/^bot:(\d+)$/)?.[1] ?? 0)));
  const avatars = createAvatarCache({
    dir: avatarDir,
    fetchImpl,
    log,
    onSaved: (id, url) => game.setAvatarLocal(id, url),
  });
  let audio = { bell: true, thunder: true, drum: true, bgm: true, voice: true, ...saved.meta.audio };
  const audioState = () => ({ audio, hasBgm: existsSync(path.join(publicDir, 'sounds', 'bgm.mp3')) });

  const handleEvent = (event) => {
    broadcast({ t: 'event', event });
    guarded(`xử lý sự kiện ${event.type}`, () => game.handleEvent(event));
    if (event.user?.avatar && game.player(event.user.id)) avatars.want(event.user.id, event.user.avatar);
  };

  const save = () =>
    guarded('lưu dữ liệu', () => {
      store.save(game.exportDirty());
      game.clearDirty();
    });

  const setTiktokStatus = (status) => {
    if (status === 'disconnected' && tiktokStatus === 'connected') disconnectedAt = Date.now();
    tiktokStatus = status;
    broadcast({ t: 'tiktok', status, user: config.tiktok.username });
  };

  function connectLive() {
    tiktok?.stop();
    tiktok = connectTikTok({
      config,
      onEvent: handleEvent,
      onRoom: (id) => guarded('bắt đầu phiên', () => onRoom(id)),
      onStatus: setTiktokStatus,
      loadConnector,
      log,
    });
  }

  // Đổi ID ngay trên bảng điều khiển, không cần sửa config.json rồi bật lại game.
  function setTiktokUser(input) {
    const username = normalizeTikTokUsername(input);
    if (username === null) return false;
    if (username !== config.tiktok.username) {
      config.tiktok = { ...config.tiktok, username };
      // Phòng của người khác: bắt đầu phiên mới thay vì nối tiếp phiên cũ.
      disconnectedAt = 0;
      if (configPath) guarded('lưu ID TikTok vào config.json', () => saveTikTokUsername(configPath, username));
      log.log(username ? `[tiktok] đổi sang @${username}` : '[tiktok] đã tắt kết nối');
    }
    if (started) connectLive();
    return true;
  }

  // Kết nối live thành công tự bắt đầu phiên. Mất kết nối dưới 30 phút vẫn tính cùng một phiên.
  function onRoom(roomId) {
    const graceMs = config.session.reconnectGraceMin * 60_000;
    const { active } = game.ctx.session;
    if (active && (disconnectedAt === null || Date.now() - disconnectedAt < graceMs)) {
      disconnectedAt = null;
      return;
    }
    if (active) game.endSession();
    game.startSession(`room-${roomId}-${Date.now()}`);
    disconnectedAt = null;
  }

  function handleSim(body) {
    switch (body.action) {
      case 'boss':
        return game.ctx.schedule.request('boss');
      case 'rain':
        return game.ctx.schedule.request('rain');
      case 'debate':
      case 'alchemy':
      case 'ladder':
      case 'secret':
        return Boolean(game.ctx.events?.request(body.action));
      case 'startSession':
        return game.startSession(`sim-${Date.now()}`);
      case 'endSession':
        return Boolean(game.endSession());
      case 'pause':
        return game.command('pause', { on: Boolean(body.on) });
      case 'newDay':
      case 'newWeek':
        return game.command(body.action);
      case 'audio':
        if (!AUDIO_KINDS.includes(body.kind)) return false;
        audio = { ...audio, [body.kind]: Boolean(body.on) };
        store.save({ players: [], meta: { audio } });
        broadcast({ t: 'audio', ...audioState() });
        return true;
      case 'tiktok':
        return setTiktokUser(body.username);
      case 'audioTest':
        if (!AUDIO_TEST_KINDS.includes(body.kind)) return false;
        broadcast({ t: 'audioTest', kind: body.kind });
        return true;
      case 'bots':
        for (let i = 0; i < BOTS_PER_CLICK; i++) {
          botCount += 1;
          handleEvent({
            type: 'chat',
            user: { id: `bot:${botCount}`, name: `Đạo hữu ${botCount}`, avatar: '' },
            msgId: null,
            text: config.keywords.join[0],
          });
        }
        return true;
      default: {
        const events = simEvents(body, config);
        if (!events) return false;
        events.forEach(handleEvent);
        return true;
      }
    }
  }

  function serveAvatar(urlPath, res) {
    try {
      const name = path.basename(decodeURIComponent(urlPath.slice('/avatars/'.length)));
      const content = readFileSync(path.join(avatarDir, name));
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=86400' });
      res.end(content);
      return true;
    } catch {
      return false;
    }
  }

  async function onRequest(req, res) {
    const send = (status, text, type = 'text/plain; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': type });
      res.end(text);
    };
    const urlPath = req.url.split('?')[0];

    if (urlPath === '/api/sim') {
      if (req.method !== 'POST') return send(405, 'Chỉ nhận POST');
      // Trang web lạ không gửi được JSON sang đây vì máy chủ không bật CORS.
      if (!req.headers['content-type']?.startsWith('application/json')) return send(415, 'Cần JSON');
      try {
        const body = JSON.parse(await readBody(req));
        const ok = guarded('giả lập', () => handleSim(body));
        return send(ok ? 200 : 400, ok ? 'OK' : 'Sai yêu cầu');
      } catch {
        return send(400, 'Sai yêu cầu');
      }
    }

    if (req.method !== 'GET') return send(405, 'Không hỗ trợ');
    if (urlPath.startsWith('/avatars/')) {
      if (!serveAvatar(urlPath, res)) send(404, 'Không tìm thấy');
      return undefined;
    }
    if (urlPath === '/api/sessions') return send(200, JSON.stringify(store.sessions()), MIME['.json']);
    const file = publicFile(urlPath, publicDir);
    if (!file) return send(404, 'Không tìm thấy');
    try {
      const content = readFileSync(file);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      });
      res.end(content);
    } catch {
      send(404, 'Không tìm thấy');
    }
  }

  wss.on('connection', (client) => {
    client.send(JSON.stringify({ t: 'hello', config: publicConfig, state: game.snapshot(), tiktok: tiktokStatus, tiktokUser: config.tiktok.username, ...audioState() }));
  });

  return {
    game,
    avatars,

    start(port = config.server.port) {
      return new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, config.server.host, () => {
          httpServer.off('error', reject);
          timers.push(setInterval(() => guarded('tick', () => game.tick()), TICK_MS));
          timers.push(setInterval(() => broadcast({ t: 'state', state: game.snapshot() }), config.leaderboard.refreshMs));
          timers.push(setInterval(save, config.server.autosaveSec * 1000));
          started = true;
          connectLive();
          resolve(httpServer.address().port);
        });
      });
    },

    save,

    stop() {
      stopping ??= new Promise((resolve) => {
        started = false;
        timers.forEach(clearInterval);
        tiktok?.stop();
        save();
        store.close();
        for (const client of wss.clients) client.terminate();
        wss.close();
        httpServer.close(() => resolve());
        httpServer.closeAllConnections();
      });
      return stopping;
    },
  };
}

// ---------- Chạy trực tiếp ----------

if (import.meta.main) {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(`File config.json bị sai định dạng, hãy kiểm tra dấu phẩy và dấu ngoặc kép. Chi tiết: ${err.message}`);
    process.exit(1);
  }
  const app = createApp({
    config,
    configPath: path.join(ROOT, 'config.json'),
    dbPath: process.env.DB_PATH || path.join(ROOT, 'data', 'game.db'),
  });

  const quit = async (code) => {
    await app.stop();
    process.exit(code);
  };
  // SIGHUP là lúc đóng cửa sổ dòng lệnh trên Windows.
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    process.on(signal, () => quit(0));
  }
  process.on('uncaughtException', (err) => {
    console.error('[lỗi nghiêm trọng]', err);
    quit(1);
  });

  try {
    const port = await app.start(Number(process.env.PORT) || config.server.port);
    const base = `http://${config.server.host}:${port}`;
    console.log(`Giao diện (OBS / TikTok LIVE Studio): ${base}/`);
    console.log(`Bảng giả lập: ${base}/sim`);
    if (!config.tiktok.username) console.log('Chưa có ID TikTok: điền trong Bảng giả lập (mục Kết nối TikTok) hoặc config.json. Hiện chỉ chạy giả lập.');
  } catch (err) {
    console.error(
      err.code === 'EADDRINUSE'
        ? `Cổng ${config.server.port} đang bị chiếm. Hãy tắt chương trình kia hoặc đổi server.port trong config.json.`
        : err,
    );
    await quit(1);
  }
}
