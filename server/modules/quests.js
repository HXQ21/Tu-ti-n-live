// Nhiệm vụ ngày: thả 100 tim, bình luận 5 lần, tham gia 1 sự kiện. Reset 00:00 giờ Việt Nam.
// Xong cả ba thì tự mở Rương Nhiệm Vụ, tối đa 1 lần mỗi ngày.

import { fmt } from '../util.js';

export function createQuests(ctx) {
  const { config } = ctx;
  const { list, chestReward } = config.quests;

  function stateOf(player) {
    const day = ctx.today();
    if (player.quests?.day !== day) {
      player.quests = { day, progress: Object.fromEntries(list.map((q) => [q.id, 0])), chest: false };
    }
    return player.quests;
  }

  function advance(player, id, step = 1) {
    const quest = list.find((q) => q.id === id);
    if (!quest) return;
    const state = stateOf(player);
    const before = state.progress[id];
    if (before >= quest.need) return;
    state.progress[id] = Math.min(before + step, quest.need);
    ctx.markDirty(player);
    if (state.progress[id] < quest.need) return;
    ctx.log({
      kind: 'quest',
      id: player.id,
      text: `${player.name} hoàn thành nhiệm vụ: ${quest.name}`,
      group: (n) => `${n} lượt hoàn thành nhiệm vụ ngày`,
      merge: 'flood',
    });
    if (state.chest || list.some((q) => state.progress[q.id] < q.need)) return;
    state.chest = true;
    const amount = ctx.gain(player, chestReward, { source: 'chest' });
    ctx.fire('chestOpened', player);
    ctx.emit({ kind: 'chest', id: player.id, name: player.name, amount });
    ctx.log({
      kind: 'chest',
      id: player.id,
      amount,
      text: `${player.name} hoàn thành nhiệm vụ ngày · +${fmt(amount)} tu vi`,
      group: (n, total) => `${n} đạo hữu mở Rương Nhiệm Vụ · tổng +${fmt(total)} tu vi`,
      merge: 'flood',
    });
  }

  ctx.on('like', (player, count) => advance(player, 'likes', count));
  ctx.on('chatRewarded', (player) => advance(player, 'chats'));
  ctx.on('eventJoin', (player) => advance(player, 'event'));

  return {
    name: 'quests',
    progressOf(player) {
      const state = stateOf(player);
      return list.map((q) => ({ id: q.id, name: q.name, need: q.need, done: state.progress[q.id] }));
    },
    chestOpened: (player) => stateOf(player).chest,
    advance,
    snapshot(state) {
      state.quests = { list: list.map((q) => ({ id: q.id, name: q.name })), chestReward };
    },
  };
}
