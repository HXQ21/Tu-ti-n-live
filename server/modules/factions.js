// Phe Kiếm / Đan / Trận và độ tương hợp theo hệ chủ.

export const FACTIONS = ['kiem', 'dan', 'tran'];

export function createFactions(ctx) {
  const { config } = ctx;

  // Thiên linh căn tự động tương hợp với phe đã chọn.
  function compatible(player, faction) {
    if (player.faction !== faction) return false;
    return player.root.main === 'thien' || config.factions[faction].elements.includes(player.root.main);
  }

  function choose(player, faction) {
    if (player.faction === faction) return;
    const t = ctx.now();
    if (player.faction) {
      if (ctx.boss?.active()) {
        ctx.emit({ kind: 'factionDenied', id: player.id, name: player.name, reason: 'boss' });
        return;
      }
      if (t - player.factionChangedAt < config.factions.changeCooldownMin * 60_000) {
        ctx.emit({ kind: 'factionDenied', id: player.id, name: player.name, reason: 'cooldown' });
        return;
      }
    }
    player.faction = faction;
    player.factionChangedAt = t;
    ctx.markDirty(player);
    const match = compatible(player, faction);
    ctx.emit({ kind: 'faction', id: player.id, name: player.name, faction, compatible: match, text: match ? 'Thiên phú tương hợp!' : null });
    ctx.log({
      kind: 'faction',
      id: player.id,
      text: `${player.name} chọn phe ${config.factions[faction].name}${match ? ' · Thiên phú tương hợp!' : ''}`,
    });
  }

  for (const faction of FACTIONS) {
    ctx.command(config.keywords.factions[faction], (player) => choose(player, faction));
  }

  // Phe Trận tương hợp: +20% tu vi chat và tim.
  ctx.hooks.chatLikeMult.push((player) => (compatible(player, 'tran') ? config.factions.tran.chatLikeMult : 1));

  ctx.hooks.view.push((player, view) => {
    view.compatible = player.faction ? compatible(player, player.faction) : false;
  });

  const countPresent = (faction) => ctx.presentPlayers().filter((p) => p.faction === faction).length;

  return { name: 'factions', compatible, countPresent };
}
