import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createGame } from '../server/game.js';
import { loadQuestions } from '../server/modules/debate.js';

const base = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
const MIN = 60_000;
const SEC = 1000;
const START = Date.UTC(2026, 10, 2, 3, 0, 0);

function setup(modules = base.modules, { questions } = {}) {
  const config = { ...base, modules };
  const ctx = { t: START, rolls: [], events: [], config };
  ctx.game = createGame({
    config,
    now: () => ctx.t,
    random: () => (ctx.rolls.length ? ctx.rolls.shift() : 0.5),
    emit: (event) => ctx.events.push(event),
    questions,
  });
  ctx.game.load({ players: [], meta: {} });
  ctx.game.startSession('test');
  // Lượt boss phút 00 bị bỏ vì chưa có ai có mặt: các test sự kiện không bị boss chen vào.
  ctx.game.tick();
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
const gift = (ctx, id, diamonds, quantity = 1) =>
  ctx.game.handleEvent({
    type: 'gift', user: user(id), msgId: null, giftId: `g${diamonds}`, giftName: `Quà ${diamonds}`,
    diamonds, combo: false, repeatCount: quantity, repeatEnd: false, groupId: 'x',
  });

function add(ctx, id, { root = { type: 'tam', main: 'kim', elements: ['kim', 'moc', 'thuy'] }, total = 0 } = {}) {
  chat(ctx, id, 'tu luyện');
  const player = ctx.p(id);
  player.root = structuredClone(root);
  Object.assign(player, { total: 0, frac: 0, sessionPts: 0, weekPts: 0, realmIndex: 0, tier: 0 });
  if (total > 0) ctx.game.ctx.gain(player, total, { source: 'test', session: false, week: false });
  return player;
}

// ---------- A. Bảo Khố ----------

test('A: mỗi quà chỉ kích hoạt đúng một mốc, kể cả ở biên', () => {
  const ctx = setup();
  add(ctx, 'a');
  const cases = [[1, 'linhThach'], [4, 'linhThach'], [5, 'tuKhi'], [9, 'tuKhi'], [10, 'luyenKhiPhu'], [29, 'luyenKhiPhu'],
    [30, 'tayTuy'], [98, 'tayTuy'], [99, 'hoPhap'], [999, 'hoPhap'], [1000, 'thienDuc'], [29998, 'thienDuc'], [29999, 'thienMenh'], [44999, 'thienMenh']];
  for (const [diamonds, id] of cases) {
    ctx.events.length = 0;
    gift(ctx, 'a', diamonds, 3);
    const items = ctx.of('vaultItem');
    assert.equal(items.length, 1, `${diamonds} xu`);
    assert.equal(items[0].item, id, `${diamonds} xu`);
    assert.equal(items[0].quantity, 3);
  }
});

test('A: quà luôn cộng tu vi = xu × 10; Tụ Khí Đan x1.2 trong 60 giây, tặng tiếp chỉ làm mới', () => {
  const ctx = setup();
  const a = add(ctx, 'a');
  const before = a.total;
  gift(ctx, 'a', 5);
  assert.equal(a.total - before, 50);
  gift(ctx, 'a', 5);
  assert.equal(a.tuKhiUntil, ctx.t + 60 * SEC, 'không cộng dồn thời gian');
  assert.ok(Math.abs(ctx.game.ctx.cultivation.chatLikeMult(a) - 1.2) < 1e-9, 'không nhân chồng x1.44');
  ctx.t += 61 * SEC;
  assert.equal(ctx.game.ctx.cultivation.chatLikeMult(a), 1);
});

test('A: tắt module thì quay về luật Phần 1', () => {
  const ctx = setup({});
  add(ctx, 'a');
  gift(ctx, 'a', 5);
  assert.equal(ctx.of('vaultItem').length, 0);
});

// ---------- B. Bình cảnh & Độ kiếp ----------

test('B: chạm ngưỡng Kim Đan thì dừng ở Trúc Cơ tầng 9, tu vi vẫn tăng, báo bình cảnh một lần', () => {
  const ctx = setup();
  const a = add(ctx, 'a');
  gift(ctx, 'a', 1500);
  assert.equal(ctx.game.view('a').realm, 'Trúc Cơ tầng 9');
  assert.ok(a.total >= 15000);
  gift(ctx, 'a', 10);
  assert.equal(ctx.feed().filter((e) => /chạm bình cảnh Kim Đan/.test(e.text)).length, 1);
  assert.equal(ctx.of('notification').filter((e) => e.notification === 'breakthrough').length, 0);
});

test('B: độ kiếp thành công lên đúng 1 cảnh giới, người hộ pháp +20; còn dư thì bình cảnh tiếp', () => {
  const ctx = setup();
  const a = add(ctx, 'a', { total: 150_000 });
  for (const id of ['h1', 'h2']) add(ctx, id);
  assert.equal(a.realmIndex, 2);
  chat(ctx, 'a', 'độ kiếp');
  assert.ok(ctx.game.snapshot().tribulation);
  const helperBefore = ctx.p('h1').total;
  chat(ctx, 'h1', 'hộ pháp');
  chat(ctx, 'h1', 'hộ pháp');
  chat(ctx, 'h2', 'ho phap');
  chat(ctx, 'a', 'hộ pháp');
  assert.equal(ctx.game.ctx.tribulation.chance(), 62, 'mỗi người 1 lần, người độ kiếp không tự hộ pháp');
  ctx.rolls = [0.1];
  ctx.advance(31 * SEC);
  assert.equal(a.realmIndex, 3);
  assert.equal(ctx.game.view('a').realm, 'Kim Đan tầng 9', 'tu vi đã vượt Nguyên Anh nên bình cảnh tiếp');
  assert.ok(ctx.of('notification').some((e) => e.notification === 'breakthrough' && /Kim Đan/.test(e.text)));
  assert.ok(ctx.p('h1').total - helperBefore >= 20);
});

test('B: tỉ lệ không vượt 95%; thất bại không tụt cảnh giới, không thấp hơn ngưỡng; tinh dưỡng đúng 8 phút', () => {
  const ctx = setup();
  const a = add(ctx, 'a', { total: 20_000 });
  add(ctx, 'z');
  chat(ctx, 'a', 'độ kiếp');
  gift(ctx, 'z', 999, 5);
  like(ctx, 'z', 5000);
  assert.equal(ctx.game.ctx.tribulation.chance(), 95);
  ctx.rolls = [0.99];
  ctx.advance(31 * SEC);
  assert.equal(a.realmIndex, 2);
  assert.ok(a.total >= base.realms[2].min);
  const excess = 20_000 + 0 - base.realms[2].min;
  assert.ok(ctx.feed().some((e) => /độ kiếp thất bại · mất/.test(e.text)));
  assert.ok(excess > 0);

  ctx.t += 7 * MIN + 50 * SEC;
  chat(ctx, 'a', 'độ kiếp');
  assert.equal(ctx.game.snapshot().tribulation, null, 'còn tinh dưỡng');
  ctx.t += 20 * SEC;
  chat(ctx, 'a', 'độ kiếp');
  ctx.game.tick();
  assert.ok(ctx.game.snapshot().tribulation, 'hết 8 phút thì được độ kiếp lại');
});

test('B: không độ kiếp khi boss đang diễn ra; độ kiếp đang chạy thì sự kiện theo lịch phải chờ', () => {
  const ctx = setup();
  add(ctx, 'a', { total: 20_000 });
  ctx.game.ctx.schedule.request('boss');
  assert.ok(ctx.game.ctx.boss.active());
  chat(ctx, 'a', 'độ kiếp');
  assert.equal(ctx.game.snapshot().tribulation, null);

  const ctx2 = setup();
  add(ctx2, 'a', { total: 20_000 });
  ctx2.advance(7 * MIN + 50 * SEC);
  chat(ctx2, 'a', 'độ kiếp');
  ctx2.game.tick();
  assert.ok(ctx2.game.snapshot().tribulation);
  ctx2.advance(15 * SEC);
  assert.equal(ctx2.game.snapshot().rain.active, false, 'mưa đến giờ nhưng phải chờ độ kiếp');
  ctx2.advance(60 * SEC);
  assert.equal(ctx2.game.snapshot().rain.active, true);
});

test('B: đang độ kiếp thì thẻ check được hoãn', () => {
  const ctx = setup();
  add(ctx, 'a', { total: 20_000 });
  add(ctx, 'b');
  ctx.advance(9 * MIN);
  chat(ctx, 'a', 'độ kiếp');
  ctx.game.tick();
  chat(ctx, 'b', 'check');
  assert.equal(ctx.game.snapshot().card, null);
  ctx.advance(31 * SEC);
  assert.equal(ctx.game.snapshot().card?.id, 'b');
});

// ---------- C. Luận Đạo ----------

const QUESTIONS = [
  { question: 'Q1', options: ['a', 'b', 'c'], answer: 2 },
  { question: 'Q2', options: ['a', 'b', 'c'], answer: 1 },
];

function startDebate(ctx) {
  assert.ok(ctx.game.ctx.events.request('debate'));
  ctx.game.tick();
  const debate = ctx.game.snapshot().debate;
  assert.equal(debate?.phase, 'ask');
  return debate;
}

test('C: chỉ tính đáp án đầu tiên; đúng +30, 3 người nhanh nhất +100/+60/+40', () => {
  const ctx = setup(base.modules, { questions: QUESTIONS });
  for (const id of ['a', 'b', 'c', 'd', 'e']) add(ctx, id);
  const debate = startDebate(ctx);
  const right = String(QUESTIONS.find((q) => q.question === debate.question).answer);
  const wrong = right === '1' ? '3' : '1';
  const before = Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map((id) => [id, ctx.p(id).total]));
  chat(ctx, 'a', wrong);
  chat(ctx, 'a', right);
  for (const id of ['b', 'c', 'd', 'e']) chat(ctx, id, right);
  ctx.advance(21 * SEC);
  const gainOf = (id) => ctx.p(id).total - before[id];
  assert.equal(gainOf('a'), 0, 'đáp án đầu sai thì không tính lại');
  assert.ok(gainOf('b') >= 130 && gainOf('b') < 140);
  assert.ok(gainOf('c') >= 90 && gainOf('c') < 100);
  assert.ok(gainOf('d') >= 70 && gainOf('d') < 80);
  assert.ok(gainOf('e') >= 30 && gainOf('e') < 40);
  const award = ctx.game.snapshot().debate;
  assert.equal(award.phase, 'award');
  assert.equal(award.correct, 4);
  ctx.advance(6 * SEC);
  assert.equal(ctx.game.snapshot().debate, null);
  assert.equal(ctx.p('a').quests.progress.event, 1, 'trả lời là tham gia sự kiện');
});

test('C: không lặp lại câu hỏi trong cùng phiên; "1" ngoài giờ đố không làm nhập môn', () => {
  const ctx = setup(base.modules, { questions: QUESTIONS });
  chat(ctx, 'x', '1');
  assert.equal(ctx.p('x'), undefined);
  add(ctx, 'a');
  const seen = [];
  for (let i = 0; i < 2; i++) {
    seen.push(startDebate(ctx).question);
    ctx.advance(30 * SEC);
  }
  assert.deepEqual([...new Set(seen)].length, 2);
});

test('C: khe phút 12 chạy Luận Đạo theo lịch; file questions.json có 30 câu hợp lệ', () => {
  assert.equal(loadQuestions('questions.json').length, 30);
  const ctx = setup();
  add(ctx, 'a');
  ctx.advance(12 * MIN + 2 * SEC, 2 * SEC);
  const starts = ctx.of('scheduleStart').map((e) => e.type);
  assert.ok(starts.includes('slot12'));
  assert.ok(ctx.of('debateStart').length === 1);
});

// ---------- D. Pháp bảo ----------

test('D: nhập môn nhận pháp bảo; luyện 3/10/50 lượt lên Linh/Bảo/Tiên khí; Tiên khí có thông báo lớn', () => {
  const ctx = setup();
  const a = add(ctx, 'a');
  assert.ok(a.artifact);
  assert.ok(ctx.feed().some((e) => /mở khóa pháp bảo/.test(e.text)));
  const { refine } = ctx.game.ctx.artifact;
  refine(a, 2);
  assert.equal(a.artifact.grade, 0);
  refine(a, 1);
  assert.equal(a.artifact.grade, 1);
  refine(a, 10);
  assert.equal(a.artifact.grade, 2);
  refine(a, 49);
  assert.equal(a.artifact.grade, 2);
  assert.equal(refine(a, 5), 1, 'lên Tiên khí thì không nhận thêm');
  assert.equal(a.artifact.grade, 3);
  assert.ok(ctx.of('notification').some((e) => e.notification === 'artifact'));
});

test('D: quà 10 xu và 99 xu cộng lượt luyện; rương nhiệm vụ +1; phẩm nhân sát thương boss', () => {
  const ctx = setup();
  const a = add(ctx, 'a');
  gift(ctx, 'a', 10, 2);
  gift(ctx, 'a', 99);
  assert.equal(a.artifact.grade, 1);
  const { damageOf } = ctx.game.ctx.boss;
  const extra = ctx.game.ctx.beast.multOf(a) * ctx.game.ctx.wings.multOf(a);
  assert.ok(Math.abs(damageOf(a, 10, 'thuy').value - 10 * 1.1 * (1 + 0.1 * a.realmIndex) * extra) < 1e-9);

  ctx.t += 10 * SEC;
  like(ctx, 'a', 100);
  for (let i = 0; i < 5; i++) {
    chat(ctx, 'a', 'x');
    ctx.t += 10 * SEC;
  }
  ctx.game.ctx.quests.advance(a, 'event');
  assert.equal(a.artifact.progress, 1);
});

test('D: người chơi cũ chưa có pháp bảo được tặng khi tương tác', () => {
  const ctx = setup();
  const a = add(ctx, 'a');
  a.artifact = null;
  chat(ctx, 'a', 'hello');
  assert.ok(a.artifact);
});
