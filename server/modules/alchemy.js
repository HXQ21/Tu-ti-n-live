// Phần 2 mục H: Luyện Đan Đại Hội (sự kiện cộng đồng trong khe phút 12).
// Hỏa hầu 0–100 bắt đầu 30, tự giảm 3 điểm/giây. "thêm lửa" +5 (mỗi người 1 lần/2 giây), mỗi 10 tim +1, quà xu × 1.
// Trên 85 liên tục 3 giây thì nổ lò. Sau 60 giây, tổng thời gian trong vùng 40–70 từ 35 giây thì thành đan.

import { SEC, clamp, fmt } from '../util.js';

export function createAlchemy(ctx) {
  const { config } = ctx;
  const cfg = config.alchemy;
  let pot = null; // { heat, stableMs, dangerMs, endsAt, lastTick, participants: Set, likeRem: Map, lastFire: Map, result }

  function start() {
    pot = {
      heat: cfg.start,
      stableMs: 0,
      dangerMs: 0,
      endsAt: ctx.now() + cfg.durationSec * SEC,
      lastTick: ctx.now(),
      participants: new Set(),
      likeRem: 0,
      lastFire: new Map(),
      result: null,
    };
    ctx.emit({ kind: 'alchemyStart', endsAt: pot.endsAt });
    return true;
  }

  function join(player) {
    if (pot.participants.has(player.id)) return;
    pot.participants.add(player.id);
    ctx.fire('eventJoin', player, 'alchemy');
  }

  const addHeat = (amount) => {
    pot.heat = clamp(pot.heat + amount, 0, 100);
  };

  function reward(amount, { danBonus = false } = {}) {
    let total = 0;
    for (const id of pot.participants) {
      const player = ctx.players.get(id);
      if (!player) continue;
      const bonus = danBonus && ctx.factions.compatible(player, 'dan') ? cfg.danMult : 1;
      total += ctx.gain(player, amount * bonus, { source: 'alchemy' });
    }
    return total;
  }

  function finish(result) {
    const count = pot.participants.size;
    let total = 0;
    if (result === 'success') {
      total = reward(cfg.successReward, { danBonus: true });
      ctx.log({ kind: 'event', amount: total, text: `Luyện Đan thành công · ${count} đạo hữu mỗi người +${fmt(cfg.successReward)} tu vi (phe đan x${cfg.danMult})` });
    } else {
      total = reward(cfg.failReward);
      ctx.log({ kind: 'event', amount: total, text: `${result === 'explode' ? 'Nổ lò!' : 'Luyện đan thất bại'} · ${count} đạo hữu mỗi người +${fmt(cfg.failReward)} tu vi` });
    }
    ctx.emit({ kind: 'alchemyEnd', result });
    pot = null;
    ctx.events.finished('alchemy');
  }

  ctx.events.register('alchemy', { label: 'Luyện Đan Đại Hội', start, abort: () => (pot = null) });

  ctx.command(cfg.keywords, (player) => {
    if (!pot) return;
    const last = pot.lastFire.get(player.id) ?? -Infinity;
    if (ctx.now() - last < cfg.fireCooldownSec * SEC) return;
    pot.lastFire.set(player.id, ctx.now());
    join(player);
    addHeat(cfg.firePoints);
  }, { joins: () => Boolean(pot) });

  ctx.on('like', (player, count) => {
    if (!pot) return;
    join(player);
    pot.likeRem += count;
    addHeat(Math.floor(pot.likeRem / cfg.likesPerPoint));
    pot.likeRem %= cfg.likesPerPoint;
  });
  ctx.on('gift', (player, gift, quantity, value) => {
    if (!pot) return;
    join(player);
    addHeat(value * cfg.perDiamond);
  });

  function status() {
    if (pot.heat > cfg.safeMax) return pot.heat > cfg.dangerAbove ? 'LỬA QUÁ MẠNH!' : 'LỬA HƠI MẠNH';
    if (pot.heat < cfg.safeMin) return 'HỎA HẦU QUÁ YẾU';
    return 'VĂN HỎA ỔN ĐỊNH';
  }

  return {
    name: 'alchemy',
    active: () => Boolean(pot),
    heat: () => pot?.heat ?? null,
    tick() {
      if (!pot) return;
      const t = ctx.now();
      const dt = t - pot.lastTick;
      pot.lastTick = t;
      addHeat((-cfg.decayPerSec * dt) / SEC);
      if (pot.heat >= cfg.safeMin && pot.heat <= cfg.safeMax) pot.stableMs += dt;
      pot.dangerMs = pot.heat > cfg.dangerAbove ? pot.dangerMs + dt : 0;
      if (pot.dangerMs >= cfg.explodeSec * SEC) return finish('explode');
      if (t >= pot.endsAt) finish(pot.stableMs >= cfg.needStableSec * SEC ? 'success' : 'fail');
      return undefined;
    },
    snapshot(state) {
      state.alchemy = pot
        ? {
            heat: Math.round(pot.heat),
            stable: Math.floor(pot.stableMs / SEC),
            need: cfg.needStableSec,
            endsAt: pot.endsAt,
            status: status(),
            safe: [cfg.safeMin, cfg.safeMax],
            danger: cfg.dangerAbove,
            participants: pot.participants.size,
          }
        : null;
    },
  };
}
