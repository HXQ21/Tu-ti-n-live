// Phần 2 mục L: Rơi đồ & Linh Thú Đản.
// Mọi vật phẩm rơi ra tự dùng ngay: lượt luyện vào pháp bảo, kinh nghiệm vào dị thú xuất chiến, trứng tự nở sau 3 giây.
// Mỗi người tối đa 3 trứng thường mỗi ngày từ nguồn ngẫu nhiên; vượt thì đổi thành kinh nghiệm dị thú.
// Trứng hiếm (Rương Vàng) và trứng hạng 1 Đăng Thiên Thê không tính vào giới hạn.

import { SEC, fmt } from '../util.js';

export function createDrops(ctx) {
  const { config } = ctx;
  const cfg = config.drops;
  let hatching = []; // { playerId, rare, at }

  function dailyEggs(player) {
    const day = ctx.today();
    if (player.eggDay !== day) {
      player.eggDay = day;
      player.eggCount = 0;
    }
    return player.eggCount;
  }

  function show(player, item, source, chest = null) {
    ctx.emit({ kind: 'drop', id: player.id, item, source, chest });
  }

  // Trả về true nếu nhận được trứng (false: đã đủ 3 trứng thường hôm nay, đổi thành kinh nghiệm).
  function giveEgg(player, { rare = false, capped = !rare, source = '' } = {}) {
    if (!ctx.beast) return false;
    if (capped) {
      if (dailyEggs(player) >= cfg.commonEggDailyMax) {
        ctx.beast.addExp(player, cfg.overflowExp, 'egg');
        ctx.log({ kind: 'beast', id: player.id, text: `${player.name} nhận trứng từ ${source} · đủ ${cfg.commonEggDailyMax} trứng hôm nay, đổi thành +${fmt(cfg.overflowExp)} kinh nghiệm dị thú` });
        return false;
      }
      player.eggCount += 1;
    }
    ctx.markDirty(player);
    hatching.push({ playerId: player.id, rare, at: ctx.now() + cfg.hatchSec * SEC, source });
    ctx.log({ kind: 'beast', id: player.id, text: `${player.name} nhận Linh Thú Đản${rare ? ' hiếm' : ''} từ ${source}` });
    show(player, rare ? 'egg_rare' : 'egg_common', source);
    return true;
  }

  function hatch(item) {
    const player = ctx.players.get(item.playerId);
    if (!player) return;
    const odds = item.rare ? cfg.rareEgg.than : cfg.commonEgg.linh;
    const tier = item.rare ? (ctx.random() < odds ? 'than' : 'linh') : ctx.random() < odds ? 'linh' : 'pham';
    const id = ctx.beast.randomOfTier(tier);
    ctx.emit({ kind: 'hatch', id: player.id, beast: id, image: ctx.beast.byId.get(id).image, tier });
    ctx.beast.grant(player, id, `trứng nở`);
  }

  function refines(player, count, source) {
    if (!ctx.artifact || count <= 0) return 0;
    const used = ctx.artifact.refine(player, count, source);
    if (used > 0) ctx.log({ kind: 'artifact', id: player.id, text: `${player.name} nhận +${fmt(used)} lượt luyện từ ${source}` });
    return used;
  }

  function beastExp(player, amount, source) {
    if (!ctx.beast || amount <= 0) return 0;
    const got = ctx.beast.addExp(player, amount, source);
    if (got > 0) ctx.log({ kind: 'beast', id: player.id, text: `${player.name} nhận +${fmt(got)} kinh nghiệm dị thú từ ${source}` });
    return got;
  }

  // Boss: Rương Vàng/Bạc/Đồng cho đúng hạng 1/2/3 sát thương; mọi người đã gây sát thương 5% trứng thường.
  ctx.on('bossKilled', ({ order }) => {
    const players = order.map((entry) => ctx.players.get(entry.id)).filter(Boolean);
    const [gold, silver, bronze] = players;
    const b = cfg.boss;
    if (gold) {
      show(gold, 'chest_gold', 'boss', 'gold');
      for (let i = 0; i < b.gold.rareEggs; i++) giveEgg(gold, { rare: true, capped: false, source: 'Rương Vàng' });
      refines(gold, b.gold.refines, 'Rương Vàng');
    }
    if (silver) {
      show(silver, 'chest_silver', 'boss', 'silver');
      if (ctx.random() < b.silver.eggChance) giveEgg(silver, { source: 'Rương Bạc' });
      refines(silver, b.silver.refines, 'Rương Bạc');
    }
    if (bronze) {
      show(bronze, 'chest_bronze', 'boss', 'bronze');
      refines(bronze, b.bronze.refines, 'Rương Đồng');
      beastExp(bronze, b.bronze.beastExp, 'Rương Đồng');
    }
    for (const player of players) {
      if (ctx.random() < b.participantEggChance) giveEgg(player, { source: 'boss' });
    }
  });

  ctx.on('rainPick', (player, { fast }) => {
    if (fast && ctx.random() < cfg.rainFastEggChance) giveEgg(player, { source: 'Mưa Linh Thạch' });
  });

  // Rương nhiệm vụ: +100 tu vi (nhiệm vụ), +16 kinh nghiệm (dị thú), +1 lượt luyện (pháp bảo), 10% trứng thường.
  ctx.on('chestOpened', (player) => {
    if (ctx.random() < cfg.chestEggChance) giveEgg(player, { source: 'Rương Nhiệm Vụ' });
  });

  ctx.on('debateFastest', (player) => refines(player, cfg.debateFastestRefines, 'Luận Đạo'));

  ctx.on('sessionEnding', () => {
    for (const item of hatching) hatch(item);
    hatching = [];
  });

  return {
    name: 'drops',
    giveEgg,
    refines,
    beastExp,
    dailyEggs,
    tick() {
      if (hatching.length === 0) return;
      const t = ctx.now();
      const ready = hatching.filter((item) => t >= item.at);
      if (ready.length === 0) return;
      hatching = hatching.filter((item) => t < item.at);
      for (const item of ready) hatch(item);
    },
  };
}
