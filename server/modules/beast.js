// Phần 2 mục E: Dị thú (sưu tầm, ba phẩm).
// Mỗi người có nhiều dị thú; con xuất chiến được tính hệ số và hiện cạnh avatar.
// Mặc định con xuất chiến là con phẩm cao nhất (cùng phẩm thì cấp cao hơn). Kinh nghiệm luôn vào con xuất chiến.

import { SEC, fmt, normalizeText } from '../util.js';

export function createBeast(ctx) {
  const { config } = ctx;
  const cfg = config.beast;
  const byId = new Map(cfg.list.map((b) => [b.id, b]));
  const tierOf = (id) => cfg.tiers[byId.get(id).tier];

  const owned = (player) => Object.keys(player.beasts ?? {});

  // Con xuất chiến: con người chơi tự chọn, nếu không thì con mạnh nhất.
  function activeId(player) {
    const list = owned(player);
    if (list.length === 0) return null;
    if (player.beastActive && player.beasts[player.beastActive]) return player.beastActive;
    return list.reduce((best, id) => {
      const a = tierOf(id).rank * 100 + player.beasts[id].level;
      const b = tierOf(best).rank * 100 + player.beasts[best].level;
      return a > b ? id : best;
    });
  }

  function addExpTo(player, id, amount, source) {
    const beast = player.beasts?.[id];
    if (!beast || amount <= 0) return 0;
    if (beast.level >= cfg.maxLevel) return 0;
    beast.exp += amount;
    while (beast.level < cfg.maxLevel && beast.exp >= cfg.expPerLevel * beast.level) {
      beast.exp -= cfg.expPerLevel * beast.level;
      beast.level += 1;
      ctx.log({ kind: 'beast', id: player.id, text: `${byId.get(id).name} của ${player.name} lên cấp ${beast.level}` });
      ctx.emit({ kind: 'beastLevel', id: player.id, beast: id, level: beast.level });
    }
    if (beast.level >= cfg.maxLevel) beast.exp = 0;
    ctx.markDirty(player);
    ctx.emit({ kind: 'beastExp', id: player.id, beast: id, amount, source });
    return amount;
  }

  // Kinh nghiệm luôn cộng vào con xuất chiến.
  const addExp = (player, amount, source) => {
    const id = activeId(player);
    return id ? addExpTo(player, id, amount, source) : 0;
  };

  // Nhận một con: đã có thì quy thành kinh nghiệm cho chính con đó, không tạo bản sao.
  function grant(player, id, source) {
    player.beasts ??= {};
    const spec = byId.get(id);
    if (player.beasts[id]) {
      addExpTo(player, id, cfg.duplicateExp, 'duplicate');
      ctx.log({ kind: 'beast', id: player.id, text: `${player.name} gặp lại ${spec.name} · +${fmt(cfg.duplicateExp)} kinh nghiệm` });
      return { id, duplicate: true };
    }
    player.beasts[id] = { level: 1, exp: 0, at: ctx.nextSeq() };
    ctx.markDirty(player);
    ctx.emit({ kind: 'beastNew', id: player.id, beast: id, tier: spec.tier, source });
    if (spec.tier === 'than') {
      ctx.notify('beast', `🐉 ${player.name} thu phục Thần thú ${spec.name}!`, { id: player.id });
    } else {
      ctx.log({
        kind: 'beast',
        id: player.id,
        text: `${player.name} thu phục ${tierOf(id).name} ${spec.name}${source ? ` · ${source}` : ''}`,
        group: (n) => `${n} đạo hữu thu phục dị thú`,
        merge: 'window',
      });
    }
    return { id, duplicate: false };
  }

  const randomOfTier = (tier) => ctx.pick(cfg.list.filter((b) => b.tier === tier)).id;

  function ensureStarter(player) {
    if (owned(player).length > 0) return;
    grant(player, randomOfTier('pham'), 'nhập môn');
  }

  ctx.hooks.newPlayer.push((player) => {
    player.beasts = {};
    player.beastActive = null;
    player.beastLikeRem = 0;
  });
  ctx.on('join', ensureStarter);
  ctx.on('touch', ensureStarter);

  // Mỗi 200 tim +1 kinh nghiệm.
  ctx.on('like', (player, count) => {
    player.beastLikeRem = (player.beastLikeRem ?? 0) + count;
    const exp = Math.floor(player.beastLikeRem / cfg.likesPerExp);
    player.beastLikeRem %= cfg.likesPerExp;
    if (exp > 0) addExp(player, exp, 'like');
  });

  ctx.on('chestOpened', (player) => addExp(player, cfg.chestExp, 'chest'));

  // Sát thương boss và chiến lực: (1 + t × cấp con xuất chiến).
  function multOf(player) {
    const id = activeId(player);
    return id ? 1 + tierOf(id).perLevel * player.beasts[id].level : 1;
  }
  ctx.hooks.bossDamageMult.push(multOf);

  ctx.prefixCommand(cfg.switchKeywords, (player, arg) => {
    const wanted = normalizeText(arg);
    if (!wanted) return;
    const id = owned(player).find((bid) => normalizeText(byId.get(bid).name) === wanted)
      ?? owned(player).find((bid) => normalizeText(byId.get(bid).name).includes(wanted));
    if (!id) return;
    if (ctx.boss?.active()) {
      ctx.emit({ kind: 'beastDenied', id: player.id, reason: 'boss' });
      return;
    }
    const t = ctx.now();
    if (player.beastSwitchAt && t - player.beastSwitchAt < cfg.switchCooldownSec * SEC) return;
    player.beastSwitchAt = t;
    player.beastActive = id;
    ctx.markDirty(player);
    ctx.log({ kind: 'beast', id: player.id, text: `${player.name} cho ${byId.get(id).name} xuất chiến` });
  });

  ctx.hooks.view.push((player, view) => {
    const id = activeId(player);
    if (id) view.beast = { id, image: byId.get(id).image, level: player.beasts[id].level, tier: byId.get(id).tier };
  });

  ctx.hooks.card.push((player, card) => {
    const id = activeId(player);
    if (!id) return;
    const beast = player.beasts[id];
    card.beast = {
      name: byId.get(id).name,
      tier: tierOf(id).name,
      level: beast.level,
      exp: beast.exp,
      need: beast.level >= cfg.maxLevel ? null : cfg.expPerLevel * beast.level,
      owned: owned(player).length,
    };
  });

  return { name: 'beast', activeId, addExp, addExpTo, grant, randomOfTier, multOf, owned, byId };
}
