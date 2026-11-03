// Phần 2 mục C: Luận Đạo Đại Hội (đố vui) trong khe phút 12.
// 1 câu hỏi, 3 đáp án, 20 giây. Chat "1", "2" hoặc "3"; chỉ tính đáp án đầu tiên của mỗi người.
// Câu hỏi lấy từ questions.json, không lặp lại trong cùng phiên.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEC, fmt } from '../util.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadQuestions(file) {
  const list = JSON.parse(readFileSync(path.resolve(ROOT, file), 'utf8').replace(/^﻿/, ''));
  return list.filter((q) => q && q.question && Array.isArray(q.options) && q.options.length === 3 && [1, 2, 3].includes(q.answer));
}

export function createDebate(ctx) {
  const { config } = ctx;
  const cfg = config.debate;
  const questions = ctx.questions ?? loadQuestions(cfg.file);
  let asked = new Set();
  let round = null; // { phase: 'ask' | 'award', index, endsAt, answers: Map, correct: [] }

  function start() {
    if (questions.length === 0) return false;
    if (asked.size >= questions.length) asked = new Set();
    const free = questions.map((_, i) => i).filter((i) => !asked.has(i));
    const index = ctx.pick(free);
    asked.add(index);
    round = { phase: 'ask', index, endsAt: ctx.now() + cfg.answerSec * SEC, answers: new Map(), correct: [] };
    ctx.emit({ kind: 'debateStart', question: questions[index].question, endsAt: round.endsAt });
    return true;
  }

  function answer(player, choice) {
    if (round?.phase !== 'ask' || round.answers.has(player.id)) return;
    round.answers.set(player.id, choice);
    ctx.fire('eventJoin', player, 'debate');
    if (choice === questions[round.index].answer) round.correct.push(player.id);
  }

  function close() {
    const q = questions[round.index];
    let total = 0;
    for (const id of round.correct) {
      const player = ctx.players.get(id);
      if (player) total += ctx.gain(player, cfg.correct, { source: 'debate' });
    }
    const top = round.correct.slice(0, cfg.fastest.length).map((id, i) => {
      const player = ctx.players.get(id);
      const reward = ctx.gain(player, cfg.fastest[i], { source: 'debate' });
      ctx.log({ kind: 'quest', id, amount: reward, text: `${player.name} ngộ đạo nhanh thứ ${i + 1} · +${fmt(reward)} tu vi` });
      return { id, name: player.name, reward: reward + cfg.correct };
    });
    ctx.log({
      kind: 'quest',
      amount: total,
      text: `Luận Đạo: đáp án ${q.answer} · ${round.correct.length}/${round.answers.size} đạo hữu trả lời đúng${round.correct.length ? ` · mỗi người +${fmt(cfg.correct)} tu vi` : ''}`,
    });
    if (top[0]) ctx.fire('debateFastest', ctx.players.get(top[0].id));
    round = {
      phase: 'award',
      index: round.index,
      endsAt: ctx.now() + cfg.awardSec * SEC,
      top,
      correctCount: round.correct.length,
      answered: round.answers.size,
    };
    ctx.emit({ kind: 'debateEnd', answer: q.answer, top, correct: round.correctCount });
  }

  function abort() {
    round = null;
  }

  ctx.events.register('debate', { label: 'Luận Đạo Đại Hội', start, abort });

  for (const choice of [1, 2, 3]) {
    ctx.command([String(choice)], (player) => answer(player, choice), { joins: () => round?.phase === 'ask' });
  }

  ctx.on('sessionStart', () => {
    asked = new Set();
  });

  return {
    name: 'debate',
    questions,
    active: () => Boolean(round),
    tick() {
      if (!round || ctx.now() < round.endsAt) return;
      if (round.phase === 'ask') close();
      else {
        round = null;
        ctx.events.finished('debate');
      }
    },
    snapshot(state) {
      if (!round) {
        state.debate = null;
        return;
      }
      const q = questions[round.index];
      state.debate = round.phase === 'ask'
        ? { phase: 'ask', question: q.question, options: q.options, endsAt: round.endsAt, answered: round.answers.size }
        : { phase: 'award', question: q.question, options: q.options, answer: q.answer, endsAt: round.endsAt, top: round.top, correct: round.correctCount, answered: round.answered };
    },
  };
}
