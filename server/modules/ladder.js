// Phần 2 mục I: Đăng Thiên Thê (đua leo 90 giây trong khe phút 12).
// "leo" +1 bậc (1 lần/2 giây), mỗi 10 tim +1 bậc, quà xu × 1 bậc.
// Kết thúc: top 3 +300/+200/+100 tu vi, mọi người tham gia +20; hạng 1 nhận 1 Linh Thú Đản thường (không tính giới hạn).

import { SEC, fmt } from '../util.js';

export function createLadder(ctx) {
  const { config } = ctx;
  const cfg = config.ladder;
  let race = null; // { endsAt, climbers: Map<id, { steps, seq, lastClimb, likeRem }> }

  function start() {
    race = { endsAt: ctx.now() + cfg.durationSec * SEC, climbers: new Map() };
    ctx.emit({ kind: 'ladderStart', endsAt: race.endsAt });
    return true;
  }

  function climber(player) {
    let entry = race.climbers.get(player.id);
    if (!entry) {
      entry = { steps: 0, seq: 0, lastClimb: -Infinity, likeRem: 0 };
      race.climbers.set(player.id, entry);
      ctx.fire('eventJoin', player, 'ladder');
    }
    return entry;
  }

  function climb(entry, steps) {
    if (steps <= 0) return;
    entry.steps += steps;
    entry.seq = ctx.nextSeq();
  }

  const ranked = () =>
    [...race.climbers.entries()]
      .filter(([, e]) => e.steps > 0)
      .sort((a, b) => b[1].steps - a[1].steps || a[1].seq - b[1].seq);

  function finish() {
    const order = ranked();
    let total = 0;
    for (const [id] of race.climbers) {
      const player = ctx.players.get(id);
      if (player) total += ctx.gain(player, cfg.participation, { source: 'ladder' });
    }
    ctx.log({ kind: 'event', amount: total, text: `Đăng Thiên Thê kết thúc · ${race.climbers.size} đạo hữu mỗi người +${fmt(cfg.participation)} tu vi` });
    const top = order.slice(0, cfg.top.length).map(([id, entry], i) => {
      const player = ctx.players.get(id);
      const reward = ctx.gain(player, cfg.top[i], { source: 'ladder' });
      ctx.log({ kind: 'event', id, amount: reward, text: `${player.name} hạng ${i + 1} Thiên Thê (${fmt(entry.steps)} bậc) · +${fmt(reward)} tu vi` });
      return { id, name: player.name, steps: entry.steps, reward };
    });
    if (top[0]) ctx.drops?.giveEgg(ctx.players.get(top[0].id), { capped: false, source: 'Đăng Thiên Thê' });
    ctx.emit({ kind: 'ladderEnd', top });
    race = null;
    ctx.events.finished('ladder');
  }

  ctx.events.register('ladder', { label: 'Đăng Thiên Thê', start, abort: () => (race = null) });

  ctx.command(cfg.keywords, (player) => {
    if (!race) return;
    const entry = climber(player);
    if (ctx.now() - entry.lastClimb < cfg.climbCooldownSec * SEC) return;
    entry.lastClimb = ctx.now();
    climb(entry, 1);
  }, { joins: () => Boolean(race) });

  ctx.on('like', (player, count) => {
    if (!race) return;
    const entry = climber(player);
    entry.likeRem += count;
    climb(entry, Math.floor(entry.likeRem / cfg.likesPerStep));
    entry.likeRem %= cfg.likesPerStep;
  });
  ctx.on('gift', (player, gift, quantity, value) => {
    if (race) climb(climber(player), value * cfg.perDiamond);
  });

  return {
    name: 'ladder',
    active: () => Boolean(race),
    tick() {
      if (race && ctx.now() >= race.endsAt) finish();
    },
    snapshot(state) {
      if (!race) {
        state.ladder = null;
        return;
      }
      state.ladder = {
        endsAt: race.endsAt,
        climbers: race.climbers.size,
        top: ranked().slice(0, cfg.show).map(([id, e]) => ({ ...ctx.viewOf(ctx.players.get(id)), steps: e.steps })),
      };
    },
  };
}
