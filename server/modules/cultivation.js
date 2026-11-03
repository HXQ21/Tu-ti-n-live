// Tu vi từ chat, tim, chia sẻ; điểm danh; Linh Khí Triều; dòng gộp tương tác mỗi 10 giây.

import { SEC, fmt } from '../util.js';

export function createCultivation(ctx) {
  const { config } = ctx;
  const cult = config.cultivation;
  const tideCfg = config.tide;

  let roomLikes = 0;
  let milestone = 0;
  let tideUntil = 0;
  let summary = { ids: new Set(), amount: 0, since: ctx.now() };

  const tideActive = () => ctx.now() < tideUntil;

  // Không nhân chồng: đang có Linh Khí Triều thì luôn là x2.
  const chatLikeMult = (player) => ctx.product(ctx.hooks.chatLikeMult, player) * (tideActive() ? tideCfg.mult : 1);

  function extendTide() {
    const t = ctx.now();
    if (!tideActive()) {
      tideUntil = t + tideCfg.durationSec * SEC;
      ctx.notify('tide', `🌊 LINH KHÍ TRIỀU · cả phòng ${fmt(milestone * tideCfg.likesPerMilestone)} tim · tu vi x${tideCfg.mult}!`);
      ctx.emit({ kind: 'tideStart', until: tideUntil });
    } else {
      tideUntil = Math.min(tideUntil + tideCfg.durationSec * SEC, t + tideCfg.maxSec * SEC);
      ctx.emit({ kind: 'tideExtend', until: tideUntil });
      ctx.log({ kind: 'tide', text: `Linh Khí Triều kéo dài · còn ${Math.ceil((tideUntil - t) / SEC)} giây` });
    }
  }

  ctx.on('chat', (player) => {
    const t = ctx.now();
    summary.ids.add(player.id);
    if (player.lastChatRewardAt != null && t - player.lastChatRewardAt < cult.chatCooldownSec * SEC) return;
    player.lastChatRewardAt = t;
    summary.amount += ctx.gainScaled(player, cult.chatPoints, chatLikeMult(player), { source: 'chat' });
    ctx.fire('chatRewarded', player);
  });

  ctx.on('like', (player, count) => {
    summary.ids.add(player.id);
    roomLikes += count;
    while (Math.floor(roomLikes / tideCfg.likesPerMilestone) > milestone) {
      milestone += 1;
      extendTide();
    }
    player.likeRemainder += count;
    const chunks = Math.floor(player.likeRemainder / cult.likesPerReward);
    player.likeRemainder %= cult.likesPerReward;
    ctx.markDirty(player);
    if (chunks <= 0) return;
    const amount = ctx.gainScaled(player, chunks * cult.likeReward, chatLikeMult(player), { source: 'like' });
    if (amount <= 0) return;
    ctx.log({
      kind: 'likes',
      id: player.id,
      amount,
      text: `${player.name} đủ ${fmt(chunks * cult.likesPerReward)} tim · +${fmt(amount)} tu vi`,
      group: (n, total) => `${n} đạo hữu đủ ${fmt(cult.likesPerReward)} tim · tổng +${fmt(total)} tu vi`,
      merge: 'flood',
    });
  });

  ctx.on('share', (player) => {
    let amount = 0;
    if (player.sessionShares < cult.shareMaxPerSession) {
      player.sessionShares += 1;
      amount = ctx.gainScaled(player, cult.sharePoints, ctx.roots.mult(player), { source: 'share' });
    }
    ctx.log({
      kind: 'share',
      id: player.id,
      amount,
      text: `${player.name} chia sẻ tông môn${amount > 0 ? ` · +${fmt(amount)} tu vi` : ''}`,
      group: (n, total) => `${n} đạo hữu vừa chia sẻ tông môn${total > 0 ? ` · tổng +${fmt(total)} tu vi` : ''}`,
      merge: 'window',
    });
  });

  // Lần tương tác đầu tiên trong ngày (giờ Việt Nam). Bỏ một ngày thì chuỗi tính lại từ đầu.
  ctx.on('touch', (player) => {
    const day = ctx.today();
    const last = player.checkin;
    if (last?.day === day) return;
    const streak = last?.day === day - 1 ? last.streak + 1 : 1;
    player.checkin = { day, streak };
    const { base, perDay, max } = config.checkin;
    const amount = ctx.gain(player, Math.min(base + perDay * (streak - 1), max), { source: 'checkin' });
    ctx.log({
      kind: 'checkin',
      id: player.id,
      amount,
      text: `${player.name} điểm danh${streak > 1 ? ` (${streak} ngày)` : ''} · +${fmt(amount)} tu vi`,
      group: (n, total) => `${n} đạo hữu điểm danh · tổng +${fmt(total)} tu vi`,
      merge: 'window',
    });
  });

  ctx.on('sessionStart', () => {
    roomLikes = 0;
    milestone = 0;
    tideUntil = 0;
  });

  function flushSummary() {
    const { ids, amount } = summary;
    summary = { ids: new Set(), amount: 0, since: ctx.now() };
    if (ids.size === 0) return;
    ctx.log({
      kind: 'interact',
      amount,
      text: `${ids.size} đạo hữu tương tác${amount > 0 ? ` · tổng +${fmt(amount)} tu vi` : ''}`,
    });
  }

  return {
    name: 'cultivation',
    chatLikeMult,
    tideActive,
    tick() {
      if (ctx.now() - summary.since >= config.feed.summarySec * SEC) flushSummary();
    },
    flushSummary,
    snapshot(state) {
      const step = tideCfg.likesPerMilestone;
      state.room = { likes: roomLikes, next: (milestone + 1) * step };
      state.tide = tideActive() ? { active: true, until: tideUntil, mult: tideCfg.mult } : { active: false };
    },
    load(data) {
      roomLikes = data.roomLikes ?? 0;
      milestone = data.milestone ?? 0;
      tideUntil = data.tideUntil ?? 0;
    },
    save() {
      return { roomLikes, milestone, tideUntil };
    },
  };
}
