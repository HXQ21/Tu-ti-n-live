// Điện: lưới 6 × 6 ghế cho người CÓ MẶT không ngồi ghế VIP.
// Điện đầy: người chờ vừa tương tác thì người trong điện im lặng lâu nhất nhường ghế.
// Mỗi người giữ đúng ô của mình để màn hình không nhảy.

import { SEC } from '../util.js';

export function createHall(ctx) {
  const { config } = ctx;
  const size = config.presence.hallColumns * config.presence.hallRows;
  let seats = Array(size).fill(null);
  let waiting = 0;
  let lastRun = -Infinity;

  function arrange() {
    const vip = ctx.seats?.vipIds() ?? new Set();
    const seated = new Set();
    for (let i = 0; i < size; i++) {
      const player = seats[i] && ctx.players.get(seats[i]);
      if (!player || !ctx.isPresent(player) || vip.has(player.id)) seats[i] = null;
      else seated.add(player.id);
    }

    const queue = ctx
      .presentPlayers()
      .filter((p) => !seated.has(p.id) && !vip.has(p.id))
      .sort((a, b) => b.lastSeen - a.lastSeen);

    let next = 0;
    for (let i = 0; i < size && next < queue.length; i++) {
      if (seats[i] !== null) continue;
      seats[i] = queue[next].id;
      seated.add(queue[next].id);
      next += 1;
    }

    // Đổi chỗ chỉ khi người chờ đã tương tác gần đây hơn người im lặng lâu nhất trong điện.
    while (next < queue.length) {
      let quietest = -1;
      for (let i = 0; i < size; i++) {
        if (quietest < 0 || ctx.players.get(seats[i]).lastSeen < ctx.players.get(seats[quietest]).lastSeen) quietest = i;
      }
      const candidate = queue[next];
      if (quietest < 0 || candidate.lastSeen <= ctx.players.get(seats[quietest]).lastSeen) break;
      seats[quietest] = candidate.id;
      next += 1;
    }
    waiting = queue.length - next;
  }

  ctx.on('sessionStart', () => {
    lastRun = -Infinity;
  });

  return {
    name: 'hall',
    arrange,
    seatIds: () => [...seats],
    tick() {
      const t = ctx.now();
      if (t - lastRun < SEC) return;
      lastRun = t;
      arrange();
    },
    snapshot(state, present) {
      state.hall = {
        seats: seats.map((id) => (id ? ctx.viewOf(ctx.players.get(id)) : null)),
        waiting,
        closed: ctx.players.size - present.length,
        columns: config.presence.hallColumns,
      };
    },
  };
}
