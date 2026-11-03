// Ba bảng xếp hạng, chỉ hiển thị người có mặt; bằng điểm thì ai đạt trước xếp trên.

export function createBoards(ctx) {
  const size = ctx.config.leaderboard.size;

  function board(present, points, seqKey) {
    return present
      .filter((p) => points(p) > 0)
      .sort((a, b) => points(b) - points(a) || a[seqKey] - b[seqKey])
      .slice(0, size)
      .map((p) => ({ ...ctx.viewOf(p), points: points(p) }));
  }

  return {
    name: 'boards',
    board,
    snapshot(state, present) {
      state.boards = {
        session: board(present, ctx.sessionPoints, 'seqSession'),
        total: board(present, (p) => p.total, 'seqTotal'),
        week: board(present, ctx.weekPoints, 'seqWeek'),
      };
    },
  };
}
