// Lịch Thiên Đạo: bộ điều phối duy nhất cho mọi sự kiện lớn, bảo đảm không bao giờ chồng nhau.
// Module sự kiện đăng ký bằng register(type, { label, start, abort }) và báo xong bằng finished().
// Linh Khí Triều không thuộc lịch.

import { MIN, SEC } from '../util.js';

export function createSchedule(ctx) {
  const { config } = ctx;
  const { cycleMin, slots, gapSec, maxLateMin } = config.schedule;
  const cycleMs = cycleMin * MIN;
  const handlers = new Map();

  let base = 0; // Mốc phút 00 của chu kỳ đầu, bị dời khi tạm dừng.
  let k = 0; // Lượt kế tiếp trong lịch.
  let pending = []; // { type, due, delayed, manual }
  let running = null; // { type, startedAt }
  let freeAt = -Infinity;
  let paused = false;
  let lastTick = ctx.now();

  const occurrence = (index) => ({
    type: slots[index % slots.length].type,
    due: base + Math.floor(index / slots.length) * cycleMs + slots[index % slots.length].min * MIN,
  });

  function firstIndexAfter(t) {
    let index = Math.max(Math.floor((t - base) / cycleMs) * slots.length, 0);
    while (occurrence(index).due <= t) index += 1;
    return index;
  }

  function reset(startedAt) {
    base = startedAt;
    k = 0;
    pending = [];
    running = null;
    freeAt = -Infinity;
  }

  function abortRunning() {
    if (running) handlers.get(running.type)?.abort?.();
    running = null;
  }

  function begin(item) {
    const handler = handlers.get(item.type);
    if (!handler) return; // Khe chưa có sự kiện (ví dụ khe phút 12 ở Phần 1).
    if (!handler.start({ manual: item.manual })) return;
    running = { type: item.type, startedAt: ctx.now() };
    ctx.emit({ kind: 'scheduleStart', type: item.type });
  }

  function tick() {
    const t = ctx.now();
    const dt = t - lastTick;
    lastTick = t;
    if (!ctx.session.active) return;
    if (paused) {
      base += dt;
      for (const item of pending) item.due += dt;
      return;
    }
    while (occurrence(k).due <= t) {
      const item = occurrence(k);
      pending.push({ ...item, delayed: Boolean(running), manual: false });
      k += 1;
    }
    if (running) {
      for (const item of pending) item.delayed = true;
      return;
    }
    while (pending.length > 0) {
      const item = pending[0];
      if (t - item.due > maxLateMin * MIN) {
        pending.shift();
        ctx.emit({ kind: 'scheduleSkip', type: item.type });
        continue;
      }
      const earliest = item.delayed ? Math.max(item.due, freeAt + gapSec * SEC) : item.due;
      if (t < earliest) return;
      pending.shift();
      begin(item);
      if (running) return;
    }
  }

  ctx.on('sessionStart', (session) => reset(session.startedAt));
  ctx.on('sessionEnding', () => {
    abortRunning();
    pending = [];
  });

  // Dự kiến giờ bắt đầu của các sự kiện sắp tới, bỏ qua khe chưa có sự kiện.
  function upcoming(count = config.schedule.upcoming) {
    if (!ctx.session.active) return [];
    const list = [];
    // at = null: đang chờ sự kiện hiện tại kết thúc.
    for (const item of pending) {
      if (!handlers.has(item.type)) continue;
      const at = running ? null : item.delayed ? Math.max(item.due, freeAt + gapSec * SEC) : item.due;
      list.push({ type: item.type, label: handlers.get(item.type).label, at });
    }
    for (let index = k; list.length < count && index < k + slots.length * 4; index++) {
      const item = occurrence(index);
      if (!handlers.has(item.type)) continue;
      list.push({ type: item.type, label: handlers.get(item.type).label, at: item.due });
    }
    return list.slice(0, count);
  }

  return {
    name: 'schedule',

    register(type, handler) {
      handlers.set(type, handler);
    },

    finished(type) {
      if (running?.type !== type) return;
      running = null;
      freeAt = ctx.now();
      ctx.emit({ kind: 'scheduleEnd', type });
    },

    // Nút "gọi ngay" cũng đi qua lịch: đang có sự kiện thì chờ xong + 30 giây.
    request(type) {
      if (!handlers.has(type)) return false;
      if (pending.some((item) => item.type === type && item.manual)) return false;
      pending.push({ type, due: ctx.now(), delayed: Boolean(running), manual: true });
      pending.sort((a, b) => a.due - b.due);
      tick();
      return true;
    },

    // Sự kiện do người chơi gọi (độ kiếp, khiêu chiến): chỉ chạy khi lịch đang rảnh và không có lượt nào đang chờ.
    claim(type) {
      if (!ctx.session.active || running || pending.length > 0) return false;
      running = { type, startedAt: ctx.now() };
      return true;
    },

    running: () => running?.type ?? null,
    busy: () => Boolean(running),
    upcoming,

    commands: {
      pause(args) {
        paused = args.on ?? !paused;
        ctx.emit({ kind: 'schedulePause', paused });
        return true;
      },
    },

    tick,

    snapshot(state) {
      state.schedule = { paused, running: running?.type ?? null, upcoming: upcoming() };
    },

    load(data) {
      paused = Boolean(data.paused);
      if (ctx.session.active) {
        base = data.base ?? ctx.session.startedAt;
        k = firstIndexAfter(ctx.now());
      }
      lastTick = ctx.now();
    },

    save() {
      return { base, paused };
    },
  };
}
