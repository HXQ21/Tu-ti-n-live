// Xử lý ảnh gốc thành ảnh dùng cho giao diện (public/assets).
// Chạy lại được bất cứ lúc nào: node tools/prepare-assets.js "D:\ảnh game"
// Chỉ xử lý vài ảnh: node tools/prepare-assets.js "D:\ảnh game" title,bg_courtyard

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'assets');
const SOURCE_DIR = process.argv[2] ?? 'D:\\ảnh game';
const BADGE_BOX = [0.07, 0.09]; // Nhãn "AI" nằm trong ô này ở góc trái trên (tỉ lệ rộng, cao).
const PALETTE_SIZE = 6;

// Đổi nhóm màu xanh dương sang màu đúng của hệ, giữ nguyên hoa hồng và viền vàng.
const BLUE = [170, 285];

// crop: [x0, y0, x1, y1] theo tỉ lệ ảnh gốc. hollowAt: điểm (tỉ lệ) nằm trong lỗ trống của khung cần đục.
const IMAGES = [
  // Bộ ảnh cấp bậc mới đã tách nền sẵn (PNG trong suốt): chỉ cắt viền thừa, đặt nhân vật sát đáy khung vuông.
  ...['pham_nhan', 'luyen_khi', 'truc_co', 'kim_dan', 'nguyen_anh', 'hoa_than'].map((id) => ({
    file: `disciple_${id}`,
    mode: 'alpha',
    width: 360,
  })),
  ...[1, 2, 3, 4, 5].map((n) => ({ file: `lotus_${n}`, mode: 'green', width: 340 })),
  { file: 'boss_kim', mode: 'green', width: 860 },
  { file: 'boss_moc', mode: 'green', width: 860 },
  { file: 'boss_thuy', mode: 'green', width: 860 },
  { file: 'boss_tho', mode: 'green', width: 860 },
  { file: 'boss_hoa', mode: 'green', width: 860, hue: { from: BLUE, to: 10, sat: 1.15 } },
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ file: `artifact_${n}`, mode: 'green', width: 200 })),
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({ file: `beast_${n}`, mode: 'green', width: 220 })),
  { file: 'cauldron', mode: 'green', width: 520 },
  { file: 'chest_bronze', mode: 'green', width: 220 },
  { file: 'chest_silver', mode: 'green', width: 220 },
  { file: 'chest_gold', mode: 'green', width: 220 },
  { file: 'egg_common', mode: 'green', width: 200 },
  { file: 'egg_rare', mode: 'green', width: 200 },

  ...['kim', 'moc', 'thuy', 'hoa', 'tho', 'loi', 'bang', 'phong', 'thien'].map((id) => ({
    file: `aura_${id}`,
    mode: 'black',
    width: 240,
  })),
  { file: 'fx_breakthrough', mode: 'black', width: 1080 },
  { file: 'fx_heaven_root', mode: 'black', width: 1080 },
  { file: 'fx_spirit_stone', mode: 'black', width: 1080 },
  { file: 'throne_master', mode: 'black', width: 560 },
  { file: 'halo_large', mode: 'black', width: 480 },
  { file: 'particles', mode: 'black', width: 512 },
  { file: 'title', mode: 'black', width: 760, crop: [0.12, 0.3, 0.88, 0.7] },
  { file: 'fx_duel', mode: 'black', width: 600 },
  { file: 'fx_heaven_ladder', mode: 'black', width: 600 },
  { file: 'fx_tribulation', mode: 'black', width: 700 },
  { file: 'portal', mode: 'black', width: 560 },
  { file: 'trail_artifact', mode: 'black', width: 400 },
  ...[1, 2, 3, 4, 5].map((n) => ({ file: `wings_${n}`, mode: 'black', width: 360 })),

  { file: 'panel_tall', mode: 'frame', width: 640 },
  { file: 'panel_wide', mode: 'frame', width: 900 },
  { file: 'nametag', mode: 'frame', width: 420 },
  { file: 'log_panel', mode: 'frame', width: 1060 },
  { file: 'plaque', mode: 'frame', width: 900 },
  { file: 'badge', mode: 'frame', width: 160, hollow: true },
  { file: 'frame_elder', out: 'frame_big', mode: 'frame', width: 360, crop: [0.36, 0.15, 0.65, 0.85], hollowAt: [0.5, 0.36] },
  { file: 'frame_elder', out: 'frame_small', mode: 'frame', width: 200, crop: [0.015, 0.36, 0.14, 0.78], hollowAt: [0.5, 0.29] },

  { file: 'bg', mode: 'copy', width: 1080 },
  { file: 'bg_courtyard', mode: 'copy', width: 1080 },
];

// ---------- Màu ----------

function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let h = 0;
  if (delta > 0) {
    if (max === r) h = ((g - b) / delta + 6) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
  }
  return [h * 60, max === 0 ? 0 : delta / max, max];
}

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const table = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]];
  const [r, g, b] = table[Math.floor(h / 60) % 6];
  return [r + m, g + m, b + m];
}

function shiftHue(data, channels, { from, to, sat = 1 }) {
  for (let i = 0; i < data.length; i += channels) {
    const [h, s, v] = rgbToHsv(data[i], data[i + 1], data[i + 2]);
    if (s < 0.1 || h < from[0] || h > from[1]) continue;
    const [r, g, b] = hsvToRgb(to, Math.min(s * sat, 1), v);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

// ---------- Tách nền ----------

function borderSamples(data, width, height) {
  const samples = [];
  const ring = Math.max(2, Math.round(Math.min(width, height) * 0.02));
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const onRing = x < ring || y < ring || x >= width - ring || y >= height - ring;
      if (!onRing || (x < BADGE_BOX[0] * width && y < BADGE_BOX[1] * height)) continue;
      const i = (y * width + x) * 3;
      samples.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  return samples;
}

// Nền xanh không đều (có ảnh pha nâu, có ảnh gần đen) nên dùng nhiều màu đại diện.
function buildPalette(samples) {
  const sorted = [...samples].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  let centers = Array.from({ length: PALETTE_SIZE }, (_, k) => [
    ...sorted[Math.floor(((k + 0.5) / PALETTE_SIZE) * sorted.length)],
  ]);
  for (let round = 0; round < 8; round++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const [r, g, b] of samples) {
      let best = 0;
      let bestD = Infinity;
      centers.forEach((c, k) => {
        const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      });
      sums[best][0] += r;
      sums[best][1] += g;
      sums[best][2] += b;
      sums[best][3] += 1;
    }
    centers = sums.filter((s) => s[3] > 0).map((s) => [s[0] / s[3], s[1] / s[3], s[2] / s[3]]);
  }
  return centers;
}

function floodFromBorder(mask, width, height) {
  const visited = new Uint8Array(width * height);
  const stack = [];
  const seed = (x, y) => {
    const i = y * width + x;
    if (mask[i] && !visited[i]) {
      visited[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < width; x++) {
    seed(x, 0);
    seed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    seed(0, y);
    seed(width - 1, y);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % width;
    const y = (i - x) / width;
    if (x > 0) seed(x - 1, y);
    if (x < width - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y < height - 1) seed(x, y + 1);
  }
  return visited;
}

const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};

function keyGreen(rgb, width, height, { near = 16, far = 46, thinSmoke = true } = {}) {
  const palette = buildPalette(borderSamples(rgb, width, height));
  const count = width * height;
  const distance = new Float32Array(count);
  for (let p = 0; p < count; p++) {
    const i = p * 3;
    let best = Infinity;
    for (const [r, g, b] of palette) {
      const d = (rgb[i] - r) ** 2 + (rgb[i + 1] - g) ** 2 + (rgb[i + 2] - b) ** 2;
      if (d < best) best = d;
    }
    distance[p] = Math.sqrt(best);
  }

  const mask = new Uint8Array(count);
  for (let p = 0; p < count; p++) mask[p] = distance[p] < far ? 1 : 0;
  const connected = floodFromBorder(mask, width, height);

  // Chỉ nền xanh tươi mới được đục cả các lỗ kín (giữa cánh, giữa tay), nền tối dễ trùng màu nhân vật.
  const [avgR, avgG, avgB] = palette
    .reduce((sum, c) => [sum[0] + c[0], sum[1] + c[1], sum[2] + c[2]], [0, 0, 0])
    .map((v) => v / palette.length);
  const vivid = avgG - Math.max(avgR, avgB) > 30;

  const rgba = Buffer.alloc(count * 4);
  for (let p = 0; p < count; p++) {
    const i = p * 3;
    const o = p * 4;
    const d = distance[p];
    const isBackground = connected[p] || (vivid && d < near);
    let alpha = isBackground ? smoothstep(near, far, d) : 1;
    const [r, b] = [rgb[i], rgb[i + 2]];
    let g = rgb[i + 1];

    // Khói mỏng lẫn nền xanh: càng ám xanh càng trong suốt, rồi khử nốt phần xanh còn lại.
    const excess = g - Math.max(r, b);
    if (excess > 6) {
      if (thinSmoke) alpha *= 1 - smoothstep(10, 60, excess);
      g = Math.max(r, b) + 6;
    }
    rgba[o] = r;
    rgba[o + 1] = g;
    rgba[o + 2] = b;
    rgba[o + 3] = Math.round(alpha * 255);
  }
  return rgba;
}

function keyFrame(rgb, width, height, { hollow = false, hollowAt = null } = {}) {
  const count = width * height;
  const luma = new Float32Array(count);
  const mask = new Uint8Array(count);
  for (let p = 0; p < count; p++) {
    const i = p * 3;
    luma[p] = Math.max(rgb[i], rgb[i + 1], rgb[i + 2]);
    mask[p] = luma[p] < 70 ? 1 : 0;
  }
  const outside = floodFromBorder(mask, width, height);

  if (hollow || hollowAt) {
    const [fx, fy] = hollowAt ?? [0.5, 0.5];
    const start = Math.floor(height * fy) * width + Math.floor(width * fx);
    const stack = [start];
    outside[start] = 1;
    while (stack.length) {
      const q = stack.pop();
      const x = q % width;
      const y = (q - x) / width;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (mask[n] && !outside[n]) {
          outside[n] = 1;
          stack.push(n);
        }
      }
    }
  }

  const rgba = Buffer.alloc(count * 4);
  for (let p = 0; p < count; p++) {
    const i = p * 3;
    const o = p * 4;
    rgba[o] = rgb[i];
    rgba[o + 1] = rgb[i + 1];
    rgba[o + 2] = rgb[i + 2];
    rgba[o + 3] = outside[p] ? Math.round(smoothstep(12, 70, luma[p]) * 255) : 255;
  }
  return rgba;
}

function fillBox(data, width, height, channels, [x0, y0, x1, y1], color) {
  for (let y = Math.floor(y0 * height); y < Math.ceil(y1 * height); y++) {
    for (let x = Math.floor(x0 * width); x < Math.ceil(x1 * width); x++) {
      const i = (y * width + x) * channels;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
    }
  }
}

function medianBorderColor(rgb, width, height) {
  const samples = borderSamples(rgb, width, height);
  return [0, 1, 2].map((c) => samples.map((s) => s[c]).sort((a, b) => a - b)[samples.length >> 1]);
}

// ---------- Xử lý từng ảnh ----------

async function processImage(spec) {
  const input = path.join(SOURCE_DIR, `${spec.file}.png`);
  const output = path.join(OUT_DIR, `${spec.out ?? spec.file}.webp`);
  const meta = await sharp(input).metadata();
  const source = () => {
    const image = sharp(input);
    if (!spec.crop) return image;
    const [x0, y0, x1, y1] = spec.crop;
    return image.extract({
      left: Math.round(x0 * meta.width),
      top: Math.round(y0 * meta.height),
      width: Math.round((x1 - x0) * meta.width),
      height: Math.round((y1 - y0) * meta.height),
    });
  };
  const sourceWidth = spec.crop ? Math.round((spec.crop[2] - spec.crop[0]) * meta.width) : meta.width;

  if (spec.mode === 'alpha') {
    const trimmed = await sharp(input).ensureAlpha().trim({ threshold: 4 }).png().toBuffer();
    await sharp(trimmed)
      .resize({ width: spec.width, height: spec.width, fit: 'contain', position: 'south', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 86, alphaQuality: 92 })
      .toFile(output);
    return;
  }

  if (spec.mode === 'copy') {
    // Đã thống nhất giữ nguyên nhãn AI trên ảnh nền.
    await source().removeAlpha().resize({ width: spec.width }).webp({ quality: 88 }).toFile(output);
    return;
  }

  // Tách nền ở độ phân giải gấp đôi rồi thu nhỏ để viền mịn.
  const workWidth = Math.min(sourceWidth, spec.width * 2);
  const { data, info } = await sharp(await source().png().toBuffer())
    .removeAlpha()
    .resize({ width: workWidth })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  // Ảnh cắt từ giữa ảnh gốc không chứa nhãn AI ở góc.
  const badge = spec.crop ? [0, 0, 0, 0] : [0, 0, BADGE_BOX[0], BADGE_BOX[1]];

  if (spec.hue) shiftHue(data, 3, spec.hue);

  if (spec.mode === 'black') {
    // Dùng hòa trộn "screen" trên giao diện nên giữ nền đen, chỉ xóa nhãn.
    fillBox(data, width, height, 3, badge, [0, 0, 0]);
    await sharp(data, { raw: { width, height, channels: 3 } })
      .resize({ width: spec.width })
      .webp({ quality: 82 })
      .toFile(output);
    return;
  }

  const background = medianBorderColor(data, width, height);
  fillBox(data, width, height, 3, badge, background);
  for (const box of spec.erase ?? []) fillBox(data, width, height, 3, box, background);

  const rgba = spec.mode === 'green' ? keyGreen(data, width, height, spec.key) : keyFrame(data, width, height, spec);

  let image = sharp(rgba, { raw: { width, height, channels: 4 } });
  if (spec.mode === 'frame') {
    // Cắt phần trong suốt để khung ôm sát đúng kích thước panel.
    const trimmed = await image.trim({ threshold: 8 }).png().toBuffer();
    image = sharp(trimmed);
  }
  await image.resize({ width: spec.width }).webp({ quality: 84, alphaQuality: 90 }).toFile(output);
}

mkdirSync(OUT_DIR, { recursive: true });
const only = process.argv[3]?.split(',');
for (const spec of IMAGES) {
  if (only && !only.includes(spec.file) && !only.includes(spec.out)) continue;
  await processImage(spec);
  console.log('xong', spec.out ?? spec.file);
}
