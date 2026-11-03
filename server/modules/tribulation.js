// Phần 2 mục B: Bình cảnh & Độ kiếp.
// Từ Kim Đan trở lên, chạm ngưỡng cảnh giới mới thì dừng ở tầng 9 cảnh giới cũ (bình cảnh),
// tu vi vẫn tích lũy. Chat "độ kiếp" để vượt kiếp 30 giây, cả phòng hộ pháp tăng tỉ lệ thành công.
// Độ kiếp là sự kiện lớn: chỉ bắt đầu khi Lịch Thiên Đạo rảnh, sự kiện theo lịch phải chờ nó xong.

import { MIN, SEC, fmt } from '../util.js';

export function createTribulation(ctx) {
  const { config } = ctx;
  const cfg = config.tribulation;
  const nextRealmName = (player) => config.realms[player.realmIndex + 1]?.name;
  let queue = [];
  let current = null; // { id, endsAt, helpers: Set, likes, giftPct, startedAt }

  // Luyện Khí, Trúc Cơ vẫn tự động; từ Kim Đan phải độ kiếp.
  ctx.hooks.realmCap.push((player) => Math.max(player.realmIndex, ctx.bigRealm - 1));

  const bottleneck = (player) =>
    player.realmIndex + 1 < config.realms.length && ctx.naturalRealm(player.total) > player.realmIndex;
  const resting = (player) => (player.restUntil ?? 0) > ctx.now();

  // Báo một lần khi vừa chạm bình cảnh của cảnh giới hiện tại.
  ctx.on('gain', (player) => {
    if (!bottleneck(player) || player.bottleneckNoted === player.realmIndex) return;
    player.bottleneckNoted = player.realmIndex;
    ctx.markDirty(player);
    ctx.log({
      kind: 'breakthrough',
      id: player.id,
      text: `${player.name} chạm bình cảnh ${nextRealmName(player)} · gõ "${cfg.keywords[0]}"`,
    });
    ctx.emit({ kind: 'bottleneck', id: player.id, name: player.name });
  });

  function chance() {
    if (!current) return 0;
    const player = ctx.players.get(current.id);
    let pct = cfg.base + (player?.root.main === 'thien' ? cfg.heaven : 0);
    pct += Math.min(current.helpers.size * cfg.perHelper, cfg.helperMax);
    pct += Math.min(Math.floor(current.likes / cfg.likesPerPct), cfg.likesMax);
    pct += current.giftPct;
    return Math.min(pct, cfg.max);
  }

  function begin(player) {
    current = { id: player.id, startedAt: ctx.now(), endsAt: ctx.now() + cfg.durationSec * SEC, helpers: new Set(), likes: 0, giftPct: 0 };
    ctx.fire('eventJoin', player, 'tribulation');
    ctx.emit({ kind: 'tribulationStart', id: player.id, name: player.name, endsAt: current.endsAt });
    ctx.log({ kind: 'breakthrough', id: player.id, text: `${player.name} bắt đầu độ kiếp ${nextRealmName(player)} · gõ "${cfg.helpKeywords[0]}" để hộ pháp` });
  }

  function finish() {
    const player = ctx.players.get(current.id);
    const pct = chance();
    const helpers = [...current.helpers];
    current = null;
    ctx.schedule.finished('tribulation');
    if (!player) return;
    const success = ctx.random() * 100 < pct;
    if (success) {
      ctx.raiseRealm(player);
      let total = 0;
      for (const id of helpers) {
        const helper = ctx.players.get(id);
        if (helper) total += ctx.gain(helper, cfg.helperReward, { source: 'tribulation' });
      }
      if (helpers.length > 0) {
        ctx.log({ kind: 'breakthrough', amount: total, text: `${helpers.length} đạo hữu hộ pháp thành công · mỗi người +${fmt(cfg.helperReward)} tu vi` });
      }
    } else {
      const excess = player.total - config.realms[player.realmIndex].min;
      const lost = ctx.drain(player, Math.floor((excess * cfg.failLossPct) / 100));
      player.restUntil = ctx.now() + cfg.restMin * MIN;
      ctx.markDirty(player);
      ctx.log({ kind: 'breakthrough', id: player.id, text: `${player.name} độ kiếp thất bại · mất ${fmt(lost)} tu vi · tinh dưỡng ${cfg.restMin} phút` });
    }
    ctx.emit({ kind: 'tribulationEnd', id: player.id, name: player.name, success, chance: pct });
  }

  function request(player) {
    if (!bottleneck(player)) return;
    if (resting(player)) {
      ctx.emit({ kind: 'tribulationDenied', id: player.id, reason: 'rest', until: player.restUntil });
      return;
    }
    if (ctx.boss?.active()) {
      ctx.emit({ kind: 'tribulationDenied', id: player.id, reason: 'boss' });
      return;
    }
    if (current?.id === player.id || queue.includes(player.id)) return;
    if (queue.length >= cfg.queueMax) {
      ctx.emit({ kind: 'tribulationDenied', id: player.id, reason: 'queue' });
      return;
    }
    queue.push(player.id);
    ctx.log({ kind: 'breakthrough', id: player.id, text: `${player.name} xếp hàng độ kiếp · thứ ${queue.length}` });
    pump();
  }

  function pump() {
    if (current || queue.length === 0 || ctx.boss?.active()) return;
    // Bỏ người không còn đủ điều kiện (đã rời đi, hết bình cảnh).
    while (queue.length > 0) {
      const player = ctx.players.get(queue[0]);
      if (player && ctx.isPresent(player) && bottleneck(player) && !resting(player)) break;
      queue.shift();
    }
    if (queue.length === 0 || !ctx.schedule.claim('tribulation')) return;
    begin(ctx.players.get(queue.shift()));
  }

  ctx.command(cfg.keywords, request);
  ctx.command(cfg.helpKeywords, (player) => {
    if (!current || player.id === current.id || current.helpers.has(player.id)) return;
    current.helpers.add(player.id);
    ctx.fire('eventJoin', player, 'tribulation');
    ctx.emit({ kind: 'tribulationHelp', id: player.id, chance: chance() });
  }, { joins: () => Boolean(current) });

  ctx.on('like', (player, count) => {
    if (current) current.likes += count;
  });

  // Quà Hộ Pháp Kim Quan của bất kỳ ai +10% mỗi cái, quà từ 1.000 xu +15% mỗi cái.
  ctx.on('gift', (player, gift, quantity) => {
    if (!current) return;
    if (gift.diamonds >= cfg.bigGiftMin) current.giftPct += cfg.bigGiftPct * quantity;
    else if (gift.diamonds >= cfg.hoPhapMin) current.giftPct += cfg.hoPhapPct * quantity;
  });

  ctx.on('sessionEnding', () => {
    if (current) {
      current = null;
      ctx.emit({ kind: 'tribulationEnd', aborted: true });
    }
    queue = [];
  });

  // Thẻ check của người khác được hoãn khi đang độ kiếp (tối đa 30 giây).
  ctx.lookup.blockers.push(() => Boolean(current) && ctx.now() - current.startedAt < cfg.cardDelayMaxSec * SEC);

  ctx.hooks.card.push((player, card) => {
    if (resting(player)) card.status = `Tinh dưỡng còn ${Math.ceil((player.restUntil - ctx.now()) / MIN)} phút`;
    else if (bottleneck(player)) card.status = `Bình cảnh ${nextRealmName(player)} · gõ "${cfg.keywords[0]}"`;
  });

  ctx.hooks.view.push((player, view) => {
    if (bottleneck(player)) view.bottleneck = true;
  });

  return {
    name: 'tribulation',
    chance,
    bottleneck,
    resting,
    active: () => Boolean(current),
    queue: () => [...queue],
    tick() {
      if (current && ctx.now() >= current.endsAt) finish();
      pump();
    },
    snapshot(state) {
      state.tribulation = current
        ? {
            player: ctx.viewOf(ctx.players.get(current.id)),
            endsAt: current.endsAt,
            chance: chance(),
            helpers: current.helpers.size,
            next: nextRealmName(ctx.players.get(current.id)),
            queue: queue.length,
          }
        : null;
    },
  };
}

