// Phần 2 mục J: Bí Cảnh (khe phút 12). Cổng mở 60 giây, từ Trúc Cơ trở lên chat "bí cảnh" để vào.
// Cổng đóng: mỗi người nhận ngẫu nhiên 1 phần thưởng theo tỉ lệ trong config (tu vi, kinh nghiệm dị thú,
// lượt luyện, Linh Thú Đản, Tẩy Tủy Đan). Đây là nơi săn dị thú chính của người không tặng quà.

import { SEC, fmt } from '../util.js';

export function createSecret(ctx) {
  const { config } = ctx;
  const cfg = config.secret;
  const minRealm = Math.max(config.realms.findIndex((r) => r.name === cfg.minRealm), 0);
  let gate = null; // { endsAt, inside: [] }

  function start() {
    gate = { endsAt: ctx.now() + cfg.openSec * SEC, inside: [] };
    ctx.emit({ kind: 'secretOpen', endsAt: gate.endsAt });
    return true;
  }

  function roll() {
    const total = cfg.rewards.reduce((sum, r) => sum + r.weight, 0);
    let value = ctx.random() * total;
    for (const reward of cfg.rewards) {
      value -= reward.weight;
      if (value < 0) return reward;
    }
    return cfg.rewards[0];
  }

  // Phần thưởng thuộc module đang tắt thì đổi thành tu vi.
  function give(player, reward) {
    const source = 'Bí Cảnh';
    const cultivation = (amount) => {
      const got = ctx.gain(player, amount, { source: 'secret' });
      ctx.log({ kind: 'event', id: player.id, amount: got, text: `${player.name} nhận +${fmt(got)} tu vi từ ${source}` });
      return { reward: 'cultivation', amount: got };
    };
    switch (reward.id) {
      case 'beastExp':
        if (ctx.drops?.beastExp(player, reward.amount, source)) return { reward: reward.id, amount: reward.amount };
        return cultivation(cfg.rewards[0].min);
      case 'refine':
        if (ctx.drops?.refines(player, reward.amount, source)) return { reward: reward.id, amount: reward.amount };
        return cultivation(cfg.rewards[0].min);
      case 'egg':
        if (ctx.drops) {
          ctx.drops.giveEgg(player, { source });
          return { reward: reward.id };
        }
        return cultivation(cfg.rewards[0].min);
      case 'wash':
        if (ctx.roots.canWash(player)) {
          ctx.roots.wash(player, 'secret');
          return { reward: reward.id };
        }
        return cultivation(reward.fallback);
      default:
        return cultivation(ctx.randInt(reward.min, reward.max));
    }
  }

  function close() {
    const results = [];
    for (const id of gate.inside) {
      const player = ctx.players.get(id);
      if (player) results.push({ id, name: player.name, ...give(player, roll()) });
    }
    ctx.emit({ kind: 'secretClose', results });
    gate = null;
    ctx.events.finished('secret');
  }

  ctx.events.register('secret', { label: 'Bí Cảnh', start, abort: () => (gate = null) });

  ctx.command(cfg.keywords, (player) => {
    if (!gate || gate.inside.includes(player.id)) return;
    if (player.realmIndex < minRealm) {
      ctx.emit({ kind: 'secretDenied', id: player.id });
      return;
    }
    gate.inside.push(player.id);
    ctx.fire('eventJoin', player, 'secret');
    ctx.log({
      kind: 'event',
      id: player.id,
      text: `${player.name} tiến vào bí cảnh`,
      group: (n) => `${n} đạo hữu tiến vào bí cảnh`,
      merge: 'window',
    });
  }, { joins: () => Boolean(gate) });

  return {
    name: 'secret',
    roll,
    active: () => Boolean(gate),
    tick() {
      if (gate && ctx.now() >= gate.endsAt) close();
    },
    snapshot(state) {
      state.secret = gate ? { endsAt: gate.endsAt, inside: gate.inside.length, minRealm: cfg.minRealm } : null;
    },
  };
}
