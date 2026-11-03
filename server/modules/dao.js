// Phần 2 mục K: Chính Đạo – Ma Đạo (đạo tâm, tách biệt với phe kiếm/đan/trận).
// Mặc định Chính Đạo; chat "ma đạo"/"chính đạo" để đổi (1 lần mỗi 30 phút).
// Mỗi 30 phút so tổng tu vi phiên kiếm được trong 30 phút đó của người có mặt mỗi bên;
// bên cao hơn "Thống Trị": tu vi chat/tim x1.1 cho cả bên trong 30 phút kế tiếp.

import { MIN } from '../util.js';

export function createDao(ctx) {
  const { config } = ctx;
  const cfg = config.dao;
  const sides = ['chinh', 'ma'];
  let window = { since: ctx.now(), totals: { chinh: 0, ma: 0 } };
  let ruler = null; // { side, until }

  const sideOf = (player) => player.dao ?? 'chinh';
  const ruling = () => (ruler && ctx.now() < ruler.until ? ruler.side : null);

  for (const side of sides) {
    ctx.command(cfg.keywords[side], (player) => {
      if (sideOf(player) === side) return;
      const t = ctx.now();
      if (player.daoChangedAt && t - player.daoChangedAt < cfg.changeCooldownMin * MIN) {
        ctx.emit({ kind: 'daoDenied', id: player.id });
        return;
      }
      player.dao = side;
      player.daoChangedAt = t;
      ctx.markDirty(player);
      ctx.log({ kind: 'faction', id: player.id, text: `${player.name} nhập ${cfg.names[side]}` });
    });
  }

  ctx.hooks.chatLikeMult.push((player) => (ruling() === sideOf(player) ? cfg.mult : 1));

  // Chỉ tính tu vi phiên của người đang có mặt.
  ctx.on('gain', (player, amount, source) => {
    if (source === 'sessionEnd' || source === 'refund' || source === 'test') return;
    if (!ctx.session.active || !ctx.isPresent(player)) return;
    window.totals[sideOf(player)] += amount;
  });

  function judge() {
    const { chinh, ma } = window.totals;
    const t = ctx.now();
    if (chinh !== ma) {
      const side = chinh > ma ? 'chinh' : 'ma';
      ruler = { side, until: t + cfg.windowMin * MIN };
      ctx.log({ kind: 'faction', text: `${cfg.names[side]} thống trị · tu vi chat/tim x${cfg.mult} trong ${cfg.windowMin} phút` });
      ctx.emit({ kind: 'daoRule', side, until: ruler.until });
    }
    window = { since: t, totals: { chinh: 0, ma: 0 } };
  }

  ctx.on('sessionStart', () => {
    window = { since: ctx.now(), totals: { chinh: 0, ma: 0 } };
    ruler = null;
  });

  ctx.hooks.view.push((player, view) => {
    if (sideOf(player) === 'ma') view.dao = 'ma';
  });
  ctx.hooks.card.push((player, card) => {
    card.dao = cfg.names[sideOf(player)];
  });

  return {
    name: 'dao',
    sideOf,
    ruling,
    judge,
    totals: () => ({ ...window.totals }),
    tick() {
      if (ctx.session.active && ctx.now() - window.since >= cfg.windowMin * MIN) judge();
    },
    snapshot(state) {
      state.dao = { ruling: ruling(), until: ruler?.until ?? null, totals: { ...window.totals } };
    },
    load(data) {
      if (data.ruler) ruler = data.ruler;
    },
    save() {
      return { ruler };
    },
  };
}
