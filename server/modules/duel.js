// Phần 2 mục G: Khiêu chiến (PvP) từ Kim Đan trở lên.
// Chat "khiêu chiến" vào hàng chờ; ghép 2 người chênh nhau tối đa 1 cảnh giới; chờ quá 60 giây thì hủy.
// Trận 30 giây, mỗi lúc chỉ 1 trận, đi qua Lịch Thiên Đạo (không chạy khi boss hoặc độ kiếp đang chạy).
// Chiến lực = 1.000 × thưởng cảnh giới × pháp bảo × dị thú × thiên dực + điểm trận. Người thua không bị trừ tu vi.

import { MIN, SEC, fmt, normalizeText } from '../util.js';

export function createDuel(ctx) {
  const { config } = ctx;
  const cfg = config.duel;
  const minRealm = Math.max(config.realms.findIndex((r) => r.name === cfg.minRealm), 0);
  let queue = []; // { id, at }
  let duel = null; // { sides: [{ id, points, lastAttackAt }], endsAt, supporters: Map }

  // Chiến lực gốc (chưa có điểm trận), dùng cho cả thẻ check.
  function basePower(player) {
    const realm = 1 + config.boss.mults.realmStep * player.realmIndex;
    const artifact = ctx.artifact?.multOf(player) ?? 1;
    const beast = ctx.beast?.multOf(player) ?? 1;
    const wings = ctx.wings?.multOf(player) ?? 1;
    return Math.floor(cfg.basePower * realm * artifact * beast * wings);
  }

  const sideOf = (id) => duel?.sides.find((side) => side.id === id) ?? null;
  const powerOf = (side) => basePower(ctx.players.get(side.id)) + side.points;
  const coolingDown = (player) => player.duelAt && ctx.now() - player.duelAt < cfg.cooldownMin * MIN;

  function request(player) {
    if (player.realmIndex < minRealm) {
      ctx.emit({ kind: 'duelDenied', id: player.id, reason: 'realm' });
      return;
    }
    if (coolingDown(player) || sideOf(player.id) || queue.some((q) => q.id === player.id)) return;
    queue.push({ id: player.id, at: ctx.now() });
    ctx.log({ kind: 'duel', id: player.id, text: `${player.name} gửi lời khiêu chiến · chờ đối thủ` });
    match();
  }

  function valid(id) {
    const player = ctx.players.get(id);
    return player && ctx.isPresent(player) && player.realmIndex >= minRealm;
  }

  function match() {
    if (duel) return;
    queue = queue.filter((q) => valid(q.id));
    for (let i = 0; i < queue.length; i++) {
      for (let j = i + 1; j < queue.length; j++) {
        const a = ctx.players.get(queue[i].id);
        const b = ctx.players.get(queue[j].id);
        if (Math.abs(a.realmIndex - b.realmIndex) > cfg.maxRealmGap) continue;
        if (!ctx.schedule.claim('duel')) return;
        queue = queue.filter((q) => q.id !== a.id && q.id !== b.id);
        begin(a, b);
        return;
      }
    }
  }

  function begin(a, b) {
    duel = {
      sides: [a, b].map((p) => ({ id: p.id, points: 0, lastAttackAt: -Infinity })),
      endsAt: ctx.now() + cfg.durationSec * SEC,
      supporters: new Map(),
    };
    for (const player of [a, b]) {
      player.duelAt = ctx.now();
      ctx.markDirty(player);
      ctx.fire('eventJoin', player, 'duel');
    }
    ctx.emit({ kind: 'duelStart', a: a.id, b: b.id, endsAt: duel.endsAt });
    ctx.log({ kind: 'duel', text: `${a.name} đối đầu ${b.name} · chat "${cfg.supportKeywords[0]} [tên]" để cổ vũ` });
  }

  function finish() {
    const [sa, sb] = duel.sides;
    const a = ctx.players.get(sa.id);
    const b = ctx.players.get(sb.id);
    const pa = powerOf(sa);
    const pb = powerOf(sb);
    duel = null;
    ctx.schedule.finished('duel');
    const diff = Math.abs(pa - pb) / Math.max(pa, pb, 1);
    if (diff * 100 < cfg.drawPct) {
      const ra = ctx.gain(a, cfg.drawReward, { source: 'duel' });
      ctx.gain(b, cfg.drawReward, { source: 'duel' });
      ctx.log({ kind: 'duel', text: `${a.name} hòa ${b.name} · mỗi người +${fmt(ra)} tu vi` });
      ctx.emit({ kind: 'duelEnd', draw: true, a: a.id, b: b.id });
      return;
    }
    const [winner, loser] = pa > pb ? [a, b] : [b, a];
    // Phần thưởng do hệ thống tặng: người thua không bị trừ.
    const steal = Math.min(Math.floor((ctx.sessionPoints(loser) * cfg.winStealPct) / 100), cfg.winStealMax);
    const won = ctx.gain(winner, cfg.winReward + steal, { source: 'duel' });
    const lost = ctx.gain(loser, cfg.loseReward, { source: 'duel' });
    ctx.log({ kind: 'duel', id: winner.id, amount: won, text: `${winner.name} thắng ${loser.name} · +${fmt(won)} tu vi` });
    ctx.log({ kind: 'duel', id: loser.id, amount: lost, text: `${loser.name} thua · +${fmt(lost)} tu vi an ủi` });
    ctx.emit({ kind: 'duelEnd', draw: false, winner: winner.id, loser: loser.id });
  }

  ctx.command(cfg.keywords, request);

  ctx.command(config.keywords.attack, (player) => {
    const side = sideOf(player.id);
    if (!side) return;
    const t = ctx.now();
    if (t - side.lastAttackAt < cfg.attackCooldownSec * SEC) return;
    side.lastAttackAt = t;
    side.points += cfg.attackPoints;
    ctx.emit({ kind: 'duelHit', id: player.id, points: cfg.attackPoints });
  });

  ctx.prefixCommand(cfg.supportKeywords, (player, arg) => {
    if (!duel || sideOf(player.id)) return;
    const wanted = normalizeText(arg);
    if (!wanted) return;
    const side = duel.sides.find((s) => normalizeText(ctx.players.get(s.id).name) === wanted)
      ?? duel.sides.find((s) => normalizeText(ctx.players.get(s.id).name).includes(wanted));
    if (!side) return;
    const last = duel.supporters.get(player.id) ?? -Infinity;
    if (ctx.now() - last < cfg.supportCooldownSec * SEC) return;
    duel.supporters.set(player.id, ctx.now());
    side.points += cfg.supportPoints;
    ctx.emit({ kind: 'duelSupport', id: player.id, target: side.id });
  }, { joins: () => Boolean(duel) });

  ctx.on('like', (player, count) => {
    const side = sideOf(player.id);
    if (side) side.points += count * cfg.perLike;
  });
  ctx.on('gift', (player, gift, quantity, value) => {
    const side = sideOf(player.id);
    if (side) side.points += value * cfg.perDiamond;
  });

  ctx.on('sessionEnding', () => {
    duel = null;
    queue = [];
  });

  ctx.hooks.card.push((player, card) => {
    card.power = basePower(player);
  });

  return {
    name: 'duel',
    basePower,
    request,
    queue: () => queue.map((q) => q.id),
    active: () => Boolean(duel),
    tick() {
      const t = ctx.now();
      if (duel && t >= duel.endsAt) finish();
      for (const q of queue.filter((item) => t - item.at >= cfg.waitSec * SEC)) {
        const player = ctx.players.get(q.id);
        if (player) ctx.log({ kind: 'duel', id: q.id, text: `${player.name} không tìm được đối thủ · hủy khiêu chiến` });
      }
      queue = queue.filter((item) => t - item.at < cfg.waitSec * SEC);
      match();
    },
    snapshot(state) {
      state.duel = duel
        ? {
            endsAt: duel.endsAt,
            sides: duel.sides.map((side) => ({ player: ctx.viewOf(ctx.players.get(side.id)), power: powerOf(side), points: side.points })),
          }
        : null;
    },
  };
}
