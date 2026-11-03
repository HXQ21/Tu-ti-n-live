// Phần 2 mục D: Pháp bảo bản mệnh.
// Mỗi người một pháp bảo ngẫu nhiên; luyện đủ lượt thì lên phẩm Phàm → Linh → Bảo → Tiên khí.
// Lượt luyện tự cộng ngay khi nhận (không có túi đồ). Phẩm nhân sát thương boss và chiến lực.

import { fmt } from '../util.js';

export function createArtifact(ctx) {
  const { config } = ctx;
  const cfg = config.artifact;
  const maxGrade = cfg.grades.length - 1;

  function unlock(player, { silent = false } = {}) {
    if (player.artifact) return;
    player.artifact = { index: Math.floor(ctx.random() * cfg.list.length), grade: 0, progress: 0 };
    ctx.markDirty(player);
    if (silent) return;
    ctx.log({
      kind: 'artifact',
      id: player.id,
      text: `${player.name} mở khóa pháp bảo ${cfg.list[player.artifact.index]}`,
      group: (n) => `${n} đạo hữu mở khóa pháp bảo bản mệnh`,
      merge: 'window',
    });
  }

  ctx.hooks.newPlayer.push((player) => {
    player.artifact = null;
  });
  ctx.on('join', (player) => unlock(player));
  // Người chơi cũ nhận pháp bảo khi bật module (lần tương tác đầu tiên sau đó).
  ctx.on('touch', (player) => unlock(player));

  const nameOf = (player) => cfg.list[player.artifact.index];
  const multOf = (player) => (player.artifact ? cfg.mults[player.artifact.grade] : 1);
  const needOf = (player) => (player.artifact.grade < maxGrade ? cfg.need[player.artifact.grade] : null);

  // Trả về số lượt đã dùng (lên tới Tiên khí thì không nhận thêm).
  function refine(player, count, source) {
    unlock(player);
    const art = player.artifact;
    let used = 0;
    for (let i = 0; i < count && art.grade < maxGrade; i++) {
      art.progress += 1;
      used += 1;
      if (art.progress < cfg.need[art.grade]) continue;
      art.progress = 0;
      art.grade += 1;
      const text = `${player.name} luyện ${nameOf(player)} lên ${cfg.grades[art.grade]}`;
      if (art.grade === maxGrade) ctx.notify('artifact', `✨ ${text}!`, { id: player.id });
      else ctx.log({ kind: 'artifact', id: player.id, text });
      ctx.emit({ kind: 'artifactGrade', id: player.id, grade: art.grade });
    }
    if (used > 0) {
      ctx.markDirty(player);
      ctx.emit({ kind: 'refine', id: player.id, count: used, source });
    }
    return used;
  }

  ctx.hooks.bossDamageMult.push(multOf);

  ctx.on('vaultItem', (player, tier, quantity) => {
    if (tier.id !== 'luyenKhiPhu' && tier.id !== 'hoPhap') return;
    const used = refine(player, quantity, 'gift');
    if (used > 0) ctx.log({ kind: 'artifact', id: player.id, text: `${player.name} dùng ${tier.name} · +${fmt(used)} lượt luyện ${nameOf(player)}` });
  });

  ctx.on('chestOpened', (player) => refine(player, cfg.chestRefines, 'chest'));

  ctx.hooks.view.push((player, view) => {
    if (player.artifact) view.artifact = { index: player.artifact.index, grade: player.artifact.grade };
  });

  ctx.hooks.card.push((player, card) => {
    if (!player.artifact) return;
    const need = needOf(player);
    card.artifact = {
      name: nameOf(player),
      grade: cfg.grades[player.artifact.grade],
      progress: player.artifact.progress,
      need,
      left: need === null ? 0 : need - player.artifact.progress,
    };
  });

  return { name: 'artifact', refine, multOf, unlock, nameOf };
}
