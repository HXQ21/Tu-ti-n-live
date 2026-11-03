import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createGame, normalizeText } from '../server/game.js';

// Bài test Phần 1 chạy trên lõi game, tắt mọi module Phần 2.
const config = { ...JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8')), modules: {} };
const MIN = 60_000;
const SEC = 1000;
// 10:00 thứ Hai 02/11/2026 giờ Việt Nam.
const START = Date.UTC(2026, 10, 2, 3, 0, 0);

// ---------- Công cụ ----------

function setup({ session = true } = {}) {
  const ctx = { t: START, rolls: [], events: [] };
  ctx.game = createGame({
    config,
    now: () => ctx.t,
    random: () => (ctx.rolls.length ? ctx.rolls.shift() : 0.5),
    emit: (event) => ctx.events.push(event),
  });
  ctx.game.load({ players: [], meta: {} });
  if (session) ctx.game.startSession('test');
  ctx.advance = (ms, step = SEC) => {
    for (let elapsed = 0; elapsed < ms; elapsed += step) {
      ctx.t += step;
      ctx.game.tick();
    }
  };
  ctx.of = (kind) => ctx.events.filter((e) => e.kind === kind);
  ctx.feed = () => ctx.of('feed').map((e) => e.entry);
  ctx.p = (id) => ctx.game.player(id);
  return ctx;
}

const user = (id) => ({ id, name: `Tên ${id}`, avatar: '' });
const chat = (ctx, id, text) => ctx.game.handleEvent({ type: 'chat', user: user(id), msgId: null, text });
const like = (ctx, id, count) => ctx.game.handleEvent({ type: 'like', user: user(id), msgId: null, count });
const share = (ctx, id) => ctx.game.handleEvent({ type: 'share', user: user(id), msgId: null });
const follow = (ctx, id) => ctx.game.handleEvent({ type: 'follow', user: user(id), msgId: null });
const gift = (ctx, id, diamonds, extra = {}) =>
  ctx.game.handleEvent({
    type: 'gift', user: user(id), msgId: null, giftId: `g${diamonds}`, giftName: `Quà ${diamonds}`,
    diamonds, combo: false, repeatCount: 1, repeatEnd: false, groupId: 'x', ...extra,
  });

const ROOTS = {
  tap: { type: 'tap', main: 'kim', elements: ['kim', 'moc', 'thuy', 'hoa', 'tho'] },
  tam: { type: 'tam', main: 'kim', elements: ['kim', 'moc', 'thuy'] },
  song: { type: 'song', main: 'kim', elements: ['kim', 'moc'] },
  don: { type: 'don', main: 'kim', elements: ['kim'] },
  loi: { type: 'biendi', main: 'loi', elements: ['loi'] },
  thien: { type: 'thien', main: 'thien', elements: [] },
};

// Tạo người chơi có sẵn linh căn, tu vi, phe mà không qua ngẫu nhiên.
function add(ctx, id, { root = ROOTS.tam, main, total = 0, faction = null } = {}) {
  chat(ctx, id, 'tu luyện');
  const player = ctx.p(id);
  player.root = structuredClone(root);
  if (main) player.root = { type: 'don', main, elements: [main] };
  Object.assign(player, { total: 0, frac: 0, sessionPts: 0, weekPts: 0, realmIndex: 0, tier: 0, faction });
  if (total > 0) ctx.game.ctx.gain(player, total, { source: 'test', session: false, week: false });
  return player;
}

// Gọi boss và chờ hết đếm ngược; giữ những người trong ids có mặt.
function startFight(ctx, ids = []) {
  assert.ok(ctx.game.ctx.schedule.request('boss'));
  ctx.advance(config.boss.countdownSec * SEC);
  for (const id of ids) follow(ctx, id);
  ctx.game.tick();
  const boss = ctx.game.snapshot().boss;
  assert.equal(boss.phase, 'fight');
  return boss;
}

// ---------- Từ khóa, nhập môn ----------

test('từ khóa: không phân biệt hoa thường, bỏ khoảng trắng thừa, chấp nhận không dấu', () => {
  assert.equal(normalizeText('  Tu   LUYỆN '), 'tu luyen');
  assert.equal(normalizeText('Đánh'), 'danh');
  const ctx = setup();
  chat(ctx, 'a', 'TU LUYEN');
  assert.ok(ctx.p('a'));
  chat(ctx, 'b', '  nhat ');
  assert.ok(ctx.p('b'), 'lệnh game tự nhập môn');
});

test('nhập môn: chat thường không nhập môn; quà, tim, chia sẻ thì có; theo dõi thì không', () => {
  const ctx = setup();
  chat(ctx, 'a', 'xin chào');
  follow(ctx, 'b');
  assert.equal(ctx.p('a'), undefined);
  assert.equal(ctx.p('b'), undefined);
  like(ctx, 'c', 1);
  share(ctx, 'd');
  gift(ctx, 'e', 1);
  assert.ok(ctx.p('c') && ctx.p('d') && ctx.p('e'));
  const joins = ctx.feed().filter((e) => e.kind === 'join');
  assert.match(joins[0].text, /nhập môn · .+ linh căn · hệ /);
});

test('người cũ quay lại phiên mới: giữ dữ liệu, Truyền Tin "trở về tông môn", không thức tỉnh lại', () => {
  const ctx = setup();
  add(ctx, 'a', { total: 500 });
  const root = structuredClone(ctx.p('a').root);
  ctx.game.endSession();
  ctx.advance(20 * MIN, MIN);
  ctx.game.startSession('s2');
  chat(ctx, 'a', 'chào');
  assert.deepEqual(ctx.p('a').root, root);
  assert.ok(ctx.p('a').total >= 500);
  assert.ok(ctx.feed().some((e) => /trở về tông môn · Luyện Khí tầng/.test(e.text)));
});

test('Thiên linh căn có thông báo lớn', () => {
  const ctx = setup();
  ctx.rolls = [0.999];
  chat(ctx, 'a', 'tu luyện');
  assert.equal(ctx.p('a').root.type, 'thien');
  assert.match(ctx.of('notification')[0].text, /Thiên Linh Căn/);
});

// ---------- Tu vi ----------

test('chat +1 mỗi 10 giây, phần lẻ cộng dồn: Tạp linh căn 5 lần được 4', () => {
  const ctx = setup();
  const a = add(ctx, 'a', { root: ROOTS.tap });
  ctx.t += 10 * SEC;
  const before = a.total;
  for (let i = 0; i < 5; i++) {
    chat(ctx, 'a', 'hello');
    chat(ctx, 'a', 'spam');
    ctx.t += 10 * SEC;
  }
  assert.equal(a.total - before, 4);
});

test('tim: mỗi 100 tim +10 × hệ số, dư giữ lại; dòng mốc cá nhân khớp số cộng', () => {
  const ctx = setup();
  const a = add(ctx, 'a', { root: ROOTS.song });
  const before = a.total;
  like(ctx, 'a', 60);
  like(ctx, 'a', 60);
  assert.equal(a.likeRemainder, 20);
  assert.equal(a.total - before, 13);
  const line = ctx.feed().find((e) => e.kind === 'likes');
  assert.equal(line.amount, 13);
  assert.match(line.text, /đủ 100 tim · \+13 tu vi/);
});

test('chia sẻ: +40 × hệ số, tối đa 5 lần tính điểm mỗi phiên', () => {
  const ctx = setup();
  const a = add(ctx, 'a');
  const before = a.total;
  for (let i = 0; i < 7; i++) share(ctx, 'a');
  assert.equal(a.total - before, 200);
});

test('quà: tu vi = xu × 10, không nhân hệ số; dòng Truyền Tin riêng', () => {
  const ctx = setup();
  const a = add(ctx, 'a', { root: ROOTS.thien });
  const before = a.total;
  gift(ctx, 'a', 299);
  assert.equal(a.total - before, 2990);
  assert.ok(ctx.feed().some((e) => e.kind === 'gift' && e.amount === 2990 && /\+2\.990 tu vi/.test(e.text)));
});

test('quà combo chỉ cộng một lần khi kết thúc, đúng số lượng cuối', () => {
  const ctx = setup();
  const a = add(ctx, 'a');
  const before = a.total;
  for (let i = 1; i <= 4; i++) gift(ctx, 'a', 1, { combo: true, repeatCount: i, groupId: 'g' });
  assert.equal(a.total, before);
  gift(ctx, 'a', 1, { combo: true, repeatCount: 9, repeatEnd: true, groupId: 'g' });
  assert.equal(a.total - before, 90);
  ctx.advance(40 * SEC);
  assert.equal(a.total - before, 90);
});

test('combo mất tín hiệu kết thúc: tự cộng sau 30 giây, sự kiện đến muộn chỉ cộng phần còn lại', () => {
  const ctx = setup();
  const a = add(ctx, 'a');
  const before = a.total;
  gift(ctx, 'a', 1, { combo: true, repeatCount: 5, groupId: 'g' });
  ctx.advance(31 * SEC);
  assert.equal(a.total - before, 50);
  gift(ctx, 'a', 1, { combo: true, repeatCount: 7, repeatEnd: true, groupId: 'g' });
  assert.equal(a.total - before, 70);
});

test('mỗi lần cộng vào đủ 3 bộ đếm; kết thúc phiên reset tu vi phiên, giữ tổng và tuần; sang tuần reset tuần', () => {
  const ctx = setup();
  const a = add(ctx, 'a');
  gift(ctx, 'a', 10);
  const view = ctx.game.view('a');
  assert.equal(view.total, a.total);
  assert.equal(view.session, a.total);
  assert.equal(view.week, a.total);

  const summary = ctx.game.endSession();
  const reward = summary.top[0].reward;
  assert.equal(ctx.game.view('a').week, view.week + reward);
  ctx.game.startSession('s2');
  assert.equal(ctx.game.view('a').session, 0, 'thưởng cuối phiên không tính vào phiên mới');
  assert.equal(ctx.game.view('a').total, view.total + reward);

  ctx.game.command('newWeek');
  assert.equal(ctx.game.view('a').week, 0);
  assert.equal(ctx.game.view('a').total, view.total + reward);
});

test('điểm danh: +10, mỗi ngày liên tiếp +2, tối đa 30; bỏ một ngày thì chuỗi tính lại', () => {
  const ctx = setup();
  const amounts = [];
  chat(ctx, 'a', 'tu luyện');
  for (let day = 0; day < 13; day++) {
    if (day > 0) {
      ctx.game.command('newDay');
      chat(ctx, 'a', 'tu luyện');
    }
    amounts.push(ctx.feed().filter((e) => e.kind === 'checkin').at(-1).amount);
  }
  assert.deepEqual(amounts.slice(0, 4), [10, 12, 14, 16]);
  assert.equal(amounts[10], 30);
  assert.equal(amounts[12], 30);
  ctx.game.command('newDay');
  ctx.game.command('newDay');
  chat(ctx, 'a', 'tu luyện');
  assert.equal(ctx.feed().filter((e) => e.kind === 'checkin').at(-1).amount, 10);
});

test('Linh Khí Triều: mốc 1.000 tim x2 trong 45 giây, gia hạn tối đa 3 phút, không nhân chồng', () => {
  const ctx = setup();
  const a = add(ctx, 'a');
  like(ctx, 'z', 1000);
  let tide = ctx.game.snapshot().tide;
  assert.equal(tide.until - ctx.t, 45 * SEC);
  for (let i = 0; i < 6; i++) like(ctx, 'z', 1000);
  tide = ctx.game.snapshot().tide;
  assert.equal(tide.until - ctx.t, 180 * SEC);
  assert.equal(ctx.of('notification').filter((e) => e.notification === 'tide').length, 1);

  ctx.t += 10 * SEC;
  const before = a.total;
  chat(ctx, 'a', 'x');
  chat(ctx, 'a', 'x');
  ctx.t += 10 * SEC;
  chat(ctx, 'a', 'x');
  assert.equal(a.total - before, 4, 'x2, không phải x4');
  ctx.advance(181 * SEC, 10 * SEC);
  assert.equal(ctx.game.snapshot().tide.active, false);
});

// ---------- Cảnh giới, tầng ----------

test('tầng và cảnh giới đúng tại các ngưỡng', () => {
  const ctx = setup();
  const a = add(ctx, 'a');
  const at = (total) => {
    a.total = total - 1;
    ctx.game.ctx.gain(a, 1);
    return ctx.game.view('a').realm;
  };
  assert.equal(at(99), 'Phàm Nhân');
  assert.equal(at(100), 'Luyện Khí tầng 1');
  assert.equal(at(199), 'Luyện Khí tầng 1');
  assert.equal(at(200), 'Luyện Khí tầng 2');
  assert.equal(at(999), 'Luyện Khí tầng 9');
  assert.equal(at(1000), 'Trúc Cơ tầng 1');
  assert.equal(at(30_000_000), 'Chân Tiên · Viên Mãn');
});

test('đột phá: nhảy nhiều cấp chỉ thông báo cấp cuối; dưới Kim Đan chỉ ghi Truyền Tin; không bao giờ tụt', () => {
  const ctx = setup();
  const a = add(ctx, 'a', { total: 50 });
  gift(ctx, 'a', 100);
  assert.equal(ctx.of('notification').filter((e) => e.notification === 'breakthrough').length, 0);
  assert.ok(ctx.feed().some((e) => e.kind === 'breakthrough' && /Trúc Cơ/.test(e.text)));
  gift(ctx, 'a', 29999);
  const big = ctx.of('notification').filter((e) => e.notification === 'breakthrough');
  assert.equal(big.length, 1);
  assert.match(big[0].text, /Nguyên Anh/);
  const realm = a.realmIndex;
  const tier = a.tier;
  ctx.game.ctx.drain(a, 10_000_000);
  ctx.game.ctx.gain(a, 1);
  assert.equal(a.realmIndex, realm);
  assert.equal(a.tier, tier);
  assert.ok(a.total >= config.realms[realm].min);
});

test('thân phận: 100 tim ngoại môn, 100 xu nội môn', () => {
  const ctx = setup();
  add(ctx, 'a');
  assert.equal(ctx.game.view('a').rank, 'Đệ tử ký danh');
  like(ctx, 'a', 100);
  assert.equal(ctx.game.view('a').rank, 'Đệ tử ngoại môn');
  gift(ctx, 'a', 99);
  gift(ctx, 'a', 1);
  assert.equal(ctx.game.view('a').rank, 'Đệ tử nội môn');
});

// ---------- Linh căn ----------

test('Tẩy Tủy không bao giờ bỏ hệ chủ, cập nhật loại; không hiệu ứng với Đơn/Biến dị/Thiên', () => {
  for (let roll = 0; roll < 1; roll += 0.1) {
    const ctx = setup();
    const a = add(ctx, 'a', { root: ROOTS.tap });
    for (let i = 0; i < 4; i++) {
      ctx.rolls = [roll];
      gift(ctx, 'a', 30);
      assert.ok(a.root.elements.includes('kim'));
    }
    assert.deepEqual(a.root, { type: 'don', main: 'kim', elements: ['kim'] });
  }
  for (const root of [ROOTS.don, ROOTS.loi, ROOTS.thien]) {
    const ctx = setup();
    const a = add(ctx, 'a', { root });
    gift(ctx, 'a', 30);
    assert.deepEqual(a.root, root);
  }
});

test('Biến dị: Kim thành Lôi khi trúng 10%; Biến dị và Thiên không đổi', () => {
  const ctx = setup();
  const a = add(ctx, 'a', { root: ROOTS.tam });
  ctx.rolls = [0.05];
  gift(ctx, 'a', 29999);
  assert.deepEqual(a.root, { type: 'biendi', main: 'loi', elements: ['loi'] });
  const b = add(ctx, 'b', { root: ROOTS.thien });
  ctx.rolls = [0.01];
  gift(ctx, 'b', 29999);
  assert.equal(b.root.type, 'thien');
});

// ---------- Phe ----------

test('phe: chọn đầu miễn phí, đổi cách 30 phút, không đổi khi boss xuất hiện; báo tương hợp', () => {
  const ctx = setup();
  const a = add(ctx, 'a', { main: 'kim' });
  chat(ctx, 'a', 'kiem');
  assert.equal(a.faction, 'kiem');
  assert.equal(ctx.of('faction')[0].text, 'Thiên phú tương hợp!');
  ctx.t += 10 * MIN;
  chat(ctx, 'a', 'đan');
  assert.equal(a.faction, 'kiem');
  ctx.t += 21 * MIN;
  ctx.game.ctx.schedule.request('boss');
  chat(ctx, 'a', 'đan');
  assert.equal(a.faction, 'kiem', 'đang đếm ngược boss');
});

// ---------- Boss ----------

test('công thức sát thương: khắc chế, bị khắc, trung tính, Thiên, khiên, phe kiếm, cảnh giới', () => {
  const ctx = setup();
  const { damageOf } = ctx.game.ctx.boss;
  const kim = add(ctx, 'kim', { main: 'kim' });
  const thien = add(ctx, 'th', { root: ROOTS.thien });
  assert.equal(damageOf(kim, 10, 'moc').value, 20);
  assert.equal(damageOf(kim, 10, 'hoa').value, 5);
  assert.equal(damageOf(kim, 10, 'thuy').value, 10);
  assert.equal(damageOf(thien, 10, 'kim').value, 15);
  assert.equal(damageOf(kim, 10, 'moc', true).value, 6);
  const loi = add(ctx, 'loi', { root: ROOTS.loi, faction: 'kiem' });
  assert.ok(Math.abs(damageOf(loi, 10, 'moc').value - 24) < 1e-9, 'Lôi thuộc Kim, phe kiếm x1.2');
  const high = add(ctx, 'hi', { main: 'thuy', total: 30_000_000 });
  assert.ok(Math.abs(damageOf(high, 10, 'kim').value - 18) < 1e-9, 'Chân Tiên x1.8');
});

test('máu boss = (5.000 + 500 × người có mặt) × cường hóa; bỏ chạy tăng 0.2, tối đa 2.0', () => {
  const ctx = setup();
  for (const id of ['a', 'b', 'c']) add(ctx, id);
  const boss = startFight(ctx);
  assert.equal(boss.maxHp, 6500);
  for (let i = 0; i < 7; i++) {
    ctx.advance(6 * MIN, 5 * SEC);
    for (const id of ['a', 'b', 'c']) chat(ctx, id, 'x');
    if (i < 6) {
      ctx.game.ctx.schedule.request('boss');
      ctx.advance(60 * SEC);
    }
  }
  assert.equal(ctx.game.snapshot().enrage, 2);
});

test('khiên tự tan khi không có phe trận; có phe trận thì cần đủ lượt phá', () => {
  const ctx = setup();
  add(ctx, 'a', { main: 'kim' });
  startFight(ctx, ['a']);
  gift(ctx, 'a', 29999);
  const boss = ctx.game.snapshot().boss;
  assert.equal(boss.hp, Math.floor(boss.maxHp / 2));
  assert.equal(boss.shield, null);
  assert.ok(ctx.of('shieldDown').some((e) => e.reason === 'noTran'));

  const ctx2 = setup();
  add(ctx2, 'a', { main: 'kim' });
  for (let i = 0; i < 3; i++) add(ctx2, `t${i}`, { main: 'tho', faction: 'tran' });
  startFight(ctx2, ['a', 't0', 't1', 't2']);
  gift(ctx2, 'a', 29999);
  let shield = ctx2.game.snapshot().boss.shield;
  assert.equal(shield.need, 6);
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < 3; i++) chat(ctx2, `t${i}`, 'phá trận');
    ctx2.t += 3 * SEC;
  }
  shield = ctx2.game.snapshot().boss.shield;
  assert.equal(shield, null);
  assert.ok(ctx2.of('shieldDown').some((e) => e.reason === 'broken'));
});

test('cuồng nộ: không hút người chưa tham gia, không làm tụt cảnh giới, trả lại khi hạ boss', () => {
  const ctx = setup();
  const a = add(ctx, 'a', { main: 'kim', total: 1005 });
  const idle = add(ctx, 'idle', { main: 'kim', total: 5000 });
  add(ctx, 'h', { main: 'kim' });
  startFight(ctx, ['a', 'idle', 'h']);
  chat(ctx, 'a', 'đánh');
  gift(ctx, 'h', 29999); // xuống 50%
  gift(ctx, 'h', 29999); // xuống 20%
  assert.equal(ctx.game.snapshot().boss.frenzy, true);
  const idleBefore = idle.total;
  const aBefore = a.total;
  ctx.advance(40 * SEC);
  for (let i = 0; i < 4; i++) {
    follow(ctx, 'h');
    ctx.advance(15 * SEC);
  }
  assert.equal(idle.total, idleBefore, 'chưa tham gia thì không bị hút');
  assert.equal(a.total, config.realms[a.realmIndex].min, 'không thấp hơn ngưỡng cảnh giới');
  gift(ctx, 'h', 29999);
  assert.equal(ctx.game.snapshot().boss.phase, 'award');
  assert.ok(a.total >= aBefore + config.boss.rewards.participation, 'được trả lại khi hạ boss');
});

test('hạ boss: thưởng top 3, danh hiệu Đồ Ma Giả 7 ngày, Trảm Yêu đến hết phiên; Phong Thưởng 8 giây', () => {
  const ctx = setup();
  add(ctx, 'a', { main: 'kim' });
  add(ctx, 'b', { main: 'kim' });
  startFight(ctx, ['a', 'b']);
  gift(ctx, 'a', 29999);
  gift(ctx, 'a', 29999);
  gift(ctx, 'b', 29999);
  const boss = ctx.game.snapshot().boss;
  assert.equal(boss.phase, 'award');
  assert.equal(boss.top[0].id, 'a');
  assert.deepEqual(ctx.game.ctx.titlesOf(ctx.p('a')), ['Đồ Ma Giả']);
  assert.deepEqual(ctx.game.ctx.titlesOf(ctx.p('b')), ['Trảm Yêu']);
  ctx.advance(9 * SEC);
  assert.equal(ctx.game.snapshot().boss, null);
  ctx.game.endSession();
  assert.ok(!ctx.game.ctx.titlesOf(ctx.p('b')).includes('Trảm Yêu'));
  ctx.t += 8 * 24 * 60 * MIN;
  assert.ok(!ctx.game.ctx.titlesOf(ctx.p('a')).includes('Đồ Ma Giả'));
});

// ---------- Lịch Thiên Đạo ----------

test('Lịch Thiên Đạo: boss phút 0, mưa phút 8 và 16; không bao giờ 2 sự kiện lớn cùng lúc', () => {
  const ctx = setup();
  add(ctx, 'a');
  let overlap = false;
  ctx.events.length = 0;
  for (let s = 0; s < 45 * 60; s++) {
    ctx.advance(SEC);
    if (s % 60 === 0) chat(ctx, 'a', 'đánh');
    const st = ctx.game.snapshot();
    if ((st.boss ? 1 : 0) + (st.rain.active ? 1 : 0) > 1) overlap = true;
  }
  assert.equal(overlap, false);
  const starts = ctx.of('scheduleStart').map((e) => e.type);
  assert.deepEqual(starts.slice(0, 5), ['boss', 'rain', 'rain', 'boss', 'rain']);
});

test('sự kiện đến giờ khi đang bận thì chờ xong + 30 giây; trễ quá 3 phút thì bỏ', () => {
  const ctx = setup();
  add(ctx, 'a');
  const schedule = ctx.game.ctx.schedule;
  ctx.advance(SEC);
  assert.equal(schedule.running(), 'boss');
  schedule.request('rain');
  ctx.advance(2 * MIN);
  assert.equal(ctx.game.snapshot().rain.active, false);
  // Boss bỏ chạy lúc 06:00: mưa gọi tay đã trễ hơn 3 phút nên bị bỏ.
  ctx.advance(5 * MIN);
  assert.ok(ctx.of('scheduleSkip').some((e) => e.type === 'rain'));

  const ctx2 = setup();
  add(ctx2, 'a');
  ctx2.advance(SEC);
  ctx2.advance(4 * MIN);
  ctx2.game.ctx.schedule.request('rain');
  const fled = START + SEC + 60 * SEC + 5 * MIN;
  ctx2.advance(fled - ctx2.t + 10 * SEC);
  assert.equal(ctx2.game.snapshot().rain.active, false, 'chưa đủ 30 giây sau boss');
  ctx2.advance(25 * SEC);
  assert.equal(ctx2.game.snapshot().rain.active, true);
});

test('không có ai có mặt thì bỏ lượt boss theo lịch; tạm dừng thì lịch đứng yên', () => {
  const ctx = setup();
  ctx.advance(2 * SEC);
  assert.equal(ctx.game.snapshot().boss, null);
  add(ctx, 'a');
  ctx.game.command('pause', { on: true });
  const at = ctx.game.snapshot().schedule.upcoming[0].at;
  ctx.advance(10 * MIN, 10 * SEC);
  assert.equal(ctx.game.snapshot().schedule.upcoming[0].at - at, 10 * MIN);
  assert.equal(ctx.game.snapshot().rain.active, false);
});

// ---------- Mưa Linh Thạch ----------

test('Mưa Linh Thạch: mỗi người 1 lần, 10 người nhanh nhất x2, phe đan tương hợp +20%', () => {
  const ctx = setup();
  for (let i = 0; i < 12; i++) add(ctx, `p${i}`, { root: ROOTS.tam });
  const dan = add(ctx, 'dan', { main: 'moc', faction: 'dan' });
  ctx.game.ctx.schedule.request('rain');
  assert.equal(ctx.game.snapshot().rain.active, true);
  const reward = config.rain.rewardMin + Math.floor(0.5 * (config.rain.rewardMax - config.rain.rewardMin + 1));
  for (let i = 0; i < 12; i++) {
    const before = ctx.p(`p${i}`).total;
    chat(ctx, `p${i}`, 'nhặt');
    chat(ctx, `p${i}`, 'nhặt');
    assert.equal(ctx.p(`p${i}`).total - before, i < 10 ? reward * 2 : reward);
  }
  const before = dan.total;
  chat(ctx, 'dan', 'nhat');
  assert.equal(dan.total - before, Math.floor(reward * 1.8 * 1.2));
  assert.equal(ctx.p('p0').quests.progress.event, 1);
});

// ---------- Ghế, bảng ----------

test('5 ghế phiên: không ai giữ 2 ghế; Chưởng Môn mới có thông báo lớn; không chiếm ghế điện', () => {
  const ctx = setup();
  for (let i = 0; i < 8; i++) {
    add(ctx, `p${i}`);
    gift(ctx, `p${i}`, 10 + i);
  }
  ctx.advance(11 * SEC);
  let seats = ctx.game.ctx.seats.sessionSeats();
  assert.equal(new Set(seats).size, 5);
  assert.equal(seats[0], 'p7');
  gift(ctx, 'p0', 100);
  ctx.advance(11 * SEC);
  seats = ctx.game.ctx.seats.sessionSeats();
  assert.equal(seats[0], 'p0');
  assert.equal(new Set(seats).size, 5);
  assert.ok(ctx.of('notification').some((e) => e.notification === 'master' && /Tên p0 lên ngôi Chưởng Môn/.test(e.text)));
  const hall = ctx.game.ctx.hall.seatIds().filter(Boolean);
  assert.ok(seats.every((id) => !hall.includes(id)));
});

test('Lão Tổ và Thái Thượng là hạng 1, 2 tu vi tổng kể cả người vắng mặt, còn nguyên sau khởi động lại', () => {
  const ctx = setup();
  add(ctx, 'a', { total: 5000 });
  add(ctx, 'b', { total: 3000 });
  add(ctx, 'c', { total: 1000 });
  ctx.advance(30 * MIN, MIN);
  assert.equal(ctx.game.snapshot().presentPlayers, 0);
  assert.deepEqual(ctx.game.ctx.seats.elders(), ['a', 'b']);
  gift(ctx, 'c', 600);
  ctx.advance(2 * SEC);
  assert.deepEqual(ctx.game.ctx.seats.elders(), ['c', 'a']);
  assert.ok(ctx.of('notification').some((e) => e.notification === 'elder' && /Tên c vượt qua Tên a · trở thành Lão Tổ/.test(e.text)));

  const saved = ctx.game.exportDirty();
  const ctx2 = setup({ session: false });
  ctx2.t = ctx.t + 60 * MIN;
  ctx2.game.load(saved);
  assert.deepEqual(ctx2.game.ctx.seats.elders(), ['c', 'a']);
  assert.equal(ctx2.game.snapshot().elders[0].player.present, false);
  assert.equal(ctx2.of('notification').length, 0, 'khởi động lại không báo nhầm');
});

test('bảng xếp hạng chỉ hiện người có mặt, bằng điểm thì ai đạt trước xếp trên', () => {
  const ctx = setup();
  add(ctx, 'a');
  add(ctx, 'b');
  gift(ctx, 'b', 5);
  gift(ctx, 'a', 5);
  assert.deepEqual(ctx.game.snapshot().boards.session.map((p) => p.id), ['b', 'a']);
  ctx.t += 16 * MIN;
  chat(ctx, 'a', 'x');
  assert.deepEqual(ctx.game.snapshot().boards.session.map((p) => p.id), ['a']);
});

// ---------- Điện ----------

test('điện đầy ghế: đầy thì người im lặng lâu nhất nhường ghế; quá 15 phút thì bế quan', () => {
  const ctx = setup();
  const hallSize = ctx.game.ctx.config.presence.hallColumns * ctx.game.ctx.config.presence.hallRows;
  for (let i = 0; i < 50; i++) {
    add(ctx, `p${i}`);
    ctx.t += 100;
  }
  ctx.advance(2 * SEC);
  const vip = ctx.game.ctx.seats.vipIds();
  const seated = ctx.game.ctx.hall.seatIds();
  assert.equal(seated.filter(Boolean).length, hallSize);
  const waitingId = Array.from({ length: 50 }, (_, i) => `p${i}`).find((id) => !seated.includes(id) && !vip.has(id));
  const quietest = seated.reduce((q, id) => (ctx.p(id).lastSeen < ctx.p(q).lastSeen ? id : q));
  const slot = seated.indexOf(quietest);
  chat(ctx, waitingId, 'x');
  ctx.advance(2 * SEC);
  assert.equal(ctx.game.ctx.hall.seatIds()[slot], waitingId, 'vào đúng ô của người nhường');
  assert.equal(ctx.game.snapshot().hall.waiting, 50 - hallSize - vip.size);
  ctx.advance(16 * MIN, 30 * SEC);
  assert.equal(ctx.game.ctx.hall.seatIds().filter(Boolean).length, 0);
  assert.equal(ctx.game.snapshot().hall.closed, 50);
});

// ---------- Truyền Tin, thông báo ----------

test('mọi dòng có "+N tu vi" khớp số thực tế; dòng gộp tương tác khớp tổng chat 10 giây', () => {
  const ctx = setup();
  for (let i = 0; i < 6; i++) add(ctx, `p${i}`, { root: ROOTS.song });
  ctx.advance(11 * SEC);
  const totals = () => [...Array(6).keys()].reduce((s, i) => s + ctx.p(`p${i}`).total, 0);
  ctx.events.length = 0;
  const before = totals();
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 6; i++) chat(ctx, `p${i}`, 'hi');
    ctx.advance(10 * SEC);
  }
  const summaries = ctx.feed().filter((e) => e.kind === 'interact');
  assert.equal(summaries.reduce((s, e) => s + e.amount, 0), totals() - before);
  for (const e of summaries) assert.match(e.text, new RegExp(`tổng \\+${e.amount} tu vi`));

  ctx.events.length = 0;
  const g0 = totals();
  for (let i = 0; i < 6; i++) gift(ctx, `p${i}`, 1 + i);
  share(ctx, 'p0');
  for (const e of ctx.feed()) {
    if (e.amount > 0 && !e.merged) assert.match(e.text, new RegExp(`\\+${e.amount.toLocaleString('vi-VN').replace('.', '\\.')} tu vi`));
  }
  assert.equal(ctx.feed().reduce((s, e) => s + e.amount, 0), totals() - g0);
  const gains = ctx.of('gain').reduce((s, e) => s + e.amount, 0);
  assert.equal(gains, totals() - g0, 'chữ +N trên avatar khớp số cộng');
});

test('Truyền Tin: chia sẻ trong 3 giây được gộp thành một dòng', () => {
  const ctx = setup();
  for (let i = 0; i < 5; i++) add(ctx, `p${i}`);
  ctx.advance(5 * SEC);
  for (let i = 0; i < 5; i++) share(ctx, `p${i}`);
  assert.equal(ctx.game.snapshot().feed.at(-1).text, '5 đạo hữu vừa chia sẻ tông môn · tổng +200 tu vi');
});

test('thông báo lớn: theo thứ tự ưu tiên, hàng đợi quá 10 bỏ mục ưu tiên thấp nhất', () => {
  const ctx = setup();
  const { notify } = ctx.game.ctx;
  notify('tide', 'T0');
  for (let i = 0; i < 9; i++) notify('bigGift', `G${i}`);
  notify('tide', 'T1');
  notify('bossDown', 'B');
  notify('heavenRoot', 'H');
  ctx.advance(40 * SEC);
  const shown = ctx.of('notification').map((e) => e.text);
  assert.equal(shown[0], 'T0');
  assert.deepEqual(shown.slice(1, 3), ['H', 'B']);
  assert.ok(!shown.includes('T1'), 'mục ưu tiên thấp nhất bị bỏ');
  assert.equal(shown.length, 11);
});

// ---------- Nhiệm vụ ngày ----------

test('nhiệm vụ ngày: đủ 3 mở rương +100 một lần; reset 00:00 giờ Việt Nam', () => {
  const ctx = setup();
  const a = add(ctx, 'a');
  ctx.t += 10 * SEC;
  like(ctx, 'a', 100);
  for (let i = 0; i < 5; i++) {
    chat(ctx, 'a', 'x');
    ctx.t += 10 * SEC;
  }
  ctx.game.ctx.schedule.request('rain');
  chat(ctx, 'a', 'nhặt');
  const chest = ctx.of('chest');
  assert.equal(chest.length, 1);
  assert.equal(chest[0].amount, config.quests.chestReward);
  like(ctx, 'a', 500);
  assert.equal(ctx.of('chest').length, 1);

  // 23:59 → 00:00 giờ Việt Nam (16:59 → 17:00 UTC).
  ctx.t = Date.UTC(2026, 10, 2, 16, 59, 0);
  like(ctx, 'a', 1);
  assert.equal(ctx.game.ctx.quests.progressOf(a)[0].done, 100);
  ctx.t = Date.UTC(2026, 10, 2, 17, 0, 1);
  like(ctx, 'a', 1);
  assert.equal(ctx.game.ctx.quests.progressOf(a)[0].done, 1);
});

// ---------- Hồ sơ check ----------

test('check: 1 lần mỗi 30 giây, 1 thẻ 6 giây, hàng chờ tối đa 5', () => {
  const ctx = setup();
  for (let i = 0; i < 8; i++) add(ctx, `p${i}`);
  for (let i = 0; i < 8; i++) chat(ctx, `p${i}`, 'check');
  chat(ctx, 'p0', 'check');
  assert.equal(ctx.game.snapshot().card.id, 'p0');
  assert.equal(ctx.game.snapshot().cardQueue, 5);
  ctx.advance(6 * SEC);
  const card = ctx.game.snapshot().card;
  assert.equal(card.id, 'p3');
  assert.ok(card.next && card.quests.length === 3 && card.realm && card.rootName);
});
