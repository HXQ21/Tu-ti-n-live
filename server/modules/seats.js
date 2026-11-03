// Ghế chức vị.
// - Hai ghế vinh danh (Lão Tổ, Thái Thượng Trưởng Lão): hạng 1, 2 tu vi tổng của toàn bộ dữ liệu, kể cả người vắng mặt.
// - Năm ghế phiên (Chưởng Môn → Thánh Tử): hạng 1 → 5 Thiên Kiêu (tu vi phiên, chỉ người có mặt), xét lại mỗi 10 giây.

import { SEC } from '../util.js';

export function createSeats(ctx) {
  const { config } = ctx;
  const names = config.seats.session;
  const elderNames = config.seats.elders;
  let elders = [null, null];
  let session = Array(names.length).fill(null);
  let lastElders = -Infinity;
  let lastReview = -Infinity;

  const byTotal = (a, b) => b.total - a.total || a.seqTotal - b.seqTotal;
  const bySession = (a, b) => ctx.sessionPoints(b) - ctx.sessionPoints(a) || a.seqSession - b.seqSession;

  function topTwo() {
    let first = null;
    let second = null;
    for (const player of ctx.players.values()) {
      if (player.total <= 0) continue;
      if (!first || byTotal(player, first) < 0) {
        second = first;
        first = player;
      } else if (!second || byTotal(player, second) < 0) {
        second = player;
      }
    }
    return [first?.id ?? null, second?.id ?? null];
  }

  function updateElders({ silent = false } = {}) {
    const next = topTwo();
    const [oldFirst, oldSecond] = elders;
    elders = next;
    if (silent) return;
    const name = (id) => ctx.players.get(id)?.name;
    if (next[0] !== oldFirst && next[0]) {
      if (oldFirst) ctx.notify('elder', `${name(next[0])} vượt qua ${name(oldFirst)} · trở thành ${elderNames[0]}`, { id: next[0], seat: 0 });
      else ctx.log({ kind: 'seat', id: next[0], text: `${name(next[0])} trở thành ${elderNames[0]}` });
      ctx.emit({ kind: 'seatChange', seat: 'elder0', id: next[0] });
    }
    if (next[1] !== oldSecond && next[1]) {
      // Lão Tổ cũ bị vượt tự xuống ghế Thái Thượng: không cần thông báo thêm.
      if (next[1] !== oldFirst) {
        if (oldSecond && oldSecond !== next[0]) {
          ctx.notify('elder', `${name(next[1])} vượt qua ${name(oldSecond)} · trở thành ${elderNames[1]}`, { id: next[1], seat: 1 });
        } else {
          ctx.log({ kind: 'seat', id: next[1], text: `${name(next[1])} trở thành ${elderNames[1]}` });
        }
      }
      ctx.emit({ kind: 'seatChange', seat: 'elder1', id: next[1] });
    }
  }

  function review() {
    const ranked = ctx
      .presentPlayers()
      .filter((p) => ctx.sessionPoints(p) > 0)
      .sort(bySession)
      .slice(0, names.length)
      .map((p) => p.id);
    const old = session;
    session = names.map((_, i) => ranked[i] ?? null);
    session.forEach((id, i) => {
      if (!id || id === old[i]) return;
      const player = ctx.players.get(id);
      ctx.emit({ kind: 'seatChange', seat: `session${i}`, id });
      if (i === 0) {
        const previous = old[0] && ctx.players.get(old[0]);
        const text = previous
          ? `👑 ${player.name} lên ngôi Chưởng Môn! · đoạt ngôi Thiên Kiêu Đệ Nhất từ ${previous.name}`
          : `👑 ${player.name} lên ngôi Chưởng Môn!`;
        ctx.notify('master', text, { id, steal: Boolean(previous) });
      } else if (!old.slice(0, i).includes(id)) {
        // Người tụt từ ghế cao xuống thì không ghi lại để Truyền Tin không bị tràn.
        ctx.log({ kind: 'seat', id, text: `${player.name} ngồi ghế ${names[i]}` });
      }
    });
  }

  ctx.on('sessionStart', () => {
    session = Array(names.length).fill(null);
    lastReview = -Infinity;
  });

  const seatView = (id) => (id ? ctx.viewOf(ctx.players.get(id)) : null);

  return {
    name: 'seats',
    elders: () => [...elders],
    sessionSeats: () => [...session],
    review,
    updateElders,
    // Người ngồi ghế phiên, hoặc ghế vinh danh khi đang có mặt, không chiếm ghế điện.
    vipIds() {
      const ids = new Set(session.filter(Boolean));
      for (const id of elders) {
        const player = id && ctx.players.get(id);
        if (player && ctx.isPresent(player)) ids.add(id);
      }
      return ids;
    },
    tick() {
      const t = ctx.now();
      if (t - lastElders >= SEC) {
        lastElders = t;
        updateElders();
      }
      if (t - lastReview >= config.seats.reviewSec * SEC) {
        lastReview = t;
        review();
      }
    },
    snapshot(state) {
      state.elders = elders.map((id, i) => ({ seat: elderNames[i], player: seatView(id) }));
      state.seats = session.map((id, i) => ({ seat: names[i], player: seatView(id) }));
    },
    load(data) {
      updateElders({ silent: true });
      if (Array.isArray(data.elders)) {
        // Giữ người cũ để lần so sánh đầu tiên sau khi khởi động lại không báo nhầm.
        elders = data.elders;
        updateElders();
      }
    },
    save() {
      return { elders };
    },
  };
}
