// Mưa Linh Thạch ("Thiên Giáng Kỳ Duyên"): 30 giây, chat "nhặt", mỗi người 1 lần mỗi đợt.

import { SEC, fmt } from '../util.js';

export function createRain(ctx) {
  const { config } = ctx;
  const cfg = config.rain;
  let rain = null; // { endsAt, picked: Set, fast: number }

  function start() {
    rain = { endsAt: ctx.now() + cfg.durationSec * SEC, picked: new Set(), fast: 0 };
    ctx.emit({ kind: 'rainStart', endsAt: rain.endsAt });
    return true;
  }

  function end() {
    rain = null;
    ctx.emit({ kind: 'rainEnd' });
  }

  ctx.schedule.register('rain', {
    label: 'Mưa Linh Thạch',
    start,
    abort: end,
  });

  // Thưởng = ngẫu nhiên × hệ số linh căn × phe Đan tương hợp; 10 người nhanh nhất x2.
  ctx.command(config.keywords.pickUp, (player) => {
    if (!rain || rain.picked.has(player.id)) return;
    rain.picked.add(player.id);
    const base = ctx.randInt(cfg.rewardMin, cfg.rewardMax);
    const fast = rain.fast < cfg.fastCount;
    if (fast) rain.fast += 1;
    const faction = ctx.factions.compatible(player, 'dan') ? config.factions.dan.rainMult : 1;
    const mult = ctx.roots.mult(player) * faction * (fast ? cfg.fastMult : 1);
    const amount = ctx.gainScaled(player, base, mult, { source: 'rain' });
    ctx.fire('eventJoin', player, 'rain');
    ctx.fire('rainPick', player, { fast });
    ctx.emit({ kind: 'rainPick', id: player.id, name: player.name, amount, fast });
    ctx.log({
      kind: 'pick',
      id: player.id,
      amount,
      text: `${player.name} nhặt linh thạch${fast ? ' (nhanh)' : ''} · +${fmt(amount)} tu vi`,
      group: (n, total) => `${n} đạo hữu nhặt linh thạch · tổng +${fmt(total)} tu vi`,
      merge: 'flood',
    });
  });

  return {
    name: 'rain',
    active: () => Boolean(rain),
    tick() {
      if (rain && ctx.now() >= rain.endsAt) {
        end();
        ctx.schedule.finished('rain');
      }
    },
    snapshot(state) {
      state.rain = rain
        ? { active: true, endsAt: rain.endsAt, fast: rain.fast, fastCount: cfg.fastCount, picked: rain.picked.size }
        : { active: false };
    },
  };
}
