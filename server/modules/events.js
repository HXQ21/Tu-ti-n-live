// Khe phút 12 của Lịch Thiên Đạo: luân phiên Luận Đạo → Luyện Đan → Đăng Thiên Thê → Bí Cảnh.
// Mỗi module sự kiện đăng ký bằng ctx.events.register(id, { label, start, abort }); module tắt thì bị bỏ qua.

export function createEvents(ctx) {
  const rotation = ctx.config.events.rotation;
  const handlers = new Map();
  let index = 0;
  let current = null;

  const enabled = () => rotation.filter((id) => handlers.has(id));

  function nextId() {
    const list = enabled();
    if (list.length === 0) return null;
    for (let step = 0; step < rotation.length; step++) {
      const id = rotation[(index + step) % rotation.length];
      if (handlers.has(id)) return id;
    }
    return null;
  }

  ctx.on('sessionStart', () => {
    index = 0;
  });

  ctx.schedule.register('slot12', {
    get label() {
      const id = nextId();
      return id ? handlers.get(id).label : 'Sự kiện';
    },
    start() {
      const id = nextId();
      if (!id) return false;
      index = (rotation.indexOf(id) + 1) % rotation.length;
      if (!handlers.get(id).start()) return false;
      current = id;
      return true;
    },
    abort() {
      if (current) handlers.get(current).abort?.();
      current = null;
    },
  });

  return {
    name: 'events',
    register(id, handler) {
      handlers.set(id, handler);
    },
    // Module sự kiện gọi khi xong để nhường lịch.
    finished(id) {
      if (current !== id) return;
      current = null;
      ctx.schedule.finished('slot12');
    },
    // Gọi ngay một sự kiện cụ thể (bảng quản trị), vẫn đi qua lịch.
    request(id) {
      if (!handlers.has(id)) return false;
      index = rotation.indexOf(id);
      return ctx.schedule.request('slot12');
    },
    current: () => current,
  };
}
