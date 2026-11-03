// Hiệu ứng hình ảnh và âm thanh.
// Chỉ lắng nghe sự kiện từ index.html, không chứa logic game và không gửi gì về máy chủ.

(() => {
  const STAGE_W = 1080;
  const STAGE_H = 1920;
  const BOSS_CENTER = [540, 1330];
  const BOSS_SPREAD = [220, 200];
  // Hạt linh khí chỉ bay lên ở 3 ghế VIP lớn: Lão Tổ, Thái Thượng, Chưởng Môn.
  const VIP_SOURCES = { elder0: [136, 150, 70], elder1: [944, 150, 70], master: [540, 600, 110] };
  const VIP_RATE_MS = 140;
  const GAIN_LIFT = 46;
  const MAX_FLOATS = 26;
  const MAX_SPARKS = 320;
  const PETAL_COUNT = 26;
  const STONE_SPAWN_MS = 170;
  const SHAKE_GAP_MS = 180;
  const SOUND_HINT_DELAY_MS = 1200;
  const SPARK_COLORS = { gold: '#ffd97a', white: '#ffffff', blue: '#9fe0ff', red: '#ff7a5c', green: '#8dffb0' };

  const stage = document.getElementById('stage');
  const title = document.getElementById('title');
  const banner = document.getElementById('banner');

  document.head.append(Object.assign(document.createElement('style'), {
    textContent: `
      .fx-canvas { position: absolute; left: 0; top: 0; width: ${STAGE_W}px; height: ${STAGE_H}px; pointer-events: none; }
      .fx-full { position: absolute; left: 0; top: 0; width: ${STAGE_W}px; height: ${STAGE_H}px; object-fit: cover; mix-blend-mode: screen; pointer-events: none; opacity: 0; }
      #fx-rain { transition: opacity .8s; }
      #fx-rain.on { opacity: .36; }
      #fx-flash { position: absolute; inset: 0; background: #fff8df; opacity: 0; pointer-events: none; }
      #fx-vignette { position: absolute; inset: 0; opacity: 0; pointer-events: none; transition: opacity .5s; }
      #fx-vignette.frenzy { opacity: 1; box-shadow: inset 0 0 130px 24px rgba(220, 30, 20, .55); animation: fx-pulse 1.6s ease-in-out infinite; }
      #fx-vignette.pill { opacity: 1; box-shadow: inset 0 0 170px 50px rgba(70, 230, 140, .5); }
      @keyframes fx-pulse { 50% { opacity: .55; } }
      .fx-float { position: absolute; left: 0; top: 0; font-weight: 700; white-space: nowrap; pointer-events: none; text-shadow: 0 2px 3px rgba(4, 8, 22, .95), 0 0 3px rgba(4, 8, 22, .95); }
      .fx-float small { display: block; font-size: 60%; color: #f6f1e4; text-align: center; }
      .fx-float .counter { display: block; color: #ff4331; font-size: 82%; text-align: center; }
      #fx-sound-hint { position: absolute; right: 34px; top: 6px; display: none; padding: 3px 12px; border-radius: 12px; background: rgba(8, 14, 34, .88); color: #f2d27a; font-size: 14px; cursor: pointer; }
      #fx-sound-hint.show { display: block; }
      .fx-chest { position: absolute; width: 74px; pointer-events: none; filter: drop-shadow(0 0 10px rgba(255, 220, 120, .9)); }
    `,
  }));

  // ---------- Lớp hiển thị ----------

  function makeCanvas() {
    const canvas = document.createElement('canvas');
    canvas.className = 'fx-canvas';
    canvas.width = STAGE_W;
    canvas.height = STAGE_H;
    return canvas;
  }

  function makeFull(file) {
    const img = document.createElement('img');
    img.className = 'fx-full';
    img.alt = '';
    img.src = `assets/${file}.webp`;
    return img;
  }

  // Thứ tự trong DOM là thứ tự vẽ: lớp sau cùng đè lên trên, nhưng thông báo lớn luôn nằm trên hiệu ứng.
  const petals = makeCanvas();
  const vipCanvas = makeCanvas();
  const rainImage = makeFull('fx_spirit_stone');
  rainImage.id = 'fx-rain';
  stage.insertBefore(rainImage, title);
  stage.insertBefore(petals, title);
  stage.insertBefore(vipCanvas, title);

  const frontLayer = document.createElement('div');
  const vignette = Object.assign(document.createElement('div'), { id: 'fx-vignette' });
  const flash = Object.assign(document.createElement('div'), { id: 'fx-flash' });
  const sparksCanvas = makeCanvas();
  const floats = document.createElement('div');
  stage.insertBefore(frontLayer, banner);
  stage.insertBefore(vignette, banner);
  stage.insertBefore(sparksCanvas, banner);
  stage.insertBefore(floats, banner);
  stage.insertBefore(flash, banner);

  const fullImages = { breakthrough: makeFull('fx_breakthrough'), heaven: makeFull('fx_heaven_root') };

  function playFull(name, ms) {
    const img = fullImages[name];
    frontLayer.append(img);
    img.getAnimations().forEach((animation) => animation.cancel());
    img.animate(
      [{ opacity: 0 }, { opacity: 0.92, offset: 0.14 }, { opacity: 0.92, offset: 0.72 }, { opacity: 0 }],
      { duration: ms, easing: 'ease-out' },
    );
  }

  function flashScreen(strength = 0.85, ms = 700) {
    flash.animate([{ opacity: strength }, { opacity: 0 }], { duration: ms, easing: 'ease-out' });
  }

  function floatText({ text, sub, counter, x, y, size = 30, color = '#ffe08a', rise = 130, ms = 1300 }) {
    while (floats.childElementCount >= MAX_FLOATS) floats.firstElementChild.remove();
    const node = document.createElement('div');
    node.className = 'fx-float';
    node.style.color = color;
    node.style.fontSize = `${size}px`;
    if (counter) {
      const tag = document.createElement('span');
      tag.className = 'counter';
      tag.textContent = counter;
      node.append(tag);
    }
    node.append(text);
    if (sub) {
      const small = document.createElement('small');
      small.textContent = sub;
      node.append(small);
    }
    floats.append(node);
    const start = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    node.animate(
      [
        { transform: `${start} scale(.65)`, opacity: 0 },
        { transform: `${start} scale(1.08)`, opacity: 1, offset: 0.14 },
        { transform: `translate(${x}px, ${y - rise}px) translate(-50%, -50%)`, opacity: 0 },
      ],
      { duration: ms, easing: 'ease-out' },
    ).onfinish = () => node.remove();
  }

  function avatarCenter(id) {
    const node = id && document.querySelector(`[data-player="${CSS.escape(id)}"]`);
    if (!node) return null;
    const box = stage.getBoundingClientRect();
    const rect = node.getBoundingClientRect();
    const scale = box.width / STAGE_W;
    return [(rect.left + rect.width / 2 - box.left) / scale, (rect.top + rect.height * 0.4 - box.top) / scale];
  }

  // ---------- Hạt: hoa đào, linh thạch, tia sáng ----------

  const petalsCtx = petals.getContext('2d');
  const vipCtx = vipCanvas.getContext('2d');
  let vipActive = { elder0: false, elder1: false, master: false };
  let vipMotes = [];
  let lastMoteAt = 0;
  const sparksCtx = sparksCanvas.getContext('2d');
  const between = (min, max) => min + Math.random() * (max - min);

  function newPetal(anywhere) {
    return {
      x: between(-40, STAGE_W + 40),
      y: anywhere ? between(0, STAGE_H) : -30,
      size: between(5, 11),
      speed: between(26, 62),
      drift: between(-14, 26),
      sway: between(10, 34),
      phase: between(0, Math.PI * 2),
      spin: between(-1.4, 1.4),
      angle: between(0, Math.PI * 2),
    };
  }

  const petalList = Array.from({ length: PETAL_COUNT }, () => newPetal(true));
  let stones = [];
  let sparks = [];
  let raining = false;
  let lastStoneAt = 0;

  function spawnStone() {
    stones.push({
      x: between(20, STAGE_W - 20),
      y: -40,
      size: between(13, 25),
      speed: between(280, 500),
      spin: between(-2.4, 2.4),
      angle: between(0, Math.PI * 2),
    });
  }

  function burst(x, y, color = 'gold', count = 40, power = 340) {
    const room = MAX_SPARKS - sparks.length;
    for (let i = 0; i < Math.min(count, room); i++) {
      const angle = between(0, Math.PI * 2);
      const speed = between(power * 0.25, power);
      sparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: between(0.5, 1.15),
        age: 0,
        size: between(2, 5),
        color: SPARK_COLORS[color] ?? color,
      });
    }
  }

  function drawPetal(ctx, petal, t) {
    ctx.save();
    ctx.translate(petal.x + Math.sin(t * 0.9 + petal.phase) * petal.sway, petal.y);
    ctx.rotate(petal.angle);
    ctx.scale(1, 0.55 + 0.45 * Math.sin(t * 1.7 + petal.phase));
    ctx.fillStyle = 'rgba(255, 186, 208, .82)';
    ctx.beginPath();
    ctx.moveTo(0, -petal.size);
    ctx.quadraticCurveTo(petal.size, 0, 0, petal.size);
    ctx.quadraticCurveTo(-petal.size, 0, 0, -petal.size);
    ctx.fill();
    ctx.restore();
  }

  function drawStone(ctx, stone) {
    ctx.save();
    ctx.translate(stone.x, stone.y);
    ctx.rotate(stone.angle);
    const { size } = stone;
    const gradient = ctx.createLinearGradient(-size, -size, size, size);
    gradient.addColorStop(0, '#e9fbff');
    gradient.addColorStop(0.5, '#6fd2ff');
    gradient.addColorStop(1, '#2a7fd6');
    ctx.fillStyle = gradient;
    ctx.shadowColor = '#8fe6ff';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.6, -size * 0.1);
    ctx.lineTo(0, size);
    ctx.lineTo(-size * 0.6, -size * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  let lastFrame = performance.now();
  function frame(now) {
    const dt = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    const t = now / 1000;

    petalsCtx.clearRect(0, 0, STAGE_W, STAGE_H);
    petalList.forEach((petal, index) => {
      petal.y += petal.speed * dt;
      petal.x += petal.drift * dt;
      petal.angle += petal.spin * dt;
      if (petal.y > STAGE_H + 30) petalList[index] = newPetal(false);
      drawPetal(petalsCtx, petal, t);
    });

    if (now - lastMoteAt > VIP_RATE_MS) {
      lastMoteAt = now;
      for (const [key, [x, y, spread]] of Object.entries(VIP_SOURCES)) {
        if (!vipActive[key]) continue;
        vipMotes.push({ x: x + between(-spread, spread), y: y + between(-10, 20), vy: between(28, 60), life: between(1.6, 2.8), age: 0, size: between(1.5, 3.2) });
      }
    }
    drawOrbits(t);
    vipCtx.clearRect(0, 0, STAGE_W, STAGE_H);
    vipCtx.globalCompositeOperation = 'lighter';
    vipMotes = vipMotes.filter((mote) => {
      mote.age += dt;
      if (mote.age >= mote.life) return false;
      mote.y -= mote.vy * dt;
      mote.x += Math.sin(t * 2 + mote.y * 0.05) * 6 * dt;
      vipCtx.globalAlpha = Math.sin((mote.age / mote.life) * Math.PI) * 0.9;
      vipCtx.fillStyle = '#ffe9a8';
      vipCtx.beginPath();
      vipCtx.arc(mote.x, mote.y, mote.size, 0, Math.PI * 2);
      vipCtx.fill();
      return true;
    });
    vipCtx.globalAlpha = 1;
    vipCtx.globalCompositeOperation = 'source-over';

    if (raining && now - lastStoneAt > STONE_SPAWN_MS) {
      lastStoneAt = now;
      spawnStone();
    }
    if (stones.length || sparks.length || sparksCanvas.dataset.dirty) {
      sparksCtx.clearRect(0, 0, STAGE_W, STAGE_H);
      stones = stones.filter((stone) => {
        stone.y += stone.speed * dt;
        stone.angle += stone.spin * dt;
        if (stone.y > STAGE_H + 40) return false;
        drawStone(sparksCtx, stone);
        return true;
      });
      sparksCtx.globalCompositeOperation = 'lighter';
      sparks = sparks.filter((spark) => {
        spark.age += dt;
        if (spark.age >= spark.life) return false;
        spark.x += spark.vx * dt;
        spark.y += spark.vy * dt;
        spark.vy += 240 * dt;
        sparksCtx.globalAlpha = 1 - spark.age / spark.life;
        sparksCtx.fillStyle = spark.color;
        sparksCtx.beginPath();
        sparksCtx.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2);
        sparksCtx.fill();
        return true;
      });
      sparksCtx.globalAlpha = 1;
      sparksCtx.globalCompositeOperation = 'source-over';
      // Vẽ thêm một khung trống sau hạt cuối cùng để xóa sạch.
      if (stones.length || sparks.length) sparksCanvas.dataset.dirty = '1';
      else delete sparksCanvas.dataset.dirty;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- Âm thanh ----------

  function bellSound(ctx, out, volume) {
    const now = ctx.currentTime;
    const base = 660;
    const partials = [[1, 1, 2.2], [2.01, 0.55, 1.5], [2.76, 0.38, 1.1], [5.4, 0.16, 0.6]];
    const peak = volume / partials.reduce((sum, [, level]) => sum + level, 0);
    for (const [ratio, level, decay] of partials) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = base * ratio;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peak * level, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      osc.connect(gain).connect(out);
      osc.start(now);
      osc.stop(now + decay + 0.05);
    }
  }

  function noiseBuffer(ctx, seconds, brown) {
    const length = Math.floor(seconds * ctx.sampleRate);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      } else {
        data[i] = white;
      }
    }
    return buffer;
  }

  function thunderSound(ctx, out, volume) {
    const now = ctx.currentTime;

    // Tiếng nổ giòn ngắn ở đầu.
    const crack = ctx.createBufferSource();
    crack.buffer = noiseBuffer(ctx, 0.3, false);
    const crackFilter = ctx.createBiquadFilter();
    crackFilter.type = 'highpass';
    crackFilter.frequency.value = 900;
    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(volume * 0.3, now);
    crackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
    crack.connect(crackFilter).connect(crackGain).connect(out);
    crack.start(now);

    // Tiếng rền kéo dài.
    const rumble = ctx.createBufferSource();
    rumble.buffer = noiseBuffer(ctx, 3.4, true);
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(900, now);
    lowpass.frequency.exponentialRampToValueAtTime(110, now + 2.6);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume * 0.9, now + 0.08);
    gain.gain.setTargetAtTime(volume * 0.45, now + 0.5, 0.35);
    gain.gain.setTargetAtTime(0.0001, now + 1.5, 0.6);
    rumble.connect(lowpass).connect(gain).connect(out);
    rumble.start(now);
  }

  function drumSound(ctx, out, volume) {
    const start = ctx.currentTime;
    [0, 0.42, 0.84].forEach((offset, index) => {
      const now = start + offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.35);
      const peak = volume * (index === 2 ? 1 : 0.75);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      osc.connect(gain).connect(out);
      osc.start(now);
      osc.stop(now + 0.65);
      const hit = ctx.createBufferSource();
      hit.buffer = noiseBuffer(ctx, 0.12, false);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 600;
      const hitGain = ctx.createGain();
      hitGain.gain.setValueAtTime(peak * 0.35, now);
      hitGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
      hit.connect(filter).connect(hitGain).connect(out);
      hit.start(now);
    });
  }

  let audioConfig = { bell: true, thunder: true, drum: true, bgm: true, voice: true };
  let hasBgm = false;
  let audioCtx = null;
  let music = null;
  let lastBellAt = -Infinity;
  const played = { bell: 0, thunder: 0, drum: 0, voice: 0 };

  const hint = Object.assign(document.createElement('div'), { id: 'fx-sound-hint', textContent: 'Bấm vào đây để bật âm thanh' });
  stage.append(hint);

  function context() {
    audioCtx ??= new AudioContext();
    return audioCtx;
  }

  function updateHint() {
    const anyOn = audioConfig.bell || audioConfig.thunder || audioConfig.drum || audioConfig.voice || (audioConfig.bgm && hasBgm);
    const blocked = audioCtx?.state === 'suspended' || (music && audioConfig.bgm && music.paused);
    hint.classList.toggle('show', Boolean(anyOn && blocked));
  }

  function syncMusic() {
    if (!hasBgm) return;
    if (!music) {
      music = new Audio('sounds/bgm.mp3');
      music.loop = true;
      music.volume = config.audio.volumes.bgm;
    }
    if (audioConfig.bgm) music.play().catch(updateHint).then(updateHint);
    else music.pause();
  }

  // OBS cho phép tự phát âm thanh. Trình duyệt thường chặn đến khi có một lần bấm chuột.
  function unlockAudio() {
    context().resume().then(updateHint);
    syncMusic();
  }
  addEventListener('pointerdown', unlockAudio);

  // ---------- Giọng đọc (file mp3 trong sounds/voice) ----------
  // Phát lần lượt từng câu, không chồng lên nhau; hàng chờ đầy thì bỏ câu mới.
  const voiceQueue = [];
  let voicePlaying = false;

  function pickVoice(cue, vars = {}) {
    const list = config.audio.voice?.[cue];
    if (!Array.isArray(list) || list.length === 0) return null;
    const name = list[Math.floor(Math.random() * list.length)];
    return name.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
  }

  function nextVoice() {
    const name = voiceQueue.shift();
    if (!name) {
      voicePlaying = false;
      return;
    }
    voicePlaying = true;
    const clip = new Audio(`sounds/voice/${name}.mp3`);
    clip.volume = config.audio.volumes.voice ?? 1;
    clip.addEventListener('ended', nextVoice, { once: true });
    clip.addEventListener('error', nextVoice, { once: true });
    clip.play().then(() => (played.voice += 1)).catch(() => {
      updateHint();
      nextVoice();
    });
  }

  function say(cue, vars, force = false) {
    if (!force && !audioConfig.voice) return;
    const name = typeof cue === 'string' ? pickVoice(cue, vars) : cue?.[Math.floor(Math.random() * cue.length)];
    if (!name) return;
    if (voiceQueue.length >= (config.audio.voiceMaxQueue ?? 3)) return;
    voiceQueue.push(name);
    if (!voicePlaying) nextVoice();
  }

  function sayBreakthrough(realmIndex) {
    const realm = config.realms[realmIndex]?.name;
    const list = config.audio.voice?.breakthrough?.[realm];
    if (list?.length) say(list);
  }

  // Mốc còn 60 / 30 giây của trận boss: mỗi trận chỉ đọc một lần mỗi mốc.
  const bossMarks = { key: null, said: new Set() };
  function checkBossTime(state) {
    const boss = state.boss;
    if (boss?.phase !== 'fight') return;
    if (bossMarks.key !== boss.endsAt) {
      bossMarks.key = boss.endsAt;
      bossMarks.said = new Set();
    }
    const left = (boss.endsAt - state.now) / 1000;
    for (const [mark, cue] of [[60, 'boss60s'], [30, 'boss30s']]) {
      if (left <= mark && left > mark - 5 && !bossMarks.said.has(mark)) {
        bossMarks.said.add(mark);
        say(cue);
      } else if (left <= mark - 5) {
        bossMarks.said.add(mark);
      }
    }
  }

  let tideTimer = null;
  function scheduleTideEnd(until, now = Date.now()) {
    clearTimeout(tideTimer);
    tideTimer = setTimeout(() => say('tideEnd'), Math.max(0, until - now));
  }

  function play(kind, force = false) {
    if (kind === 'voice') {
      say('sessionStart', {}, force);
      return;
    }
    if (!force && !audioConfig[kind]) return;
    const ctx = context();
    if (ctx.state === 'suspended') ctx.resume().then(updateHint);
    const volume = config.audio.volumes[kind];
    if (kind === 'bell') bellSound(ctx, ctx.destination, volume);
    else if (kind === 'drum') drumSound(ctx, ctx.destination, volume);
    else thunderSound(ctx, ctx.destination, volume);
    played[kind] += 1;
  }

  function ringBell() {
    const now = performance.now();
    if (now - lastBellAt < config.audio.bellMinGapSec * 1000) return;
    lastBellAt = now;
    play('bell');
  }

  addEventListener('game-audio', ({ detail }) => {
    audioConfig = detail.audio;
    hasBgm = detail.hasBgm;
    context();
    syncMusic();
    setTimeout(updateHint, SOUND_HINT_DELAY_MS);
  });
  addEventListener('game-audio-test', ({ detail }) => play(detail, true));

  // ---------- Sự kiện game ----------

  let lastShakeAt = 0;
  const bossArt = document.querySelector('#boss .art');
  const fmt = (n) => Number(n).toLocaleString('vi-VN');

  function shakeBoss() {
    const now = performance.now();
    if (now - lastShakeAt < SHAKE_GAP_MS) return;
    lastShakeAt = now;
    bossArt.animate(
      [{ translate: '0 0' }, { translate: '-8px 3px' }, { translate: '7px -3px' }, { translate: '-4px 2px' }, { translate: '0 0' }],
      { duration: 240 },
    );
  }

  function showDamage({ amount, name, counter }) {
    const x = BOSS_CENTER[0] + between(-BOSS_SPREAD[0], BOSS_SPREAD[0]);
    const y = BOSS_CENTER[1] + between(-BOSS_SPREAD[1], BOSS_SPREAD[1]);
    const size = Math.min(26 + Math.log10(Math.max(amount, 1)) * 7, 58);
    floatText({
      text: `-${fmt(amount)}`,
      sub: clip(name),
      counter: counter ? 'KHẮC CHẾ!' : null,
      x,
      y,
      size,
      color: counter ? '#ff6a52' : '#ffe08a',
    });
    burst(x, y, counter ? 'red' : 'gold', 8, 180);
    shakeBoss();
  }

  function atPlayer(id, fn) {
    const center = avatarCenter(id);
    if (center) fn(center[0], center[1]);
  }

  function onNotification(event) {
    const ms = config.notifications.bigSec * 1000;
    switch (event.notification) {
      case 'breakthrough':
        sayBreakthrough(event.realmIndex);
        playFull('breakthrough', ms);
        flashScreen(0.45, 500);
        play('thunder');
        atPlayer(event.id, (x, y) => burst(x, y, 'gold', 60));
        break;
      case 'heavenRoot':
        say('heavenRoot');
        playFull('heaven', ms);
        flashScreen(0.7, 800);
        play('thunder');
        burst(STAGE_W / 2, 600, 'white', 120, 620);
        break;
      case 'bigGift':
        say('bigGift');
        burst(STAGE_W / 2, 600, 'gold', 90, 520);
        atPlayer(event.id, (x, y) => burst(x, y, 'gold', 40));
        break;
      case 'master':
      case 'elder':
        if (event.notification === 'master') say(event.steal ? 'masterSteal' : 'master');
        else if (event.seat === 0 || event.seat === 1) say(`elder${event.seat}`);
        flashScreen(0.35, 600);
        atPlayer(event.id, (x, y) => burst(x, y, 'gold', 70, 360));
        break;
      case 'tide':
        say('tideStart');
        flashScreen(0.3, 600);
        burst(STAGE_W / 2, 985, 'blue', 120, 520);
        break;
      default:
        break;
    }
  }

  // Chữ "+N" trên đầu avatar: cộng dồn các lần cộng trong 2 giây, chỉ hiện từ 10 trở lên.
  const gains = new Map();
  function addGain(id, amount) {
    let entry = gains.get(id);
    if (!entry) {
      entry = { amount: 0 };
      gains.set(id, entry);
      setTimeout(() => {
        gains.delete(id);
        if (entry.amount < config.display.gainMinShow) return;
        atPlayer(id, (x, y) => floatText({ text: `+${fmt(entry.amount)}`, x, y: y - GAIN_LIFT, size: 24, color: '#ffe9a0', rise: 70, ms: config.display.gainMergeSec * 1000 }));
      }, 300);
    }
    entry.amount += amount;
  }

  function showChest(id) {
    atPlayer(id, (x, y) => {
      const img = document.createElement('img');
      img.className = 'fx-chest';
      img.src = 'assets/chest_gold.webp';
      img.style.left = `${x + 30}px`;
      img.style.top = `${y - 60}px`;
      floats.append(img);
      img.animate([{ opacity: 0, scale: '.5' }, { opacity: 1, scale: '1.1', offset: 0.15 }, { opacity: 1, scale: '1', offset: 0.85 }, { opacity: 0 }], {
        duration: config.quests.chestShowSec * 1000,
      }).onfinish = () => img.remove();
      burst(x + 67, y - 25, 'gold', 30, 220);
    });
  }

  // ---------- Pháp bảo bay quanh Lão Tổ, Thái Thượng, Chưởng Môn ----------
  // Quỹ đạo elip; ra phía sau lưng thì mờ và nhỏ lại. Phẩm Tiên khí có thêm vệt sáng đuôi.
  const ORBITS = {
    elder0: { cx: 136, cy: 110, rx: 108, ry: 26, phase: 0 },
    elder1: { cx: 944, cy: 110, rx: 108, ry: 26, phase: Math.PI },
    master: { cx: 540, cy: 500, rx: 175, ry: 42, phase: Math.PI / 2 },
  };
  const ORBIT_SPEED = 0.9;
  const orbitBack = document.getElementById('orbit-back');
  const orbitFront = document.getElementById('orbit-front');
  const orbitNodes = {};
  let orbitTargets = {};

  function syncOrbits(state) {
    const players = { elder0: state.elders[0]?.player, elder1: state.elders[1]?.player, master: state.seats[0]?.player };
    for (const [key, player] of Object.entries(players)) {
      const art = player?.artifact;
      let node = orbitNodes[key];
      if (!art) {
        if (node) {
          node.img.remove();
          node.trail.remove();
          delete orbitNodes[key];
        }
        continue;
      }
      if (!node) {
        const img = document.createElement('img');
        img.className = 'orbit';
        img.alt = '';
        const trail = document.createElement('img');
        trail.className = 'orbit-trail';
        trail.src = 'assets/trail_artifact.webp';
        trail.alt = '';
        node = { img, trail, front: null };
        orbitNodes[key] = node;
      }
      const file = `assets/artifact_${art.index + 1}.webp`;
      if (node.img.getAttribute('src') !== file) node.img.src = file;
      node.trail.style.display = art.grade >= 3 ? 'block' : 'none';
      node.moving = key === 'master' || Boolean(player.present);
    }
    orbitTargets = players;
  }

  function drawOrbits(t) {
    for (const [key, node] of Object.entries(orbitNodes)) {
      const o = ORBITS[key];
      const angle = node.moving ? t * ORBIT_SPEED + o.phase : o.phase + 0.6;
      const x = o.cx + Math.cos(angle) * o.rx;
      const y = o.cy + Math.sin(angle) * o.ry;
      const front = Math.sin(angle) > 0;
      if (node.front !== front) {
        node.front = front;
        (front ? orbitFront : orbitBack).append(node.trail, node.img);
      }
      const depth = (Math.sin(angle) + 1) / 2;
      const scale = 0.62 + depth * 0.38;
      node.img.style.transform = `translate(${x - 33}px, ${y - 33}px) scale(${scale})`;
      node.img.style.opacity = String(0.45 + depth * 0.55);
      if (node.trail.style.display !== 'none') {
        const heading = Math.atan2(Math.cos(angle) * o.ry, -Math.sin(angle) * o.rx);
        node.trail.style.transform = `translate(${x - 80}px, ${y - 20}px) rotate(${heading + Math.PI}rad) scale(${scale})`;
        node.trail.style.transformOrigin = '80px 20px';
        node.trail.style.opacity = String(0.3 + depth * 0.5);
      }
    }
  }

  // ---------- Rơi đồ: rương bay tới avatar, trứng nở ----------
  function flyTo(id, file, { from = [540, 260], ms = 1100, stay = 600 } = {}) {
    atPlayer(id, (x, y) => {
      const img = document.createElement('img');
      img.className = 'fx-drop';
      img.src = `assets/${file}.webp`;
      floats.append(img);
      img.animate(
        [
          { transform: `translate(${from[0] - 40}px, ${from[1] - 40}px) scale(.6)`, opacity: 0 },
          { transform: `translate(${from[0] - 40}px, ${from[1] - 40}px) scale(1)`, opacity: 1, offset: 0.15 },
          { transform: `translate(${x - 40}px, ${y - 90}px) scale(.8)`, opacity: 1, offset: 0.8 },
          { transform: `translate(${x - 40}px, ${y - 90}px) scale(.8)`, opacity: 0 },
        ],
        { duration: ms + stay, easing: 'ease-in-out' },
      ).onfinish = () => {
        img.remove();
        burst(x, y - 50, 'gold', 30, 240);
      };
    });
  }

  function showEgg(id, file) {
    atPlayer(id, (x, y) => {
      const img = document.createElement('img');
      img.className = 'fx-drop';
      img.src = `assets/${file}.webp`;
      img.style.width = '60px';
      floats.append(img);
      const ms = (config.drops?.hatchSec ?? 3) * 1000;
      img.animate(
        [
          { transform: `translate(${x + 20}px, ${y - 70}px) rotate(0deg)`, opacity: 0 },
          { transform: `translate(${x + 20}px, ${y - 70}px) rotate(-8deg)`, opacity: 1, offset: 0.2 },
          { transform: `translate(${x + 20}px, ${y - 70}px) rotate(8deg)`, offset: 0.6 },
          { transform: `translate(${x + 20}px, ${y - 70}px) rotate(-12deg) scale(1.15)`, opacity: 1, offset: 0.95 },
          { transform: `translate(${x + 20}px, ${y - 70}px) scale(1.3)`, opacity: 0 },
        ],
        { duration: ms },
      ).onfinish = () => img.remove();
    });
  }

  function showHatch(id, image, tier) {
    atPlayer(id, (x, y) => {
      burst(x + 50, y - 40, tier === 'than' ? 'red' : 'gold', tier === 'than' ? 120 : 50, 340);
      const img = document.createElement('img');
      img.className = 'fx-drop';
      img.src = `assets/${image}.webp`;
      img.style.width = '96px';
      floats.append(img);
      img.animate(
        [
          { transform: `translate(${x}px, ${y - 90}px) scale(.3)`, opacity: 0 },
          { transform: `translate(${x}px, ${y - 100}px) scale(1.15)`, opacity: 1, offset: 0.25 },
          { transform: `translate(${x}px, ${y - 100}px) scale(1)`, opacity: 1, offset: 0.8 },
          { transform: `translate(${x}px, ${y - 120}px) scale(.9)`, opacity: 0 },
        ],
        { duration: 1800 },
      ).onfinish = () => img.remove();
    });
  }

  // Vòng tròn luyện hóa nhỏ cạnh avatar mỗi lần luyện pháp bảo.
  function showRefine(id) {
    atPlayer(id, (x, y) => {
      const ring = document.createElement('img');
      ring.className = 'fx-refine';
      ring.src = 'assets/halo_large.webp';
      ring.style.left = `${x + 18}px`;
      ring.style.top = `${y - 50}px`;
      floats.append(ring);
      ring.animate([{ opacity: 0, rotate: '0deg', scale: '.4' }, { opacity: 1, offset: 0.2 }, { opacity: 0, rotate: '300deg', scale: '1.2' }], {
        duration: 1400,
        easing: 'ease-out',
      }).onfinish = () => ring.remove();
    });
  }

  // Sét đánh xuống avatar đang độ kiếp.
  const TRIB_CENTER = [540, 1334];
  let tribTimer = null;
  function strike() {
    flashScreen(0.55, 260);
    burst(TRIB_CENTER[0] + between(-60, 60), TRIB_CENTER[1] - 40, '#c9a6ff', 40, 420);
  }
  function setTribulation(active) {
    if (Boolean(tribTimer) === active) return;
    if (active) {
      strike();
      tribTimer = setInterval(() => {
        if (Math.random() < 0.6) strike();
      }, 1700);
    } else {
      clearInterval(tribTimer);
      tribTimer = null;
    }
  }

  function onRootChange(event) {
    atPlayer(event.id, (x, y) => burst(x, y, 'green', 60, 300));
  }

  // Avatar của người mới chỉ xuất hiện sau lần vẽ kế tiếp nên chờ state rồi mới tạo hiệu ứng.
  const pendingJoins = new Set();

  addEventListener('game-event', ({ detail: event }) => {
    switch (event.kind) {
      case 'join':
        ringBell();
        pendingJoins.add(event.id);
        break;
      case 'return':
        pendingJoins.add(event.id);
        break;
      case 'notification':
        onNotification(event);
        break;
      case 'faction':
        if (event.compatible) {
          atPlayer(event.id, (x, y) => {
            floatText({ text: event.text, x, y: y - 20, size: 20, rise: 70, ms: 1800 });
            burst(x, y, 'gold', 24, 200);
          });
        }
        break;
      case 'gift':
        atPlayer(event.id, (x, y) => burst(x, y, 'gold', 16, 200));
        break;
      case 'sessionStart':
        say('sessionStart');
        break;
      case 'sessionEnd':
        say('sessionEnd');
        break;
      case 'tideStart':
      case 'tideExtend':
        scheduleTideEnd(event.until);
        break;
      case 'rainStart':
        say('rain');
        setRain(true);
        break;
      case 'rainEnd':
        setRain(false);
        break;
      case 'rainPick':
        atPlayer(event.id, (x, y) => burst(x, y, 'blue', 14, 180));
        break;
      case 'gain':
        addGain(event.id, event.amount);
        break;
      case 'chest':
        showChest(event.id);
        break;
      case 'rootChange':
        onRootChange(event);
        break;
      case 'refine':
        showRefine(event.id);
        break;
      case 'drop':
        if (event.chest) flyTo(event.id, `chest_${event.chest}`);
        else if (event.item?.startsWith('egg')) showEgg(event.id, event.item);
        break;
      case 'hatch':
        showHatch(event.id, event.image, event.tier);
        break;
      case 'beastLevel':
      case 'wings':
        atPlayer(event.id, (x, y) => burst(x, y, 'gold', 40, 260));
        break;
      case 'duelStart':
        flashScreen(0.45, 500);
        play('drum');
        break;
      case 'duelEnd':
        flashScreen(0.6, 700);
        play('thunder');
        break;
      case 'alchemyEnd':
        if (event.result === 'explode') {
          flashScreen(0.8, 700);
          play('thunder');
          burst(540, 1150, 'red', 200, 700);
        } else if (event.result === 'success') {
          burst(540, 1150, 'gold', 160, 560);
        }
        break;
      case 'secretOpen':
      case 'ladderStart':
      case 'alchemyStart':
        flashScreen(0.25, 400);
        break;
      case 'tribulationStart':
        play('thunder');
        break;
      case 'tribulationEnd':
        if (event.success) {
          flashScreen(0.9, 900);
          burst(TRIB_CENTER[0], TRIB_CENTER[1], 'gold', 200, 760);
        } else if (!event.aborted) {
          burst(TRIB_CENTER[0], TRIB_CENTER[1], '#555b70', 120, 420);
        }
        break;
      case 'tribulationHelp':
        burst(TRIB_CENTER[0], TRIB_CENTER[1] + 120, 'gold', 12, 200);
        break;
      case 'debateStart':
        flashScreen(0.2, 400);
        break;
      case 'breakthrough':
        if (!event.big) atPlayer(event.id, (x, y) => burst(x, y, 'gold', 40, 260));
        break;
      case 'lookupCard':
        break;
      case 'bossCountdown':
        say('bossCountdown', { element: event.element });
        flashScreen(0.25, 500);
        play('drum');
        break;
      case 'bossStart':
        say('bossStart');
        flashScreen(0.6, 600);
        play('thunder');
        burst(BOSS_CENTER[0], BOSS_CENTER[1], 'red', 120, 560);
        break;
      case 'damage':
        showDamage(event);
        break;
      case 'shieldUp':
        say('bossShield');
        flashScreen(0.3, 400);
        burst(BOSS_CENTER[0], BOSS_CENTER[1], 'blue', 90, 480);
        break;
      case 'shieldDown':
        if (event.reason === 'broken') {
          say('bossShieldBreak');
          flashScreen(0.4, 400);
          burst(BOSS_CENTER[0], BOSS_CENTER[1], 'blue', 150, 620);
        }
        break;
      case 'shieldProgress':
      case 'pillProgress':
        burst(BOSS_CENTER[0], BOSS_CENTER[1], event.kind === 'pillProgress' ? 'green' : 'blue', 14, 260);
        break;
      case 'frenzyStart':
        say('bossRage');
        flashScreen(0.35, 500);
        play('thunder');
        break;
      case 'pillActive':
        burst(BOSS_CENTER[0], BOSS_CENTER[1], 'green', 90, 500);
        break;
      case 'drain':
        floatText({ text: `Boss hút ${fmt(event.total)} tu vi`, sub: `${fmt(event.count)} đạo hữu im lặng`, x: BOSS_CENTER[0], y: BOSS_CENTER[1] + 240, size: 24, color: '#ff8b78', rise: 90, ms: 1900 });
        break;
      case 'bossEnd':
        if (event.result === 'fled') say('bossFled');
        if (event.result === 'killed') {
          say('bossKilled');
          flashScreen(0.95, 900);
          play('thunder');
          burst(BOSS_CENTER[0], BOSS_CENTER[1], 'gold', 200, 760);
        }
        break;
    }
  });

  function setRain(active) {
    if (raining === active) return;
    raining = active;
    rainImage.classList.toggle('on', active);
  }

  // Trạng thái lấy từ máy chủ: đúng cả khi tải lại trang giữa trận hoặc giữa đợt mưa.
  addEventListener('game-state', ({ detail: state }) => {
    setRain(state.rain.active);
    setTribulation(Boolean(state.tribulation));
    checkBossTime(state);
    syncOrbits(state);
    vipActive = {
      elder0: Boolean(state.elders[0]?.player?.present),
      elder1: Boolean(state.elders[1]?.player?.present),
      master: Boolean(state.seats[0]?.player),
    };
    const { boss } = state;
    const protectedNow = boss?.frenzy && state.now < boss.protectedUntil;
    vignette.classList.toggle('frenzy', Boolean(boss?.frenzy && !protectedNow));
    vignette.classList.toggle('pill', Boolean(protectedNow));
    for (const id of pendingJoins) {
      atPlayer(id, (x, y) => burst(x, y, 'gold', 30, 220));
    }
    pendingJoins.clear();
  });

  // Dùng để kiểm thử âm thanh.
  window.gameFx = { played, say, voiceQueue, bellSound, thunderSound, drumSound, music: () => music, audioState: () => audioCtx?.state };
})();
