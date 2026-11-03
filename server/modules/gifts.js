// Quà tặng: tu vi = xu × 10 (không nhân hệ số), kèm tác dụng thêm.
// - Bật modules.vault (Phần 2 mục A): tác dụng theo bảng mốc xu của MỘT món quà, mỗi món đúng một mốc.
// - Tắt: luật Phần 1 (quà 30 xu tẩy tủy, quà 29.999 xu 10% biến dị).
// Tác dụng thuộc module khác (lượt luyện, thiên dực, độ kiếp) được phát qua sự kiện 'vaultItem'.

import { SEC, fmt } from '../util.js';

export function createGifts(ctx) {
  const { config } = ctx;
  const vaultOn = Boolean(config.modules?.vault);
  const tiers = config.vault?.tiers ?? [];

  const matches = (rule, gift) =>
    rule.giftIds.some((id) => String(id) === gift.giftId) || gift.diamonds === rule.diamondCount;

  const tierOf = (diamonds) => tiers.find((t) => diamonds >= t.min && (t.max === null || diamonds <= t.max)) ?? null;

  function legacyEffects(player, gift, quantity) {
    if (matches(config.gifts.washMarrow, gift)) {
      for (let i = 0; i < quantity; i++) {
        if (!ctx.roots.wash(player, 'gift')) break;
      }
    }
    if (matches(config.gifts.mutation, gift)) {
      for (let i = 0; i < quantity; i++) {
        if (ctx.roots.mutate(player, config.gifts.mutation.chance, 'gift') || !ctx.roots.canMutate(player)) break;
      }
    }
  }

  // Tụ Khí Đan: không cộng dồn, tặng tiếp thì làm mới thời gian.
  const tuKhiActive = (player) => (player.tuKhiUntil ?? 0) > ctx.now();
  if (vaultOn) ctx.hooks.chatLikeMult.push((player) => (tuKhiActive(player) ? config.vault.tuKhiMult : 1));

  function vaultEffects(player, gift, quantity) {
    const tier = tierOf(gift.diamonds);
    if (!tier) return;
    if (tier.id === 'tuKhi') {
      player.tuKhiUntil = ctx.now() + config.vault.tuKhiSec * SEC;
      ctx.markDirty(player);
      ctx.log({ kind: 'gift', id: player.id, text: `${player.name} dùng Tụ Khí Đan · tu vi chat/tim x${config.vault.tuKhiMult} trong ${config.vault.tuKhiSec} giây` });
    }
    if (tier.id === 'tayTuy') {
      let washed = 0;
      for (let i = 0; i < quantity && ctx.roots.wash(player, 'gift'); i++) washed += 1;
      if (washed === 0) ctx.log({ kind: 'wash', id: player.id, text: `${player.name} dùng Tẩy Tủy Đan · linh căn đã tinh thuần` });
    }
    if (tier.id === 'thienMenh') {
      for (let i = 0; i < quantity; i++) {
        if (ctx.roots.mutate(player, config.vault.mutationChance, 'gift') || !ctx.roots.canMutate(player)) break;
      }
    }
    ctx.fire('vaultItem', player, tier, quantity, gift);
    ctx.emit({ kind: 'vaultItem', id: player.id, item: tier.id, quantity });
  }

  ctx.on('gift', (player, gift, quantity, value) => {
    const amount = ctx.gain(player, value * config.cultivation.pointsPerDiamond, { source: 'gift' });
    const tier = vaultOn ? tierOf(gift.diamonds) : null;
    const item = tier && tier.id !== 'linhThach' ? ` · ${tier.name}` : '';
    ctx.emit({ kind: 'gift', id: player.id, name: player.name, giftName: gift.giftName, quantity, diamonds: gift.diamonds, amount });
    ctx.log({
      kind: 'gift',
      id: player.id,
      amount,
      text: `${player.name} tặng ${gift.giftName}${quantity > 1 ? ` x${quantity}` : ''}${item} · +${fmt(amount)} tu vi`,
      group: (n, total) => `${n} đạo hữu tặng quà · tổng +${fmt(total)} tu vi`,
      merge: 'flood',
    });
    if (value >= config.gifts.bigGiftDiamonds) {
      ctx.notify('bigGift', `🎁 ${player.name} tặng ${gift.giftName}${quantity > 1 ? ` x${quantity}` : ''}!`, { id: player.id });
    }
    if (vaultOn) vaultEffects(player, gift, quantity);
    else legacyEffects(player, gift, quantity);
  });

  ctx.hooks.card.push((player, card) => {
    if (tuKhiActive(player)) card.buffs = [...(card.buffs ?? []), `Tụ Khí Đan còn ${Math.ceil((player.tuKhiUntil - ctx.now()) / SEC)}s`];
  });

  return { name: 'gifts', tierOf, tuKhiActive };
}
