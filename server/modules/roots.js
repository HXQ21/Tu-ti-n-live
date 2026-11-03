// Linh căn: thức tỉnh khi nhập môn, hệ số tu luyện, tẩy tủy, biến dị.

const WASHABLE = new Set(['tap', 'tam', 'song']);
const NO_MUTATION = new Set(['biendi', 'thien']);

function rootTypeByCount(count) {
  if (count >= 4) return 'tap';
  if (count === 3) return 'tam';
  return count === 2 ? 'song' : 'don';
}

export function createRoots(ctx) {
  const { config, random, pick, randInt } = ctx;
  const rootById = new Map(config.roots.map((root) => [root.id, root]));
  const elementIds = Object.keys(config.elements);
  const baseElements = elementIds.filter((id) => id !== 'thien' && !config.elements[id].base);
  const mutantElements = elementIds.filter((id) => config.elements[id].base);

  const mult = (player) => rootById.get(player.root.type).mult;
  const rootName = (player) => rootById.get(player.root.type).name;

  // Hệ gốc ngũ hành để tính khắc chế: Lôi thuộc Kim, Băng thuộc Thủy, Phong thuộc Mộc.
  const baseOf = (element) => config.elements[element]?.base ?? element;

  function awaken() {
    const total = config.roots.reduce((sum, root) => sum + root.weight, 0);
    let roll = random() * total;
    let spec = config.roots.at(-1);
    for (const root of config.roots) {
      roll -= root.weight;
      if (roll < 0) {
        spec = root;
        break;
      }
    }
    if (spec.id === 'thien') return { type: 'thien', main: 'thien', elements: [] };
    if (spec.id === 'biendi') {
      const main = pick(mutantElements);
      return { type: 'biendi', main, elements: [main] };
    }
    const count = randInt(spec.count[0], spec.count[1]);
    const pool = [...baseElements];
    const elements = [];
    while (elements.length < count) elements.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
    return { type: spec.id, main: pick(elements), elements };
  }

  ctx.hooks.newPlayer.push((player) => {
    player.root = awaken();
  });

  ctx.hooks.chatLikeMult.push(mult);

  ctx.on('join', (player) => {
    if (player.root.type !== 'thien') return;
    ctx.notify('heavenRoot', `🌟 Thiên địa dị tượng! ${player.name} sở hữu Thiên Linh Căn!`, { id: player.id });
  });

  // Bỏ ngẫu nhiên 1 hệ phụ, không bao giờ bỏ hệ chủ. Trả về false nếu không có hiệu ứng.
  function wash(player, source) {
    const { root } = player;
    if (!WASHABLE.has(root.type)) return false;
    const minors = root.elements.filter((id) => id !== root.main);
    const removed = pick(minors);
    root.elements = root.elements.filter((id) => id !== removed);
    root.type = rootTypeByCount(root.elements.length);
    ctx.markDirty(player);
    ctx.emit({ kind: 'rootChange', id: player.id, name: player.name, root, source });
    ctx.log({
      kind: 'wash',
      id: player.id,
      text: `${player.name} tẩy tủy · bỏ hệ ${config.elements[removed].name} · thành ${rootName(player)}`,
    });
    return true;
  }

  function mutate(player, chance, source) {
    const { root } = player;
    if (NO_MUTATION.has(root.type)) return false;
    if (random() >= chance) {
      ctx.log({
        kind: 'mutate',
        id: player.id,
        text: `${player.name} thử biến dị linh căn · chưa thành`,
        group: (n) => `${n} lượt thử biến dị linh căn · chưa thành`,
        merge: 'window',
      });
      return false;
    }
    const direct = mutantElements.find((id) => config.elements[id].base === root.main);
    const main = direct ?? pick(mutantElements);
    player.root = { type: 'biendi', main, elements: [main] };
    ctx.markDirty(player);
    ctx.emit({ kind: 'rootChange', id: player.id, name: player.name, root: player.root, source });
    ctx.log({ kind: 'wash', id: player.id, text: `${player.name} biến dị thành ${config.elements[main].name} linh căn!` });
    return true;
  }

  return {
    name: 'roots',
    mult,
    rootName,
    baseOf,
    baseElements,
    mutantElements,
    canWash: (player) => WASHABLE.has(player.root.type),
    canMutate: (player) => !NO_MUTATION.has(player.root.type),
    wash,
    mutate,
  };
}
