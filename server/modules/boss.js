// Boss: đếm ngược, trận đánh 3 giai đoạn (khiên 50%, cuồng nộ 20%), phong thưởng.
// Công thức sát thương = gốc × khắc chế × thưởng phe × thưởng cảnh giới × [hooks Phần 2] × khiên.

import { MIN, SEC, clamp, fmt } from '../util.js';

export function createBoss(ctx) {
  const { config } = ctx;
  const cfg = config.boss;
  const { keywords } = config;
  let enrage = cfg.enrage.start;
  let boss = null; // { phase: 'countdown' | 'fight' | 'award', ... }

  const counterMult = (player, element) => {
    const { main } = player.root;
    if (main === 'thien') return cfg.mults.heaven;
    const base = ctx.roots.baseOf(main);
    if (config.counters[base] === element) return cfg.mults.strong;
    if (config.counters[element] === base) return cfg.mults.weak;
    return cfg.mults.neutral;
  };

  // Hàm thuần, tách riêng để kiểm thử từng trường hợp khắc chế và khiên.
  function damageOf(player, base, element = boss.element, shielded = Boolean(boss?.shield)) {
    const counter = counterMult(player, element);
    const faction = ctx.factions.compatible(player, 'kiem') ? config.factions.kiem.bossDamageMult : 1;
    const realm = 1 + cfg.mults.realmStep * player.realmIndex;
    const extra = ctx.product(ctx.hooks.bossDamageMult, player);
    const shield = shielded ? cfg.mults.shield : 1;
    return { value: base * counter * faction * realm * extra * shield, counter: counter === cfg.mults.strong };
  }

  function participant(player) {
    let entry = boss.participants.get(player.id);
    if (!entry) {
      entry = {
        id: player.id,
        damage: 0,
        damageMilli: 0,
        damageSeq: 0,
        drained: 0,
        shares: 0,
        lastAttackAt: -Infinity,
        lastBreakAt: -Infinity,
        lastPillAt: -Infinity,
      };
      boss.participants.set(player.id, entry);
    }
    return entry;
  }

  const fighting = () => boss?.phase === 'fight';

  function flushDamage() {
    for (const [id, item] of boss.damageBuffer) {
      ctx.emit({ kind: 'damage', id, name: item.name, amount: item.amount, counter: item.counter });
    }
    boss.damageBuffer.clear();
    boss.lastFlushAt = ctx.now();
  }

  // Một đòn lớn không được nhảy qua mốc khiên/cuồng nộ.
  function hpFloor() {
    if (!cfg.damage.clampAtPhase) return 0;
    if (!boss.shieldTriggered) return boss.shieldAt;
    return boss.frenzyTriggered ? 0 : boss.frenzyAt;
  }

  function hit(player, base) {
    if (!fighting()) return;
    const entry = participant(player);
    const { value, counter } = damageOf(player, base);
    const milli = entry.damageMilli + Math.round(value * 1000);
    entry.damageMilli = milli % 1000;
    const damage = Math.floor(milli / 1000);
    if (damage <= 0) return;

    if (entry.damage === 0) ctx.fire('eventJoin', player, 'boss');
    entry.damage += damage;
    entry.damageSeq = ctx.nextSeq();
    boss.totalDamage += damage;
    const buffered = boss.damageBuffer.get(player.id) ?? { name: player.name, amount: 0, counter: false };
    buffered.amount += damage;
    buffered.counter ||= counter;
    boss.damageBuffer.set(player.id, buffered);

    boss.hp = Math.max(boss.hp - damage, hpFloor());
    if (boss.hp <= 0) {
      kill(player);
      return;
    }
    if (!boss.shieldTriggered && boss.hp <= boss.shieldAt) raiseShield();
    if (!boss.frenzyTriggered && boss.hp <= boss.frenzyAt) startFrenzy();
  }

  // ---------- Giai đoạn ----------

  function raiseShield() {
    boss.shieldTriggered = true;
    const members = ctx.factions.countPresent('tran');
    if (members === 0) {
      ctx.emit({ kind: 'shieldDown', reason: 'noTran' });
      return;
    }
    const { perPlayer, min, max, timeoutSec } = cfg.shield;
    boss.shield = { progress: 0, need: clamp(members * perPlayer, min, max), endsAt: ctx.now() + timeoutSec * SEC };
    ctx.emit({ kind: 'shieldUp', need: boss.shield.need, endsAt: boss.shield.endsAt });
  }

  function dropShield(reason) {
    boss.shield = null;
    ctx.emit({ kind: 'shieldDown', reason });
  }

  function startFrenzy() {
    boss.frenzyTriggered = true;
    boss.frenzy = true;
    boss.nextDrainAt = ctx.now() + cfg.frenzy.intervalSec * SEC;
    ctx.emit({ kind: 'frenzyStart' });
  }

  function pillNeed() {
    const { perPlayer, min, max } = cfg.pill;
    return clamp(ctx.factions.countPresent('dan') * perPlayer, min, max);
  }

  // Chỉ hút người đã tham gia trận này, đang có mặt nhưng im lặng quá idleSec.
  function drainIdle() {
    const t = ctx.now();
    const { idleSec, drainPct, drainMax } = cfg.frenzy;
    let count = 0;
    let total = 0;
    for (const entry of boss.participants.values()) {
      const player = ctx.players.get(entry.id);
      if (!player || !ctx.isPresent(player) || t - player.lastSeen <= idleSec * SEC) continue;
      const taken = ctx.drain(player, Math.min(Math.floor((player.total * drainPct) / 100), drainMax));
      if (taken <= 0) continue;
      entry.drained += taken;
      count += 1;
      total += taken;
    }
    if (count > 0) {
      ctx.emit({ kind: 'drain', count, total });
      ctx.log({ kind: 'boss', text: `Boss hút ${fmt(total)} tu vi của ${count} đạo hữu im lặng` });
    }
  }

  function refund(entries) {
    for (const entry of entries) {
      const player = ctx.players.get(entry.id);
      if (player && entry.drained > 0) ctx.gain(player, entry.drained, { source: 'refund', session: false, week: false });
    }
  }

  const ranked = (entries) =>
    entries.filter((e) => e.damage >= 1).sort((a, b) => b.damage - a.damage || a.damageSeq - b.damageSeq);

  // ---------- Kết thúc ----------

  function toAward(result, extra) {
    boss = { phase: 'award', result, element: boss.element, until: ctx.now() + cfg.rewards.awardSec * SEC, ...extra };
  }

  function kill(lastHitter) {
    flushDamage();
    const { rewards } = cfg;
    const entries = [...boss.participants.values()];
    const element = boss.element;
    enrage = cfg.enrage.start;
    // Trả lại tu vi bị hút trước khi phát thưởng.
    refund(entries);

    const order = ranked(entries);
    for (const entry of order) ctx.gain(ctx.players.get(entry.id), rewards.participation, { source: 'boss' });
    if (order.length > 0) {
      ctx.log({
        kind: 'boss',
        text: `${order.length} đạo hữu diệt boss · mỗi người +${fmt(rewards.participation)} tu vi`,
        amount: rewards.participation * order.length,
      });
    }

    const top = order.slice(0, rewards.top.length).map((entry, index) => {
      const player = ctx.players.get(entry.id);
      const reward = ctx.gain(player, rewards.top[index], { source: 'boss' });
      ctx.log({ kind: 'boss', id: player.id, amount: reward, text: `${player.name} hạng ${index + 1} sát thương · +${fmt(reward)} tu vi` });
      return { id: player.id, name: player.name, damage: entry.damage, reward };
    });
    if (top[0]) ctx.grantTitle(ctx.players.get(top[0].id), rewards.topTitle, { days: rewards.topTitleDays });
    ctx.grantTitle(lastHitter, rewards.lastHitTitle, { sessions: 1 });

    const lucky = ctx.shuffle(order).slice(0, rewards.luckyPills).map((entry) => {
      const player = ctx.players.get(entry.id);
      if (ctx.roots.canWash(player)) {
        ctx.roots.wash(player, 'pill');
        return { id: player.id, name: player.name, washed: true };
      }
      const amount = ctx.gain(player, rewards.pillFallback, { source: 'boss' });
      ctx.log({ kind: 'boss', id: player.id, amount, text: `${player.name} nhận Tẩy Tủy Đan · đổi thành +${fmt(amount)} tu vi` });
      return { id: player.id, name: player.name, washed: false };
    });

    ctx.fire('bossKilled', { lastHitter, order, top, element });
    ctx.emit({ kind: 'bossEnd', result: 'killed', element, lastHit: { id: lastHitter.id, name: lastHitter.name }, top, lucky });
    ctx.notify('bossDown', `⚔️ ${lastHitter.name} chém hạ boss · nhận danh hiệu ${rewards.lastHitTitle}!`, { id: lastHitter.id });
    toAward('killed', { top, lastHit: { id: lastHitter.id, name: lastHitter.name }, participants: order.length });
  }

  function flee() {
    flushDamage();
    const { step, max } = cfg.enrage;
    enrage = Math.min(Math.round((enrage + step) * 10) / 10, max);
    const text = 'Boss sẽ trở lại mạnh hơn!';
    ctx.emit({ kind: 'bossEnd', result: 'fled', element: boss.element, enrage, text });
    ctx.notify('bossDown', `Boss bỏ chạy · ${text}`);
    ctx.log({ kind: 'boss', text: `Boss bỏ chạy · cường hóa x${enrage.toFixed(1)}` });
    boss = null;
    ctx.schedule.finished('boss');
  }

  function appear() {
    const t = ctx.now();
    const present = ctx.presentPlayers().length;
    const maxHp = Math.floor((cfg.baseHp + cfg.hpPerPlayer * present) * enrage);
    boss = {
      phase: 'fight',
      element: boss.element,
      endsAt: t + cfg.durationMin * MIN,
      maxHp,
      hp: maxHp,
      totalDamage: 0,
      shieldAt: Math.floor((maxHp * cfg.shield.triggerPct) / 100),
      frenzyAt: Math.floor((maxHp * cfg.frenzy.triggerPct) / 100),
      shieldTriggered: false,
      frenzyTriggered: false,
      shield: null,
      frenzy: false,
      nextDrainAt: null,
      pillProgress: 0,
      protectedUntil: 0,
      participants: new Map(),
      damageBuffer: new Map(),
      lastFlushAt: t,
    };
    ctx.emit({ kind: 'bossStart', element: boss.element, maxHp, endsAt: boss.endsAt, enrage });
  }

  // Không có ai có mặt thì bỏ lượt boss theo lịch.
  function start({ manual }) {
    if (!manual && ctx.presentPlayers().length === 0) return false;
    const element = ctx.pick(ctx.roots.baseElements);
    boss = { phase: 'countdown', element, endsAt: ctx.now() + cfg.countdownSec * SEC };
    ctx.emit({ kind: 'bossCountdown', element, endsAt: boss.endsAt });
    return true;
  }

  function abort() {
    if (!boss) return;
    if (boss.phase === 'fight') refund([...boss.participants.values()]);
    ctx.emit({ kind: 'bossEnd', result: 'aborted', element: boss.element });
    boss = null;
  }

  ctx.schedule.register('boss', { label: 'Boss', start, abort });

  // ---------- Lệnh và tương tác ----------

  ctx.command(keywords.attack, (player) => {
    if (!fighting()) return;
    const entry = participant(player);
    const t = ctx.now();
    if (t - entry.lastAttackAt < cfg.damage.attackCooldownSec * SEC) return;
    entry.lastAttackAt = t;
    hit(player, cfg.damage.attack);
  });

  ctx.command(keywords.breakShield, (player) => {
    if (!fighting() || !boss.shield || player.faction !== 'tran') return;
    const entry = participant(player);
    const t = ctx.now();
    if (t - entry.lastBreakAt < cfg.shield.cooldownSec * SEC) return;
    entry.lastBreakAt = t;
    boss.shield.progress += 1;
    ctx.emit({ kind: 'shieldProgress', progress: boss.shield.progress, need: boss.shield.need });
    if (boss.shield.progress >= boss.shield.need) dropShield('broken');
  });

  ctx.command(keywords.brewPill, (player) => {
    if (!fighting() || !boss.frenzy || player.faction !== 'dan') return;
    const t = ctx.now();
    if (t < boss.protectedUntil) return;
    const entry = participant(player);
    if (t - entry.lastPillAt < cfg.pill.cooldownSec * SEC) return;
    entry.lastPillAt = t;
    boss.pillProgress += 1;
    const need = pillNeed();
    ctx.emit({ kind: 'pillProgress', progress: boss.pillProgress, need });
    if (boss.pillProgress >= need) {
      boss.pillProgress = 0;
      boss.protectedUntil = t + cfg.pill.protectSec * SEC;
      ctx.emit({ kind: 'pillActive', until: boss.protectedUntil });
    }
  });

  ctx.on('like', (player, count) => hit(player, count * cfg.damage.perLike));
  ctx.on('share', (player) => {
    if (!fighting()) return;
    const entry = participant(player);
    if (entry.shares >= cfg.damage.shareMaxPerFight) return;
    entry.shares += 1;
    hit(player, cfg.damage.share);
  });
  ctx.on('gift', (player, gift, quantity, value) => hit(player, value * cfg.damage.perDiamond));

  function tick() {
    if (!boss) return;
    const t = ctx.now();
    if (boss.phase === 'countdown') {
      if (t >= boss.endsAt) appear();
      return;
    }
    if (boss.phase === 'award') {
      if (t >= boss.until) {
        boss = null;
        ctx.schedule.finished('boss');
      }
      return;
    }
    if (t >= boss.endsAt) {
      flee();
      return;
    }
    if (t - boss.lastFlushAt >= config.display.damageMergeMs) flushDamage();
    if (boss.shield) {
      if (t >= boss.shield.endsAt) dropShield('timeout');
      else if (ctx.factions.countPresent('tran') === 0) dropShield('noTran');
    }
    if (boss.frenzy && t >= boss.nextDrainAt) {
      boss.nextDrainAt += cfg.frenzy.intervalSec * SEC;
      if (t >= boss.protectedUntil) drainIdle();
    }
  }

  function view() {
    if (!boss) return null;
    const base = { phase: boss.phase, element: boss.element, enrage };
    if (boss.phase === 'countdown') return { ...base, endsAt: boss.endsAt };
    if (boss.phase === 'award') {
      return { ...base, result: boss.result, until: boss.until, top: boss.top, lastHit: boss.lastHit, participants: boss.participants };
    }
    return {
      ...base,
      endsAt: boss.endsAt,
      hp: boss.hp,
      maxHp: boss.maxHp,
      totalDamage: boss.totalDamage,
      shield: boss.shield && { ...boss.shield },
      frenzy: boss.frenzy,
      protectedUntil: boss.protectedUntil,
      pill: boss.frenzy ? { progress: boss.pillProgress, need: pillNeed() } : null,
      participants: boss.participants.size,
      board: ranked([...boss.participants.values()])
        .slice(0, cfg.boardSize)
        .map((e) => ({ id: e.id, name: ctx.players.get(e.id)?.name, damage: e.damage })),
    };
  }

  return {
    name: 'boss',
    damageOf,
    // "Boss đang xuất hiện": tính cả lúc đếm ngược.
    active: () => boss?.phase === 'countdown' || boss?.phase === 'fight',
    fighting,
    enrage: () => enrage,
    participantIds: () => (fighting() ? [...boss.participants.keys()] : []),
    tick,
    snapshot(state) {
      state.boss = view();
      state.enrage = enrage;
    },
    load(data) {
      enrage = data.enrage ?? cfg.enrage.start;
    },
    save() {
      return { enrage };
    },
  };
}
