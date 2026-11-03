// Phần 2 mục F: Thiên dực cấp 1–5.
// Nhận từ quà mốc 1.000 xu trở lên (Bảo Khố) hoặc rơi từ boss (người ra đòn cuối 20%).
// Mỗi cấp +5% tu vi chat/tim, +5% sát thương boss và chiến lực.

export function createWings(ctx) {
  const cfg = ctx.config.wings;
  const level = (player) => player.wings ?? 0;
  const multOf = (player) => 1 + cfg.perLevel * level(player);

  // Trả về số cấp thực sự tăng (đã cấp 5 thì phần dư bỏ đi).
  function raise(player, count, source) {
    const before = level(player);
    const after = Math.min(before + count, cfg.maxLevel);
    if (after === before) return 0;
    player.wings = after;
    ctx.markDirty(player);
    ctx.log({ kind: 'wings', id: player.id, text: `${player.name} thiên dực lên cấp ${after}${source ? ` · ${source}` : ''}` });
    ctx.emit({ kind: 'wings', id: player.id, level: after });
    return after - before;
  }

  ctx.hooks.chatLikeMult.push(multOf);
  ctx.hooks.bossDamageMult.push(multOf);

  ctx.on('vaultItem', (player, tier, quantity) => {
    if (tier.id === 'thienDuc' || tier.id === 'thienMenh') raise(player, quantity, tier.name);
  });

  ctx.on('bossKilled', ({ lastHitter }) => {
    if (ctx.random() < cfg.lastHitChance) raise(lastHitter, 1, 'rơi từ boss');
  });

  ctx.hooks.view.push((player, view) => {
    if (level(player) > 0) view.wings = level(player);
  });
  ctx.hooks.card.push((player, card) => {
    card.wings = level(player);
  });

  return { name: 'wings', level, multOf, raise };
}
