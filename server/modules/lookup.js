// Hồ sơ "check": mỗi người 1 lần mỗi 30 giây, mỗi lần hiện 1 thẻ 6 giây, hàng chờ tối đa 5.

import { SEC } from '../util.js';

export function createLookup(ctx) {
  const { config } = ctx;
  const cfg = config.lookup;
  let card = null;
  let queue = [];

  function nextRealm(player) {
    const index = player.realmIndex + 1;
    return index < config.realms.length ? config.realms[index] : null;
  }

  function sessionRank(player) {
    const points = ctx.sessionPoints(player);
    if (points <= 0) return null;
    let rank = 1;
    for (const other of ctx.presentPlayers()) {
      const p = ctx.sessionPoints(other);
      if (p > points || (p === points && other.seqSession < player.seqSession)) rank += 1;
    }
    return rank;
  }

  function cardOf(player) {
    const { root } = player;
    const next = nextRealm(player);
    const seats = ctx.seats.sessionSeats();
    const elders = ctx.seats.elders();
    const seatIndex = seats.indexOf(player.id);
    const elderIndex = elders.indexOf(player.id);
    const positions = [];
    if (elderIndex >= 0) positions.push(config.seats.elders[elderIndex]);
    if (seatIndex >= 0) positions.push(config.seats.session[seatIndex]);
    const card = {
      id: player.id,
      name: player.name,
      avatar: ctx.avatarOf(player),
      rank: ctx.rankName(player),
      faction: player.faction ? config.factions[player.faction].name : null,
      positions,
      titles: ctx.titlesOf(player),
      realm: ctx.labelOf(player),
      realmIndex: player.realmIndex,
      total: player.total,
      next: next ? { name: next.name, min: next.min, missing: Math.max(next.min - player.total, 0) } : null,
      rootName: ctx.roots.rootName(player),
      main: config.elements[root.main].name,
      mainId: root.main,
      elements: root.elements.map((id) => config.elements[id].name),
      mult: ctx.roots.mult(player),
      sessionRank: sessionRank(player),
      session: ctx.sessionPoints(player),
      quests: ctx.quests.progressOf(player),
      chest: ctx.quests.chestOpened(player),
      streak: player.checkin?.day >= ctx.today() - 1 ? player.checkin.streak : 0,
    };
    for (const fn of ctx.hooks.card) fn(player, card);
    return card;
  }

  // Chỗ cắm Phần 2: độ kiếp có thể hoãn thẻ (tối đa 30 giây).
  const blockers = [];

  function pump() {
    const t = ctx.now();
    if (card && t < card.until) return;
    card = null;
    if (queue.length === 0 || blockers.some((fn) => fn())) return;
    const id = queue.shift();
    const player = ctx.players.get(id);
    if (!player) return;
    card = { ...cardOf(player), until: t + cfg.cardSec * SEC };
    ctx.emit({ kind: 'lookupCard', card });
  }

  ctx.command(config.keywords.lookup, (player) => {
    const t = ctx.now();
    if (player.lastLookupAt != null && t - player.lastLookupAt < cfg.cooldownSec * SEC) return;
    player.lastLookupAt = t;
    ctx.markDirty(player);
    queue = queue.filter((id) => id !== player.id);
    queue.push(player.id);
    while (queue.length > cfg.maxQueue) queue.shift();
    pump();
  });

  return {
    name: 'lookup',
    cardOf,
    blockers,
    tick: pump,
    snapshot(state) {
      state.card = card;
      state.cardQueue = queue.length;
    },
  };
}
