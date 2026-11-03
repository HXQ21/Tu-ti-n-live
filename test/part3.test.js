import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createGame } from '../server/game.js';

const base = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
const MIN = 60_000;
const SEC = 1000;
const START = Date.UTC(2026, 10, 2, 3, 0, 0);

function setup(modules = base.modules) {
  const config = { ...base, modules };
  const ctx = { t: START, rolls: [], events: [] };
  ctx.game = createGame({
    config,
    now: () => ctx.t,
    random: () => (ctx.rolls.length ? ctx.rolls.shift() : 0.5),
    emit: (event) => ctx.events.push(event),
    questions: [{ question: 'Q', options: ['a', 'b', 'c'], answer: 1 }],
  });
  ctx.game.load({ players: [], meta: {} });
  ctx.game.startSession('test');
  ctx.game.tick(); // Bỏ lượt boss phút 00 (chưa có ai).
  ctx.advance = (ms, step = SEC) => {
    for (let elapsed = 0; elapsed < ms; elapsed += step) {
      ctx.t += step;
      ctx.game.tick();
    }
  };
  ctx.of = (kind) => ctx.events.filter((e) => e.kind === kind);
  ctx.feed = () => ctx.of('feed').map((e) => e.entry);
  ctx.p = (id) => ctx.game.player(id);
  ctx.m = ctx.game.ctx;
  return ctx;
}

const user = (id) => ({ id, name: `Tên ${id}`, avatar: '' });
const chat = (ctx, id, text) => ctx.game.handleEvent({ type: 'chat', user: user(id), msgId: null, text });
const like = (ctx, id, count) => ctx.game.handleEvent({ type: 'like', user: user(id), msgId: null, count });
const gift = (ctx, id, diamonds, quantity = 1) =>
  ctx.game.handleEvent({
    type: 'gift', user: user(id), msgId: null, giftId: `g${diamonds}`, giftName: `Quà ${diamonds}`,
    diamonds, combo: false, repeatCount: quantity, repeatEnd: false, groupId: 'x',
  });

function add(ctx, id, { total = 0, realm = null } = {}) {
  chat(ctx, id, 'tu luyện');
  const player = ctx.p(id);
  player.root = { type: 'tam', main: 'kim', elements: ['kim', 'moc', 'thuy'] };
  Object.assign(player, { total: 0, frac: 0, sessionPts: 0, weekPts: 0, realmIndex: 0, tier: 0 });
  if (total > 0) ctx.m.gain(player, total, { source: 'test', session: false, week: false });
  if (realm !== null) {
    player.realmIndex = realm;
    player.total = Math.max(player.total, base.realms[realm].min);
  }
  return player;
}

// ---------- E. Dị thú ----------

test('E: nhập môn nhận 1 Phàm thú; con xuất chiến mặc định là con phẩm cao nhất', () => {
  const ctx = setup();
  const a = add(ctx, 'a');
  const starter = Object.keys(a.beasts);
  assert.equal(starter.length, 1);
  assert.equal(ctx.m.beast.byId.get(starter[0]).tier, 'pham');
  ctx.m.beast.grant(a, 'bang_ho');
  assert.equal(ctx.m.beast.activeId(a), 'bang_ho');
  a.beasts[starter[0]].level = 9;
  assert.equal(ctx.m.beast.activeId(a), 'bang_ho', 'phẩm cao hơn thắng cấp cao hơn');
  ctx.m.beast.grant(a, 'loi_ung');
  a.beasts.loi_ung.level = 3;
  assert.equal(ctx.m.beast.activeId(a), 'loi_ung', 'cùng phẩm thì cấp cao hơn');
});

test('E: nở trùng dị thú thì +50 kinh nghiệm, không tạo bản sao; kinh nghiệm cấp kế = 100 × cấp', () => {
  const ctx = setup();
  const a = add(ctx, 'a');
  ctx.m.beast.grant(a, 'hoa_lan');
  assert.ok(ctx.of('notification').some((e) => e.notification === 'beast' && /Thần thú Hỏa Lân/.test(e.text)));
  ctx.m.beast.grant(a, 'hoa_lan');
  assert.equal(Object.keys(a.beasts).filter((id) => id === 'hoa_lan').length, 1);
  assert.equal(a.beasts.hoa_lan.exp, 50);
  ctx.m.beast.addExpTo(a, 'hoa_lan', 50);
  assert.equal(a.beasts.hoa_lan.level, 2);
  ctx.m.beast.addExpTo(a, 'hoa_lan', 199);
  assert.equal(a.beasts.hoa_lan.level, 2);
  ctx.m.beast.addExpTo(a, 'hoa_lan', 1);
  assert.equal(a.beasts.hoa_lan.level, 3);
});

test('E: mỗi 200 tim +1 kinh nghiệm vào con xuất chiến; "xuất chiến [tên]" bị chặn khi boss, cách 60 giây', () => {
  const ctx = setup();
  const a = add(ctx, 'a');
  ctx.m.beast.grant(a, 'bang_ho');
  ctx.m.beast.grant(a, 'loi_ung');
  a.beasts.loi_ung.level = 2;
  like(ctx, 'a', 450);
  assert.equal(a.beasts.loi_ung.exp, 2);
  chat(ctx, 'a', 'xuất chiến băng hồ');
  assert.equal(ctx.m.beast.activeId(a), 'bang_ho');
  chat(ctx, 'a', 'xuat chien loi ung');
  assert.equal(ctx.m.beast.activeId(a), 'bang_ho', 'chưa đủ 60 giây');
  ctx.t += 61 * SEC;
  ctx.m.schedule.request('boss');
  chat(ctx, 'a', 'xuất chiến lôi ưng');
  assert.equal(ctx.m.beast.activeId(a), 'bang_ho', 'boss đang xuất hiện');
});

test('E: hệ số dị thú (1 + t × cấp) nhân vào sát thương boss', () => {
  const ctx = setup();
  const a = add(ctx, 'a');
  a.beasts = { cuu_vi_ho: { level: 5, exp: 0, at: 1 } };
  assert.ok(Math.abs(ctx.m.beast.multOf(a) - 1.2) < 1e-9);
});

// ---------- F. Thiên dực ----------

test('F: quà từ 1.000 xu +1 cấp, tối đa 5; +5% tu vi chat/tim mỗi cấp', () => {
  const ctx = setup();
  const a = add(ctx, 'a');
  gift(ctx, 'a', 1000, 3);
  assert.equal(a.wings, 3);
  gift(ctx, 'a', 29999, 4);
  assert.equal(a.wings, 5);
  assert.ok(Math.abs(ctx.m.wings.multOf(a) - 1.25) < 1e-9);
});

// ---------- L. Rơi đồ ----------

test('L: trứng thường tối đa 3 mỗi người mỗi ngày, vượt thì đổi thành kinh nghiệm; trứng hiếm không tính', () => {
  const ctx = setup();
  const a = add(ctx, 'a');
  const { giveEgg } = ctx.m.drops;
  for (let i = 0; i < 3; i++) assert.equal(giveEgg(a, { source: 'test' }), true);
  const active = ctx.m.beast.activeId(a);
  const exp = a.beasts[active].exp;
  assert.equal(giveEgg(a, { source: 'test' }), false);
  assert.equal(a.beasts[active].exp, exp + 30);
  assert.equal(giveEgg(a, { rare: true, capped: false, source: 'Rương Vàng' }), true);
  ctx.game.command('newDay');
  assert.equal(giveEgg(a, { source: 'test' }), true, 'ngày mới tính lại');
});

test('L: trứng tự nở sau 3 giây; trứng hiếm nở Linh hoặc Thần thú', () => {
  const ctx = setup();
  const a = add(ctx, 'a');
  ctx.m.drops.giveEgg(a, { rare: true, capped: false, source: 'test' });
  const before = Object.keys(a.beasts).length;
  ctx.advance(2 * SEC);
  assert.equal(Object.keys(a.beasts).length, before);
  ctx.rolls = [0.1, 0];
  ctx.advance(2 * SEC);
  const hatched = ctx.of('hatch')[0];
  assert.equal(hatched.tier, 'than');
  assert.ok(a.beasts[hatched.beast]);
});

test('L: Rương Vàng/Bạc/Đồng chỉ trao đúng cho hạng 1/2/3 sát thương', () => {
  const ctx = setup();
  for (const id of ['a', 'b', 'c', 'd']) add(ctx, id);
  ctx.m.schedule.request('boss');
  ctx.advance(61 * SEC);
  gift(ctx, 'a', 29999);
  gift(ctx, 'b', 9999);
  gift(ctx, 'c', 5000);
  gift(ctx, 'd', 100);
  gift(ctx, 'a', 29999);
  gift(ctx, 'a', 29999);
  assert.equal(ctx.game.snapshot().boss.phase, 'award');
  const chests = ctx.of('drop').filter((e) => e.chest);
  assert.deepEqual(chests.map((e) => [e.id, e.chest]), [['a', 'gold'], ['b', 'silver'], ['c', 'bronze']]);
});

// ---------- G. Khiêu chiến ----------

test('G: không ghép người chênh quá 1 cảnh giới; dưới Kim Đan không được khiêu chiến', () => {
  const ctx = setup();
  add(ctx, 'low', { realm: 2 });
  add(ctx, 'kd', { realm: 3 });
  add(ctx, 'ht', { realm: 5 });
  chat(ctx, 'low', 'khiêu chiến');
  assert.deepEqual(ctx.m.duel.queue(), []);
  chat(ctx, 'kd', 'khiêu chiến');
  chat(ctx, 'ht', 'khiêu chiến');
  ctx.game.tick();
  assert.equal(ctx.game.snapshot().duel, null);
  ctx.advance(61 * SEC);
  assert.deepEqual(ctx.m.duel.queue(), [], 'chờ quá 60 giây thì hủy');
});

test('G: trận 30 giây; người thắng +100 + 1% tu vi phiên đối thủ; người thua +20, không bị trừ', () => {
  const ctx = setup();
  const a = add(ctx, 'a', { realm: 3 });
  const b = add(ctx, 'b', { realm: 4 });
  b.sessionPts = 20_000;
  chat(ctx, 'a', 'khiêu chiến');
  chat(ctx, 'b', 'khiêu chiến');
  ctx.game.tick();
  assert.ok(ctx.game.snapshot().duel);
  for (let i = 0; i < 10; i++) {
    chat(ctx, 'a', 'đánh');
    ctx.t += 2 * SEC;
  }
  for (let i = 0; i < 5; i++) chat(ctx, `fan${i}`, 'tu luyện');
  for (let i = 0; i < 5; i++) chat(ctx, `fan${i}`, 'ủng hộ tên a');
  gift(ctx, 'a', 50);
  const before = { a: a.total, b: b.total };
  ctx.advance(12 * SEC);
  assert.equal(ctx.game.snapshot().duel, null);
  const win = ctx.of('duelEnd')[0];
  assert.equal(win.winner, 'a');
  assert.equal(a.total - before.a, 100 + 200);
  assert.equal(b.total - before.b, 20);
});

test('G: khiêu chiến không chạy khi boss đang diễn ra', () => {
  const ctx = setup();
  add(ctx, 'a', { realm: 3 });
  add(ctx, 'b', { realm: 3 });
  ctx.m.schedule.request('boss');
  chat(ctx, 'a', 'khiêu chiến');
  chat(ctx, 'b', 'khiêu chiến');
  ctx.game.tick();
  assert.equal(ctx.game.snapshot().duel, null);
});

// ---------- H. Luyện Đan ----------

test('H: nổ lò đúng sau 3 giây liên tục trên 85', () => {
  const ctx = setup();
  add(ctx, 'a');
  assert.ok(ctx.m.events.request('alchemy'));
  ctx.game.tick();
  assert.ok(ctx.game.snapshot().alchemy);
  gift(ctx, 'a', 80);
  ctx.advance(2 * SEC, 500);
  assert.ok(ctx.game.snapshot().alchemy, 'mới 2 giây');
  ctx.advance(1500, 500);
  assert.equal(ctx.game.snapshot().alchemy, null);
  assert.equal(ctx.of('alchemyEnd')[0].result, 'explode');
});

test('H: giữ vùng an toàn đủ 35 giây thì thành đan, +60 (phe đan tương hợp x1.5)', () => {
  const ctx = setup();
  const a = add(ctx, 'a');
  const d = add(ctx, 'd');
  d.root = { type: 'don', main: 'moc', elements: ['moc'] };
  d.faction = 'dan';
  ctx.m.events.request('alchemy');
  ctx.game.tick();
  gift(ctx, 'd', 25);
  for (let s = 0; s < 60; s++) {
    if (ctx.m.alchemy.heat() < 50) chat(ctx, s % 2 ? 'a' : 'd', 'thêm lửa');
    ctx.advance(SEC);
  }
  assert.equal(ctx.of('alchemyEnd')[0].result, 'success');
  assert.ok(ctx.feed().some((e) => /Luyện Đan thành công/.test(e.text)));
  assert.ok(a.quests.progress.event === 1);
});

// ---------- I. Đăng Thiên Thê ----------

test('I: top 3 +300/+200/+100, mọi người +20, hạng 1 nhận trứng không tính giới hạn', () => {
  const ctx = setup();
  for (const id of ['a', 'b', 'c', 'd']) add(ctx, id);
  ctx.m.events.request('ladder');
  ctx.game.tick();
  gift(ctx, 'a', 30);
  gift(ctx, 'b', 20);
  like(ctx, 'c', 100);
  chat(ctx, 'd', 'leo');
  ctx.p('a').eggCount = 3;
  ctx.p('a').eggDay = ctx.m.today();
  const before = Object.fromEntries(['a', 'b', 'c', 'd'].map((id) => [id, ctx.p(id).total]));
  ctx.advance(91 * SEC);
  const end = ctx.of('ladderEnd')[0];
  assert.deepEqual(end.top.map((t) => t.id), ['a', 'b', 'c']);
  assert.equal(ctx.p('d').total - before.d, 20);
  assert.ok(ctx.of('drop').some((e) => e.id === 'a' && e.item === 'egg_common'));
});

// ---------- J. Bí Cảnh ----------

test('J: chỉ từ Trúc Cơ được vào; cổng đóng mỗi người nhận đúng 1 phần thưởng', () => {
  const ctx = setup();
  add(ctx, 'low');
  add(ctx, 'tc', { realm: 2 });
  add(ctx, 'kd', { realm: 3 });
  ctx.m.events.request('secret');
  ctx.game.tick();
  for (const id of ['low', 'tc', 'kd']) chat(ctx, id, 'bí cảnh');
  assert.equal(ctx.game.snapshot().secret.inside, 2);
  ctx.advance(61 * SEC);
  const results = ctx.of('secretClose')[0].results;
  assert.deepEqual(results.map((r) => r.id).sort(), ['kd', 'tc']);
});

test('J: tỉ lệ phần thưởng theo trọng số 60/20/10/7/3', () => {
  const ctx = setup();
  const pick = (r) => {
    ctx.rolls = [r];
    return ctx.m.secret.roll().id;
  };
  assert.equal(pick(0.59), 'cultivation');
  assert.equal(pick(0.61), 'beastExp');
  assert.equal(pick(0.85), 'refine');
  assert.equal(pick(0.95), 'egg');
  assert.equal(pick(0.98), 'wash');
});

// ---------- Lịch cho sự kiện mới ----------

test('Khe phút 12 luân phiên Luận Đạo → Luyện Đan → Đăng Thiên Thê → Bí Cảnh, không chồng sự kiện', () => {
  const ctx = setup();
  add(ctx, 'a');
  const order = [];
  let overlap = false;
  for (let s = 0; s < 4 * 20 * 60; s += 5) {
    ctx.advance(5 * SEC, 5 * SEC);
    if (s % 300 === 0) chat(ctx, 'a', 'đánh');
    const st = ctx.game.snapshot();
    const live = [st.boss, st.rain.active, st.debate, st.alchemy, st.ladder, st.secret].filter(Boolean).length;
    if (live > 1) overlap = true;
  }
  for (const e of ctx.events) {
    if (['debateStart', 'alchemyStart', 'ladderStart', 'secretOpen'].includes(e.kind)) order.push(e.kind);
  }
  assert.equal(overlap, false);
  assert.deepEqual(order, ['debateStart', 'alchemyStart', 'ladderStart', 'secretOpen']);
});

// ---------- K. Chính Đạo – Ma Đạo ----------

test('K: mặc định Chính Đạo, đổi cách 30 phút; bên kiếm nhiều tu vi phiên hơn thống trị x1.1', () => {
  const ctx = setup();
  const a = add(ctx, 'a');
  const b = add(ctx, 'b');
  assert.equal(ctx.m.dao.sideOf(a), 'chinh');
  chat(ctx, 'b', 'ma đạo');
  assert.equal(ctx.m.dao.sideOf(b), 'ma');
  chat(ctx, 'b', 'chính đạo');
  assert.equal(ctx.m.dao.sideOf(b), 'ma', 'chưa đủ 30 phút');
  gift(ctx, 'b', 100);
  ctx.m.dao.judge();
  assert.equal(ctx.m.dao.ruling(), 'ma');
  const mb = ctx.m.cultivation.chatLikeMult(b);
  const ma = ctx.m.cultivation.chatLikeMult(a);
  assert.ok(Math.abs(mb / ma - 1.1) < 1e-9);
});

// ---------- Rương nhiệm vụ (cập nhật) ----------

test('Rương nhiệm vụ: +100 tu vi, +16 kinh nghiệm dị thú, +1 lượt luyện', () => {
  const ctx = setup();
  const a = add(ctx, 'a');
  const active = ctx.m.beast.activeId(a);
  ctx.rolls = Array(5).fill(0.99);
  ctx.t += 10 * SEC;
  like(ctx, 'a', 100);
  for (let i = 0; i < 5; i++) {
    chat(ctx, 'a', 'x');
    ctx.t += 10 * SEC;
  }
  const exp = a.beasts[active].exp;
  ctx.m.quests.advance(a, 'event');
  assert.equal(ctx.of('chest')[0].amount, 100);
  assert.equal(a.beasts[active].exp, exp + 16);
  assert.equal(a.artifact.progress, 1);
});

test('Thẻ check có pháp bảo, dị thú, thiên dực, đạo tâm, chiến lực', () => {
  const ctx = setup();
  const a = add(ctx, 'a');
  const card = ctx.m.lookup.cardOf(a);
  assert.ok(card.artifact && card.beast && card.wings === 0 && card.dao === 'Chính Đạo' && card.power > 0);
});
