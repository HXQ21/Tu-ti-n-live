// Lõi game: người chơi, tu vi, cảnh giới, phiên live, thông báo, Truyền Tin.
// Mỗi hệ thống (linh căn, boss, mưa, nhiệm vụ...) là một module trong server/modules,
// cắm vào lõi qua ctx: bus sự kiện (on/fire), hooks (hệ số), lệnh chat và lịch sự kiện.
// Lõi không biết gì về mạng, giao diện hay SQLite. Đồng hồ và số ngẫu nhiên truyền từ ngoài vào.

import { createBoards } from './modules/boards.js';
import { createBoss } from './modules/boss.js';
import { createCultivation } from './modules/cultivation.js';
import { createFactions } from './modules/factions.js';
import { createGifts } from './modules/gifts.js';
import { createHall } from './modules/hall.js';
import { createLookup } from './modules/lookup.js';
import { createQuests } from './modules/quests.js';
import { createRain } from './modules/rain.js';
import { createRoots } from './modules/roots.js';
import { createSchedule } from './modules/schedule.js';
import { createSeats } from './modules/seats.js';
import { createArtifact } from './modules/artifact.js';
import { createDebate } from './modules/debate.js';
import { createEvents } from './modules/events.js';
import { createTribulation } from './modules/tribulation.js';
import { createAlchemy } from './modules/alchemy.js';
import { createBeast } from './modules/beast.js';
import { createDao } from './modules/dao.js';
import { createDrops } from './modules/drops.js';
import { createDuel } from './modules/duel.js';
import { createLadder } from './modules/ladder.js';
import { createSecret } from './modules/secret.js';
import { createWings } from './modules/wings.js';
import { DAY, MIN, SEC, clamp, daysToMonday, fmt, normalizeText, shuffle, vnDay, vnWeek } from './util.js';

export { normalizeText } from './util.js';

export const PLAYER_VERSION = 2;
const COMBO_FORGET_FACTOR = 10;

// Thứ tự tạo module là thứ tự nhận sự kiện: boss tính sát thương trước khi quà cộng tu vi,
// để đột phá từ chính món quà đó chỉ có tác dụng từ đòn sau.
const MODULES = [
  createRoots,
  createFactions,
  createSchedule,
  createBoss,
  createRain,
  createGifts,
  createCultivation,
  createQuests,
  createHall,
  createSeats,
  createBoards,
  createLookup,
  // Phần 2: mỗi module có cờ bật/tắt trong config.json (modules.<tên>).
  { flag: 'events', create: createEvents },
  { flag: 'artifact', create: createArtifact },
  { flag: 'beast', create: createBeast },
  { flag: 'wings', create: createWings },
  { flag: 'drops', create: createDrops },
  { flag: 'tribulation', create: createTribulation },
  { flag: 'duel', create: createDuel },
  { flag: 'debate', create: createDebate, requires: 'events' },
  { flag: 'alchemy', create: createAlchemy, requires: 'events' },
  { flag: 'ladder', create: createLadder, requires: 'events' },
  { flag: 'secret', create: createSecret, requires: 'events' },
  { flag: 'dao', create: createDao },
];

export function createGame({ config, now = Date.now, random = Math.random, emit = () => {}, questions }) {
  const players = new Map();
  const dirty = new Set();
  const combos = new Map();
  const listeners = new Map();
  const commands = new Map();
  const prefixCommands = [];
  const realms = config.realms;
  const lastRealm = realms.length - 1;
  const bigRealm = Math.max(realms.findIndex((r) => r.name === config.bigBreakthroughFrom), 0);
  const presenceMs = config.presence.activeMin * MIN;

  let seq = 0;
  let sessionSeq = 0;
  let dayShift = 0;
  let session = { id: null, seq: 0, startedAt: now(), active: false };
  let noteQueue = [];
  let note = null;
  let feed = [];
  let feedSeq = 0;
  let feedTimes = [];

  // ---------- Bus, hooks, lệnh ----------

  function on(name, fn) {
    if (!listeners.has(name)) listeners.set(name, []);
    listeners.get(name).push(fn);
  }

  function fire(name, ...args) {
    for (const fn of listeners.get(name) ?? []) fn(...args);
  }

  // joins: người chưa nhập môn gõ lệnh này thì tự nhập môn (true/false hoặc hàm trả về true/false).
  function command(words, handler, { joins = true } = {}) {
    // Nhiều module có thể cùng dùng một lệnh (ví dụ "đánh" cho boss và khiêu chiến).
    for (const word of words) {
      const key = normalizeText(word);
      if (!commands.has(key)) commands.set(key, []);
      commands.get(key).push({ handler, joins });
    }
  }

  // Lệnh có tham số phía sau, ví dụ "xuất chiến [tên]".
  function prefixCommand(words, handler, { joins = true } = {}) {
    for (const word of words) prefixCommands.push({ prefix: `${normalizeText(word)} `, handler, joins });
  }

  const hooks = {
    chatLikeMult: [], // (player) => hệ số tu vi chat/tim
    bossDamageMult: [], // (player) => hệ số sát thương boss (chỗ cắm pháp bảo, dị thú, thiên dực)
    realmCap: [], // (player) => chỉ số cảnh giới tối đa được lên (chỗ cắm bình cảnh)
    newPlayer: [], // (player) => khởi tạo dữ liệu module cho người mới
    view: [], // (player, view) => thêm thông tin hiển thị
    card: [], // (player, card) => thêm dòng vào thẻ check
  };

  // ---------- Tiện ích ----------

  const pick = (list) => list[Math.floor(random() * list.length)];
  const randInt = (min, max) => min + Math.floor(random() * (max - min + 1));
  const isPresent = (player) => now() - player.lastSeen <= presenceMs;
  const presentPlayers = () => [...players.values()].filter(isPresent);
  const today = () => vnDay(now()) + dayShift;
  const thisWeek = () => vnWeek(today());
  const markDirty = (player) => dirty.add(player.id);
  const nextSeq = () => ++seq;
  const product = (list, player) => list.reduce((acc, fn) => acc * fn(player), 1);

  const sessionPoints = (player) => (player.sessionId === session.id ? player.sessionPts : 0);
  const weekPoints = (player) => (player.weekKey === thisWeek() ? player.weekPts : 0);

  function syncCounters(player) {
    if (player.sessionId !== session.id) {
      player.sessionId = session.id;
      player.sessionPts = 0;
      player.sessionShares = 0;
    }
    const week = thisWeek();
    if (player.weekKey !== week) {
      player.weekKey = week;
      player.weekPts = 0;
    }
  }

  // ---------- Cảnh giới, tầng ----------

  function naturalRealm(total) {
    return realms.findLastIndex((r) => r.min <= total);
  }

  function tierFor(total, realmIndex) {
    if (realmIndex === 0 || realmIndex === lastRealm) return 0;
    const { min } = realms[realmIndex];
    const span = (realms[realmIndex + 1].min - min) / config.tiersPerRealm;
    return clamp(Math.floor((total - min) / span) + 1, 1, config.tiersPerRealm);
  }

  function realmLabel(realmIndex, tier) {
    const { name } = realms[realmIndex];
    if (realmIndex === 0) return name;
    if (realmIndex === lastRealm) return `${name} · Viên Mãn`;
    return `${name} tầng ${tier}`;
  }

  const labelOf = (player) => realmLabel(player.realmIndex, player.tier);

  // Từ Kim Đan trở lên dùng thông báo lớn, dưới đó chỉ ghi Truyền Tin.
  function announceRealm(player) {
    const target = player.realmIndex;
    markDirty(player);
    if (target >= bigRealm) {
      notify('breakthrough', `⚡ ${player.name} đột phá ${realms[target].name}!`, { id: player.id, realmIndex: target });
    } else {
      log({ kind: 'breakthrough', id: player.id, text: `${player.name} đột phá ${labelOf(player)}` });
    }
    emit({ kind: 'breakthrough', id: player.id, name: player.name, realmIndex: target, big: target >= bigRealm });
    fire('realmUp', player);
  }

  // Lên đúng 1 cảnh giới (độ kiếp thành công). Tầng tính theo tu vi thực.
  function raiseRealm(player) {
    if (player.realmIndex >= lastRealm) return;
    player.realmIndex += 1;
    const natural = naturalRealm(player.total);
    player.tier = natural > player.realmIndex ? config.tiersPerRealm : tierFor(player.total, player.realmIndex);
    announceRealm(player);
    updateRealm(player);
  }

  // Cảnh giới và tầng không bao giờ tụt.
  function updateRealm(player) {
    const natural = naturalRealm(player.total);
    const cap = hooks.realmCap.reduce((acc, fn) => Math.min(acc, fn(player)), lastRealm);
    const target = Math.min(natural, cap);
    const tier = target < natural ? config.tiersPerRealm : tierFor(player.total, target);

    if (target > player.realmIndex) {
      player.realmIndex = target;
      player.tier = tier;
      announceRealm(player);
      return;
    }
    if (target === player.realmIndex && tier > player.tier) {
      player.tier = tier;
      markDirty(player);
      log({
        kind: 'tier',
        id: player.id,
        text: `${player.name} lên ${labelOf(player)}`,
        group: (n) => `${n} đạo hữu lên tầng mới`,
        merge: 'window',
      });
    }
  }

  // ---------- Tu vi ----------

  // Mỗi lần cộng vào cả ba bộ đếm: tổng, phiên, tuần. Trả về số thực tế đã cộng.
  function gain(player, amount, { source = 'other', session: toSession = true, week: toWeek = true } = {}) {
    amount = Math.floor(amount);
    if (amount <= 0) return 0;
    syncCounters(player);
    const s = nextSeq();
    player.total += amount;
    player.seqTotal = s;
    if (toSession) {
      player.sessionPts += amount;
      player.seqSession = s;
    }
    if (toWeek) {
      player.weekPts += amount;
      player.seqWeek = s;
    }
    markDirty(player);
    if (source !== 'chat') emit({ kind: 'gain', id: player.id, amount, source });
    updateRealm(player);
    fire('gain', player, amount, source);
    return amount;
  }

  // Phần lẻ sau hệ số giữ lại theo phần nghìn, cộng dồn cho lần sau.
  function gainScaled(player, base, mult, options) {
    const milli = player.frac + Math.round(base * mult * 1000);
    player.frac = milli % 1000;
    markDirty(player);
    return gain(player, Math.floor(milli / 1000), options);
  }

  // Bị trừ (cuồng nộ của boss) chỉ trừ tu vi tổng và không thấp hơn ngưỡng cảnh giới hiện tại.
  function drain(player, amount) {
    const room = player.total - realms[player.realmIndex].min;
    const taken = clamp(Math.floor(amount), 0, room);
    if (taken <= 0) return 0;
    player.total -= taken;
    markDirty(player);
    return taken;
  }

  // ---------- Danh hiệu ----------

  // days: hết hạn sau số ngày; sessions: 1 = đến hết phiên này, 2 = đến hết phiên kế tiếp.
  function grantTitle(player, name, { days = null, sessions = null } = {}) {
    const title = { name, at: nextSeq() };
    if (days !== null) title.expiresAt = now() + days * DAY;
    if (sessions !== null) title.sessionLimit = session.seq + sessions - 1;
    player.titles = [...(player.titles ?? []).filter((t) => t.name !== name), title];
    markDirty(player);
  }

  function titlesOf(player) {
    const t = now();
    return (player.titles ?? [])
      .filter((title) => title.expiresAt === undefined || title.expiresAt > t)
      .sort((a, b) => b.at - a.at)
      .map((title) => title.name);
  }

  // ---------- Thông báo lớn ----------

  const priorityOf = (kind) => {
    const index = config.notifications.priority.indexOf(kind);
    return index < 0 ? config.notifications.priority.length : index;
  };

  function pumpNote() {
    const t = now();
    if (note && t < note.until) return;
    note = null;
    if (noteQueue.length === 0) return;
    const next = noteQueue.reduce((best, item) => (priorityOf(item.kind) < priorityOf(best.kind) ? item : best));
    noteQueue = noteQueue.filter((item) => item !== next);
    note = { ...next, until: t + config.notifications.bigSec * SEC };
    // Các trường thêm (realmIndex, seat, steal...) đi kèm để giao diện chọn đúng giọng đọc.
    const { kind: noteKind, ...extra } = next;
    emit({ ...extra, kind: 'notification', notification: noteKind, until: note.until });
  }

  function notify(kind, text, extra = {}) {
    noteQueue.push({ kind, text, ...extra });
    while (noteQueue.length > config.notifications.maxQueue) {
      const worst = noteQueue.reduce((acc, item) => (priorityOf(item.kind) >= priorityOf(acc.kind) ? item : acc));
      noteQueue = noteQueue.filter((item) => item !== worst);
    }
    pumpNote();
  }

  // ---------- Tông Môn Truyền Tin ----------

  // merge 'window': gộp với dòng cùng loại trong mergeSec giây.
  // merge 'flood': chỉ gộp khi đang quá floodPerSec dòng mỗi giây.
  function log({ kind, id = null, text, amount = 0, group = null, merge = null }) {
    const t = now();
    const { mergeSec, floodPerSec, lines } = config.feed;
    feedTimes = feedTimes.filter((at) => t - at < SEC);
    const flooding = feedTimes.length >= floodPerSec;
    const target = group && merge
      ? feed.findLast((e) => e.kind === kind && e.group && t - e.startedAt < mergeSec * SEC)
      : null;
    const canMerge = target && (merge === 'window' || (merge === 'flood' && flooding));

    let entry;
    if (canMerge) {
      entry = target;
      feed = feed.filter((e) => e !== entry);
      entry.count += 1;
      if (id) entry.ids.add(id);
      entry.amount += amount;
      entry.text = entry.group(Math.max(entry.ids.size, 1) === 1 ? entry.count : entry.ids.size, entry.amount);
    } else {
      entry = { kind, text, amount, group, count: 1, ids: new Set(id ? [id] : []), startedAt: t };
      feedTimes.push(t);
    }
    entry.seq = ++feedSeq;
    entry.at = t;
    feed.push(entry);
    while (feed.length > lines) feed.shift();
    emit({ kind: 'feed', entry: { seq: entry.seq, kind, text: entry.text, amount, merged: Boolean(canMerge) } });
  }

  // ---------- Người chơi ----------

  function rankName(player) {
    if (player.diamondsTotal >= config.ranks.innerDiamonds) return 'Đệ tử nội môn';
    return player.likesTotal >= config.ranks.outerLikes ? 'Đệ tử ngoại môn' : 'Đệ tử ký danh';
  }

  function createPlayer(user) {
    const player = {
      v: PLAYER_VERSION,
      id: user.id,
      name: user.name,
      avatarUrl: user.avatar ?? '',
      avatarLocal: null,
      root: null,
      total: 0,
      frac: 0,
      realmIndex: 0,
      tier: 0,
      likesTotal: 0,
      likeRemainder: 0,
      diamondsTotal: 0,
      faction: null,
      factionChangedAt: 0,
      lastSeen: now(),
      joinedAt: now(),
      seenSession: session.seq,
      sessionId: session.id,
      sessionPts: 0,
      sessionShares: 0,
      weekKey: thisWeek(),
      weekPts: 0,
      seqTotal: nextSeq(),
      seqSession: 0,
      seqWeek: 0,
      titles: [],
    };
    for (const fn of hooks.newPlayer) fn(player);
    return player;
  }

  // Trả về người chơi, hoặc null nếu chưa nhập môn và hành động này không làm nhập môn.
  function touch(user, { join = false } = {}) {
    let player = players.get(user.id);
    if (!player) {
      if (!join) return null;
      player = createPlayer(user);
      players.set(player.id, player);
      markDirty(player);
      const root = config.roots.find((r) => r.id === player.root.type);
      log({
        kind: 'join',
        id: player.id,
        text: `${player.name} nhập môn · ${root.name} · hệ ${config.elements[player.root.main].name}`,
        group: (n) => `${n} đạo hữu vừa nhập môn`,
        merge: 'flood',
      });
      emit({ kind: 'join', id: player.id, name: player.name });
      fire('join', player);
      fire('touch', player, { returning: false });
      return player;
    }

    const wasPresent = isPresent(player);
    const firstThisSession = player.seenSession !== session.seq;
    player.name = user.name || player.name;
    if (user.avatar) player.avatarUrl = user.avatar;
    player.lastSeen = now();
    player.seenSession = session.seq;
    syncCounters(player);
    markDirty(player);
    if (!wasPresent) {
      if (firstThisSession) {
        log({
          kind: 'return',
          id: player.id,
          text: `${player.name} trở về tông môn · ${labelOf(player)}`,
          group: (n) => `${n} đạo hữu trở về tông môn`,
          merge: 'window',
        });
      } else {
        log({
          kind: 'return',
          id: player.id,
          text: `${player.name} xuất quan`,
          group: (n) => `${n} đạo hữu xuất quan`,
          merge: 'window',
        });
      }
      emit({ kind: 'return', id: player.id, name: player.name });
    }
    fire('touch', player, { returning: !wasPresent });
    return player;
  }

  // Ảnh đã tải về máy chủ dùng được cả khi link TikTok hết hạn.
  const avatarOf = (player) => player.avatarLocal || player.avatarUrl || '';

  function viewOf(player) {
    const view = {
      id: player.id,
      name: player.name,
      avatar: avatarOf(player),
      total: player.total,
      session: sessionPoints(player),
      week: weekPoints(player),
      realmIndex: player.realmIndex,
      tier: player.tier,
      realm: labelOf(player),
      rank: rankName(player),
      main: player.root.main,
      faction: player.faction,
      title: titlesOf(player)[0] ?? null,
      present: isPresent(player),
    };
    for (const fn of hooks.view) fn(player, view);
    return view;
  }

  // ---------- Phiên live ----------

  function startSession(id = `s-${now()}`) {
    if (session.active) return false;
    sessionSeq += 1;
    session = { id, seq: sessionSeq, startedAt: now(), active: true };
    fire('sessionStart', session);
    emit({ kind: 'sessionStart', id, seq: sessionSeq });
    return true;
  }

  // Chốt Thiên Kiêu Bảng theo mọi người có tu vi phiên này (kể cả người đã rời đi).
  function endSession() {
    if (!session.active) return null;
    fire('sessionEnding', session);
    const ranked = [...players.values()]
      .filter((p) => sessionPoints(p) > 0)
      .sort((a, b) => sessionPoints(b) - sessionPoints(a) || a.seqSession - b.seqSession);
    const rewards = config.session.endRewards;
    const top = ranked.slice(0, rewards.length).map((player, index) => {
      const points = sessionPoints(player);
      gain(player, rewards[index], { source: 'sessionEnd', session: false });
      return { id: player.id, name: player.name, points, reward: rewards[index] };
    });
    // Danh hiệu theo phiên hết hạn khi phiên giới hạn của nó kết thúc.
    for (const player of players.values()) {
      const kept = (player.titles ?? []).filter((t) => t.sessionLimit === undefined || t.sessionLimit > session.seq);
      if (kept.length !== (player.titles ?? []).length) {
        player.titles = kept;
        markDirty(player);
      }
    }
    if (top[0]) grantTitle(players.get(top[0].id), config.session.firstTitle, { sessions: 2 });

    const summary = { id: session.id, seq: session.seq, startedAt: session.startedAt, endedAt: now(), top };
    session = { ...session, active: false };
    fire('sessionEnd', summary);
    emit({ kind: 'sessionEnd', summary });
    return summary;
  }

  // ---------- Sự kiện TikTok ----------

  function handleChat(event) {
    const text = normalizeText(event.text);
    let entries = commands.get(text) ?? [];
    let arg = '';
    if (entries.length === 0) {
      entries = prefixCommands.filter((c) => text.startsWith(c.prefix));
      if (entries.length > 0) {
        arg = String(event.text).trim().replace(/\s+/g, ' ').slice(entries[0].prefix.length).trim();
      }
    }
    const joins = entries.some((e) => (typeof e.joins === 'function' ? e.joins() : e.joins));
    const player = touch(event.user, { join: joins });
    if (!player) return;
    fire('chat', player, text);
    for (const entry of entries) entry.handler(player, arg);
  }

  function handleLike(event) {
    const count = Math.floor(Number(event.count));
    if (!Number.isFinite(count) || count <= 0) return;
    const player = touch(event.user, { join: true });
    player.likesTotal += count;
    fire('like', player, count);
  }

  function handleShare(event) {
    fire('share', touch(event.user, { join: true }));
  }

  function creditGift(player, gift, quantity) {
    const value = gift.diamonds * quantity;
    if (value <= 0) return;
    player.diamondsTotal += value;
    markDirty(player);
    fire('gift', player, gift, quantity, value);
  }

  // Quà combo chỉ cộng một lần khi combo kết thúc, theo số lượng cuối cùng.
  function handleGift(event) {
    const player = touch(event.user, { join: true });
    const repeatCount = Math.max(Math.floor(Number(event.repeatCount)) || 1, 1);
    const diamonds = Math.max(Math.floor(Number(event.diamonds)) || 0, 0);
    const gift = { giftId: String(event.giftId), giftName: event.giftName || `Quà ${diamonds} xu`, diamonds };

    if (!event.combo) {
      creditGift(player, gift, repeatCount);
      return;
    }
    const key = `${player.id}:${gift.giftId}:${event.groupId}`;
    const entry = combos.get(key);
    if (event.repeatEnd) {
      combos.delete(key);
      creditGift(player, gift, repeatCount - (entry?.credited ?? 0));
      return;
    }
    if (entry) {
      entry.count = Math.max(entry.count, repeatCount);
      entry.updatedAt = now();
    } else {
      combos.set(key, { playerId: player.id, gift, count: repeatCount, credited: 0, updatedAt: now() });
    }
  }

  // Mất kết nối giữa combo thì không có sự kiện kết thúc: quà thật không được mất.
  function flushCombos() {
    const t = now();
    const timeoutMs = config.gifts.comboTimeoutSec * SEC;
    for (const [key, entry] of combos) {
      const age = t - entry.updatedAt;
      if (age >= timeoutMs && entry.count > entry.credited) {
        const player = players.get(entry.playerId);
        const quantity = entry.count - entry.credited;
        entry.credited = entry.count;
        if (player) creditGift(player, entry.gift, quantity);
      }
      if (age >= timeoutMs * COMBO_FORGET_FACTOR) combos.delete(key);
    }
  }

  // ---------- Ghép module ----------

  const ctx = {
    config,
    questions,
    now,
    random,
    emit,
    players,
    on,
    fire,
    command,
    prefixCommand,
    hooks,
    pick,
    randInt,
    shuffle: (list) => shuffle(list, random),
    product,
    isPresent,
    presentPlayers,
    today,
    thisWeek,
    markDirty,
    nextSeq,
    gain,
    gainScaled,
    drain,
    notify,
    log,
    grantTitle,
    titlesOf,
    rankName,
    labelOf,
    realmLabel,
    naturalRealm,
    raiseRealm,
    updateRealm,
    bigRealm,
    sessionPoints,
    weekPoints,
    viewOf,
    avatarOf,
    get session() {
      return session;
    },
  };

  command(config.keywords.join, () => {});

  // Gắn từng module vào ctx ngay khi tạo để module sau dùng được module trước.
  const modules = [];
  for (const entry of MODULES) {
    const create = typeof entry === 'function' ? entry : entry.create;
    if (entry.flag && !config.modules?.[entry.flag]) continue;
    if (entry.requires && !ctx[entry.requires]) continue;
    const mod = create(ctx);
    if (mod.name) ctx[mod.name] = mod;
    modules.push(mod);
  }

  function adminCommand(name, args = {}) {
    switch (name) {
      case 'startSession':
        return startSession(args.id);
      case 'endSession':
        return Boolean(endSession());
      case 'newDay':
        dayShift += 1;
        fire('dayChange');
        return true;
      case 'newWeek':
        dayShift += daysToMonday(today());
        fire('dayChange');
        return true;
      default:
        for (const mod of modules) {
          if (mod.commands?.[name]) return mod.commands[name](args);
        }
        return false;
    }
  }

  return {
    ctx,

    load({ players: saved = [], meta = {} }) {
      players.clear();
      for (const player of saved) {
        if (player.v !== PLAYER_VERSION) continue; // Bản ghi của phiên bản cũ không dùng lại.
        players.set(player.id, player);
        seq = Math.max(seq, player.seqTotal ?? 0, player.seqSession ?? 0, player.seqWeek ?? 0);
      }
      const core = meta.core ?? {};
      seq = Math.max(seq, core.seq ?? 0);
      sessionSeq = core.sessionSeq ?? 0;
      dayShift = core.dayShift ?? 0;
      if (core.session) session = core.session;
      for (const mod of modules) mod.load?.(meta[mod.name] ?? {}, meta);
    },

    handleEvent(event) {
      switch (event.type) {
        case 'chat':
          return handleChat(event);
        case 'like':
          return handleLike(event);
        case 'gift':
          return handleGift(event);
        case 'share':
          return handleShare(event);
        case 'follow':
          if (players.has(event.user.id)) touch(event.user);
          return undefined;
        default:
          return undefined;
      }
    },

    command: adminCommand,
    startSession,
    endSession,

    tick() {
      flushCombos();
      for (const mod of modules) mod.tick?.();
      pumpNote();
    },

    player(id) {
      return players.get(id);
    },

    setAvatarLocal(id, url) {
      const player = players.get(id);
      if (!player) return;
      player.avatarLocal = url;
      markDirty(player);
    },

    view(id) {
      const player = players.get(id);
      return player ? viewOf(player) : null;
    },

    snapshot() {
      const present = presentPlayers();
      const state = {
        now: now(),
        session: { id: session.id, seq: session.seq, active: session.active, startedAt: session.startedAt },
        today: today(),
        totalPlayers: players.size,
        presentPlayers: present.length,
        notification: note && { kind: note.kind, text: note.text, until: note.until },
        feed: feed.map((e) => ({ seq: e.seq, kind: e.kind, text: e.text, at: e.at })),
      };
      for (const mod of modules) mod.snapshot?.(state, present);
      return state;
    },

    exportDirty() {
      const meta = { core: { session, sessionSeq, seq, dayShift } };
      for (const mod of modules) {
        const data = mod.save?.();
        if (data !== undefined) meta[mod.name] = data;
      }
      return { players: [...dirty].map((id) => players.get(id)).filter(Boolean), meta };
    },

    clearDirty() {
      dirty.clear();
    },
  };
}

export { fmt };
