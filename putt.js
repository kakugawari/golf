/* putt.js — パターゴルフの画面 (9 ホール)。決まりごとは putt-core.js (window.PUTT)
 * 背景は 2 枚の絵 (putt1.jpg / putt2.jpg)。絵の大きさと位置は、描く物と同じ数 (k・ox・oy) から px で決める
 * (落とし穴の表「寄ったカメラで、遠くの的が地面から浮いて空中に見えた」)。
 * 打ち方: 画面のどこからでも、指を うしろ (手前) へ引いて はなす。引いた向きと反対へ、引いた長さの強さで転がる */
(() => {
  const P = window.PUTT, $ = (id) => document.getElementById(id);
  const root = $('putt'), cv = $('pc'), ctx = cv.getContext('2d');
  const app = () => window.__app || {};
  const snd = {
    tap() { const a = app(); a.tone && a.tone(1400, 0.05, 'triangle', 0.25, 700); a.noise && a.noise(0.03, 3000, 0.35, 'highpass'); },
    cup() { const a = app(); if (!a.tone) return; a.tone(520, 0.07, 'sine', 0.45, 300); a.tone(260, 0.16, 'sine', 0.5, 140, 0.09); },
    tick() { const a = app(); a.tone && a.tone(900, 0.03, 'square', 0.04); },
  };
  const SAVEK = 'uchippanashi-putt';
  let save = { best: null, last: null };
  try { save = Object.assign(save, JSON.parse(localStorage.getItem(SAVEK) || 'null') || {}); } catch (e) {}
  const store = () => { try { localStorage.setItem(SAVEK, JSON.stringify(save)); } catch (e) {} };

  let W = 0, H = 0, DPR = 1;
  const AIMHINT = 'どこからでも うしろへ ひっぱって ねらう';
  const S = { on: false, hole: 0, strokes: 0, cards: [], state: 'aim', ball: null, v: { x: 0, z: 0 }, prev: null, lipped: false, sunk: false, drag: null, sinkT: 0, msg: '', msgT: 0, t: 0, parts: [] };
  const hole = () => P.HOLES[S.hole], pic = () => P.PICS[hole().pic];
  function fit() { const k = Math.max(W / pic().w, H / pic().h); return { k, ox: (W - pic().w * k) / 2, oy: (H - pic().h * k) / 2 }; }
  // 寄らない (絵が画面ぴったり) ときの画面の位置
  function base(x, z) { const p = P.toPic(pic(), x, z), f = fit(); return { x: f.ox + p.X * f.k, y: f.oy + p.Y * f.k, s: p.s * f.k }; }
  /* カメラ: 玉がカップに近づくほど、カップを中心に絵ごと寄る (「ピンに近づいたら背景も近くに」と言われた)。
     寄りの倍率 CAM.z は、玉が画面の下 (高さの 74%) に来るように決める。寄るにつれてカップも画面のまん中 (50%) へ下ろす (歩いて近づいた見え方)。
     寄る中心 (横はカップ・縦は camFy) は画面の中なので、絵が画面からはみ出してすき間が出ることはない */
  const CAM = { z: 1 }, CAMMAX = 3, BALLY = 0.74, CUPY = 0.5;
  function camFy(Z) { const c0 = cupBase(), u = (Z - 1) / (CAMMAX - 1), cupT = c0.y + Math.max(0, H * CUPY - c0.y) * u; return Z > 1.0001 ? (c0.y * Z - cupT) / (Z - 1) : c0.y; }
  function cupBase() { const c = P.cupOf(pic()); return base(c.x, c.z); }
  function camTarget() {
    const c0 = cupBase(), b0 = base(S.ball.x, S.ball.z), dy = b0.y - c0.y, dx = b0.x - c0.x;
    // 玉の y = カップの行き先 + dy*Z が 74% に来る Z を、少しずつ近づけて求める (カップの行き先も Z で変わるので)
    let z = 1; for (let i = 0; i < 30; i++) { const u = (z - 1) / (CAMMAX - 1), cupT = c0.y + Math.max(0, H * CUPY - c0.y) * u; z = dy > 1 ? (H * BALLY - cupT) / dy : CAMMAX; z = Math.max(1, Math.min(CAMMAX, z)); }
    if (dx > 1) z = Math.min(z, (W - 34 - c0.x) / dx); else if (dx < -1) z = Math.min(z, (c0.x - 34) / -dx);   // 玉が横の画面の外へ出ないように
    return Math.max(1, Math.min(CAMMAX, z));
  }
  function scr(x, z) { const c0 = cupBase(), p = base(x, z), Z = CAM.z, fy = camFy(Z); return { x: c0.x + (p.x - c0.x) * Z, y: fy + (p.y - fy) * Z, s: p.s * Z }; }
  function ground(sx, sy) {
    const c0 = cupBase(), Z = CAM.z, fy = camFy(Z), f = fit(), pc = pic(), bx = c0.x + (sx - c0.x) / Z, by = fy + (sy - fy) / Z;
    let Y = (by - f.oy) / f.k; Y = Math.max(pc.vy + 8, Y); return P.toWorld(pc, (bx - f.ox) / f.k, Y);
  }
  let camLast = '';
  function placeCam() { const c0 = cupBase(), Z = CAM.z, fy = camFy(Z), v = `matrix(${Z.toFixed(4)},0,0,${Z.toFixed(4)},${(c0.x * (1 - Z)).toFixed(1)},${(fy * (1 - Z)).toFixed(1)})`; if (v !== camLast) { camLast = v; $('pbg').style.transform = v; } }
  function resize() { const w = root.clientWidth, h = root.clientHeight; if (!(w >= 1 && h >= 1)) return; W = w; H = h; DPR = Math.min(2, devicePixelRatio || 1); cv.width = W * DPR; cv.height = H * DPR; placeBg(); }
  function placeBg() { if (!(W >= 1)) return; const f = fit(), pc = pic(), bg = $('pbg').style; bg.backgroundImage = `url(${pc.src})`; bg.backgroundSize = `${pc.w * f.k}px ${pc.h * f.k}px`; bg.backgroundPosition = `${f.ox}px ${f.oy}px`; camLast = ''; placeCam(); }
  addEventListener('resize', resize);

  // ---------- 流れ ----------
  function start() {
    const running = S.on; S.on = true; S.hole = 0; S.cards = []; root.hidden = false; $('pover').hidden = true; $('title').hidden = true; resize(); setHole(0);
    if (!running) { T0 = performance.now(); requestAnimationFrame(loop); }   // もう一回 のときに、くり返しを二重に走らせない
  }
  function setHole(i) {
    S.hole = i; S.strokes = 0; S.state = 'aim'; S.ball = P.startOf(hole()); S.prev = { ...S.ball }; S.v = { x: 0, z: 0 };
    S.lipped = false; S.sunk = false; S.parts = []; S.drag = null; CAM.z = 1; S.aim = cupAngle(); placeBg(); hideCard(); hud(); hint(AIMHINT); hudBtn();
  }
  function quit() { S.on = false; root.hidden = true; $('pover').hidden = true; $('title').hidden = false; }
  function shoot(angle, power) {
    S.prev = { ...S.ball }; S.strokes++; const sp = P.speedOf(power);
    S.v = { x: Math.sin(angle) * sp, z: Math.cos(angle) * sp }; S.lipped = false; S.state = 'roll'; S.drag = null; snd.tap(); hud(); hint(''); hudBtn();
  }
  function holeEnd(holed) {
    const h = hole(), n = holed ? S.strokes : P.MAXSTROKE, name = P.nameOf(n, h.par, holed);
    S.cards.push({ n, par: h.par }); S.state = 'card'; hud(); hudBtn();
    const d = n - h.par, cls = !holed ? 'miss' : d <= -1 || n === 1 ? 'gold' : d === 0 ? 'green' : '';
    showCard(name, cls, n, `パー ${h.par} ・ ${d === 0 ? 'パーどおり' : d > 0 ? `+${d}` : d}`);
    const a = app();
    if (holed && (n === 1 || d <= -1)) { a.sfx && a.sfx.cup(); burst(90); } else if (holed && d === 0) { a.sfx && a.sfx.green(); burst(40); }
    hint(S.hole < P.HOLES.length - 1 ? 'タップで つぎのホール' : 'タップで けっか');
  }
  function next() { if (S.hole < P.HOLES.length - 1) setHole(S.hole + 1); else finish(); }
  function parSum(k) { return P.HOLES.slice(0, k).reduce((s, h) => s + h.par, 0); }
  function finish() {
    S.state = 'over'; hideCard(); hint(''); hudBtn();
    const t = S.cards.reduce((s, c) => s + c.n, 0), par = parSum(S.cards.length), d = t - par, prev = save.last;
    const nb = save.best == null || t < save.best; if (nb) save.best = t; save.last = t; store();
    const rank = d <= -4 ? 'S' : d <= -1 ? 'A' : d <= 2 ? 'B' : d <= 6 ? 'C' : 'D';
    $('pres').textContent = t; $('ppar').textContent = `パー ${par} ・ ${d === 0 ? 'イーブン' : d > 0 ? `+${d}` : d}`;
    const st = $('prank'); st.className = 'stamp on r' + rank; st.textContent = rank + ' ランク';
    $('pcards').innerHTML = S.cards.map((c, i) => `<div class="${c.n < c.par ? 'u' : c.n > c.par ? 'o' : ''}"><small>${i + 1}</small>${c.n}</div>`).join('');
    $('pbest').textContent = (nb ? 'じこベスト更新!' : `ベスト ${save.best}打`) + (prev == null ? '' : t < prev ? ` ・ 前回より ${prev - t}打 少ない` : t > prev ? ` ・ 前回より ${t - prev}打 多い` : ' ・ 前回と同じ');
    $('pover').hidden = false; if (nb) burst(120);
  }

  // ---------- 表示 ----------
  function hud() {
    const h = hole(), done = S.cards.length, d = S.cards.reduce((s, c) => s + c.n, 0) - parSum(done);
    $('phl').innerHTML = `ホール<b>${S.hole + 1}</b>/9<i></i>パー<b>${h.par}</b>`;
    $('phs').textContent = `うった ${S.strokes} ・ ごうけい ${done ? (d === 0 ? '±0' : d > 0 ? '+' + d : d) : '―'}`;
    const s = h.slope, m = Math.hypot(s.x, s.z), sl = $('pslope'), ar = sl.querySelector('svg'), tx = sl.querySelector('span');
    if (m < 0.01) { tx.textContent = 'たいら'; ar.style.visibility = 'hidden'; return; }
    // 矢印は、玉のある所で かたむきが押す向きを、画面の上の向きにして回す
    const b = scr(S.ball.x, S.ball.z), e = scr(S.ball.x + s.x * 3, S.ball.z + s.z * 3), ang = Math.atan2(e.y - b.y, e.x - b.x) * 180 / Math.PI + 90;
    ar.style.visibility = 'visible'; ar.style.transform = `rotate(${ang}deg)`;
    tx.textContent = m > 0.19 ? 'つよい' : m > 0.13 ? 'ふつう' : 'よわい';
  }
  function hint(t) { $('phint').textContent = t; }
  // 右はしの棒のゲージ: いまの強さと、「平らならカップまで」の目安の線
  let gLast = '';
  function gaugeUI() {
    if (S.state !== 'aim' && S.state !== 'power') return;
    const c = P.cupOf(pic()), mark = powerFor(Math.hypot(c.x - S.ball.x, c.z - S.ball.z)), pw = S.state === 'power' ? S.pw : 0, key = pw.toFixed(3) + '|' + mark.toFixed(3);
    if (key === gLast) return; gLast = key;
    $('pgfill').style.clipPath = `inset(${((1 - pw) * 100).toFixed(1)}% 0 0 0 round 12px)`; $('pgfill').classList.toggle('hot', pw > 0.85);
    $('pgmark').style.bottom = (mark * 100).toFixed(1) + '%';
  }
  function showCard(title, cls, n, sub) { const c = $('ppop'); $('ppt').textContent = title; $('ppt').className = 'rib ' + cls; $('ppn').textContent = n; $('pps').textContent = sub; c.classList.remove('on'); void c.offsetWidth; c.classList.add('on'); }
  function hideCard() { $('ppop').classList.remove('on'); }
  function say(t) { S.msg = t; S.msgT = 1.4; }
  function burst(n) {
    const c = P.cupOf(pic()), p = scr(c.x, c.z), cols = ['#ff4d4d', '#ffd23f', '#3d8bff', '#ffffff', '#ff8a1f', '#7be36b', '#ff7ad9'];
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, r = 120 + Math.random() * 380; S.parts.push({ x: p.x, y: p.y - 60, vx: Math.cos(a) * r * 0.6, vy: -Math.abs(Math.sin(a)) * r - 80, c: cols[i % cols.length], life: 1.6 + Math.random(), rot: Math.random() * 6 }); }
  }

  // ---------- 入力: どこからでも うしろへ ひっぱって向きを決め、ゲージがいい所で はなす ----------
  // ひっぱっているあいだ、玉から向きの矢印と点線が出て、棒のゲージが 0→1→0 を行き来する。はなした瞬間の強さで打つ。
  // ほとんど引かずに はなすと、打たずに やめる。
  // (前は「なぞってねらう + うつボタン + タップで止める」で「あまり面白くない」と言われ、その前は「引いても何も出ない」と言われた)
  const AIMMAX = 1.0, PULLMIN = 24, PERIOD = 1.6;
  function cupAngle() { const c = P.cupOf(pic()); return Math.atan2(c.x - S.ball.x, c.z - S.ball.z); }
  function powerFor(dist) { return Math.max(0, Math.min(1, (Math.sqrt(2 * P.MU * dist) - P.VMIN) / (P.VMAX - P.VMIN))); }   // 平らなら dist だけ転がる強さ
  // 画面の上の向き (dx, dy) を、玉から見た地面の向き (ラジアン) にする
  function aimFromPull(dx, dy) {
    const L = Math.hypot(dx, dy), bp = scr(S.ball.x, S.ball.z), g = ground(bp.x + dx / L * 90, bp.y + dy / L * 90), ca = cupAngle();
    let a = Math.atan2(g.x - S.ball.x, g.z - S.ball.z); if (g.z <= S.ball.z) a = dx >= 0 ? ca + AIMMAX : ca - AIMMAX;
    let d = a - ca; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    return ca + Math.max(-AIMMAX, Math.min(AIMMAX, d));
  }
  function hudBtn() { $('pgauge').hidden = !(S.state === 'aim' || S.state === 'power'); }
  root.addEventListener('pointerdown', (e) => {
    if (!S.on || e.target.closest('button,#pover')) return;
    e.preventDefault();
    if (S.state === 'card') { next(); return; }
    if (S.state !== 'aim') return;
    S.drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
    try { root.setPointerCapture(e.pointerId); } catch (err) {}
  });
  root.addEventListener('pointermove', (e) => {
    const d = S.drag; if (!d || e.pointerId !== d.id) return;
    const dx = d.x - e.clientX, dy = d.y - e.clientY, L = Math.hypot(dx, dy);
    if (L < PULLMIN) { if (S.state === 'power') { S.state = 'aim'; hint('ひっぱるのを やめると うたない'); } return; }
    if (S.state === 'aim') { S.state = 'power'; S.pt = 0; S.pw = 0; snd.tick(); hint('ゲージが いいところで はなす!'); }
    const a = aimFromPull(dx, dy); if (Math.round(a * 60) !== Math.round(S.aim * 60)) snd.tick(); S.aim = a;
  });
  const endDrag = (e) => {
    if (!S.drag || e.pointerId !== S.drag.id) return; S.drag = null;
    if (S.state === 'power') { if (e.type === 'pointercancel') { S.state = 'aim'; hint(AIMHINT); } else shoot(S.aim, Math.max(0.02, S.pw)); }
    else if (S.state === 'aim') hint(AIMHINT);
  };
  root.addEventListener('pointerup', endDrag); root.addEventListener('pointercancel', endDrag);
  $('pquit').onclick = quit; $('bP').onclick = start; $('pagain').onclick = start; $('ptitle').onclick = quit;

  // ---------- 動き ----------
  function update(dt) {
    S.t += dt; if (S.msgT > 0) S.msgT -= dt;
    if (S.state === 'power') {
      // ゲージは 0 → 1 → 0 を 1.6 秒で行き来する (はなす瞬間をねらう)
      S.pt += dt; const ph = (S.pt / PERIOD) % 1; S.pw = ph < 0.5 ? ph * 2 : 2 - ph * 2;
    }
    gaugeUI();
    if ((S.state === 'aim' || S.state === 'power') && !S.drag) { const t = camTarget(); CAM.z += (t - CAM.z) * Math.min(1, dt * 2.2); if (Math.abs(t - CAM.z) < 0.002) CAM.z = t; }
    placeCam();
    for (const q of S.parts) { q.vy += 520 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; q.rot += dt * 8; }
    S.parts = S.parts.filter((q) => q.life > 0 && q.y < H + 40);
    if (S.state === 'roll') {
      const st = { ball: S.ball, v: S.v, lipped: S.lipped };
      for (let i = 0, n = Math.max(1, Math.round(dt * 120)); i < n; i++) {
        const r = P.step(st, hole(), 1 / 120);
        if (r === 'in') { S.state = 'sink'; S.sinkT = 0; S.sunk = true; snd.cup(); break; }
        if (r === 'out') { S.ball = { ...S.prev }; S.v = { x: 0, z: 0 }; S.strokes++; say('グリーンの そと! +1'); hud(); S.state = S.strokes >= P.MAXSTROKE ? 'end' : 'aim'; if (S.state === 'aim') { S.aim = cupAngle(); hudBtn(); } break; }
        if (r === 'stop') { S.state = S.strokes >= P.MAXSTROKE ? 'end' : 'aim'; if (S.state === 'aim') { S.aim = cupAngle(); hud(); hint(AIMHINT); hudBtn(); } break; }
      }
      S.lipped = st.lipped;
      if (S.state === 'end') holeEnd(false);
    } else if (S.state === 'sink') { S.sinkT += dt; if (S.sinkT > 0.35) holeEnd(true); }
  }

  // ---------- 描く ----------
  function slopeMarks(b, c) {
    const h = hole(), m = Math.hypot(h.slope.x, h.slope.z); if (m < 0.01) return;
    // かたむき: 玉とカップのあいだの芝に、流れる向きの山形を うすく並べる
    const ux = h.slope.x / m, uz = h.slope.z / m, ph = (S.t * 0.5) % 1;
    ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = 0; i <= 4; i++) for (let j = -1; j <= 1; j++) {
      const f = i / 4, x = b.x + (c.x - b.x) * f + j * 0.45 + ux * ph * 0.3, z = b.z + (c.z - b.z) * f + uz * ph * 0.3; if (z < 0.5) continue;
      const p = scr(x, z), q = scr(x + ux * 0.12, z + uz * 0.12), dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L * 0.6, ny = dx / L * 0.6;
      ctx.strokeStyle = `rgba(255,255,255,${0.32 * Math.sin(Math.PI * ph) + 0.08})`;
      const K = Math.min(L, 14), tx = p.x + dx / L * K, ty = p.y + dy / L * K;   // 手前ほど大きくなるので、山形の大きさに上限
      ctx.beginPath(); ctx.moveTo(p.x + nx * K, p.y + ny * K); ctx.lineTo(tx, ty); ctx.lineTo(p.x - nx * K, p.y - ny * K); ctx.stroke();
    }
  }
  function distTag(b, c, cp) {
    const tx = `${Math.hypot(c.x - b.x, c.z - b.z).toFixed(1)}m`;
    ctx.font = '800 15px "M PLUS Rounded 1c",sans-serif'; const w = ctx.measureText(tx).width + 16, x = cp.x + Math.max(16, cp.s * 0.15), y = cp.y - 11;   // カップの右 (上だと旗の棒、下だと近づいた玉に重なる)
    ctx.fillStyle = 'rgba(12,20,15,.72)'; ctx.beginPath(); ctx.roundRect(x, y, w, 22, 6); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.lineTo(x, y + 16); ctx.lineTo(x - 6, y + 11); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(tx, x + w / 2, y + 12);
  }
  function aimGuide(b, bp, c) {
    // ひっぱっているあいだ: ねらいの点線 (カップまでの距離ぶん)、平らなら止まる所に輪、玉から伸びる矢印 (長さ = いまの強さ)
    const sx = Math.sin(S.aim), sz = Math.cos(S.aim), D = Math.hypot(c.x - b.x, c.z - b.z) + 0.4, lim = c.z + 3;
    for (let d = 0.15; d < D; d += 0.16) {
      if (b.z + sz * d > lim) break; const p = scr(b.x + sx * d, b.z + sz * d), r = Math.max(1.5, 0.02 * p.s);
      ctx.fillStyle = `rgba(255,255,255,${0.8 - 0.5 * d / D})`; ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.45, 0, 0, 7); ctx.fill();
    }
    const hot = S.pw > 0.85, col = hot ? '#ff6a4d' : '#ffd23f', sp = P.speedOf(S.pw), L = sp * sp / (2 * P.MU);
    if (b.z + sz * L <= lim) { const e = scr(b.x + sx * L, b.z + sz * L), r = Math.max(5, 0.1 * e.s); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(e.x, e.y, r, r * 0.4, 0, 0, 7); ctx.stroke(); }
    // 矢印は画面の上で太く (指で隠れない玉の前へ)。長さ 30〜150pt
    const t = scr(b.x + sx * 0.5, b.z + sz * 0.5), ux = t.x - bp.x, uy = t.y - bp.y, ul = Math.hypot(ux, uy) || 1, nx = ux / ul, ny = uy / ul;
    const len = 30 + 120 * S.pw, r0 = Math.max(6, 0.03 * bp.s) + 4, x0 = bp.x + nx * r0, y0 = bp.y + ny * r0, x1 = x0 + nx * len, y1 = y0 + ny * len;
    ctx.save(); ctx.lineCap = 'round'; ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 6;
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 13; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x1 + nx * 18, y1 + ny * 18); ctx.lineTo(x1 - ny * 13, y1 + nx * 13); ctx.lineTo(x1 + ny * 13, y1 - nx * 13); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawBall(bp) {
    // カップに入ると小さくなって消える
    if (S.sunk && S.state !== 'sink') return;
    const sink = S.state === 'sink' ? Math.min(1, S.sinkT / 0.3) : 0, r = Math.max(3, 0.026 * bp.s) * (1 - 0.7 * sink);   // 絵のカップは本物より大きく描いてあるので、玉も少し大きめ (本物の 1.2 倍)
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(bp.x + r * 0.3, bp.y + r * 0.15, r * 1.1, r * 0.4, 0, 0, 7); ctx.fill();
    const g = ctx.createRadialGradient(bp.x - r * 0.35, bp.y - r * 1.25, r * 0.1, bp.x, bp.y - r * 0.8, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#cfd6d2'); ctx.fillStyle = g; ctx.globalAlpha = 1 - 0.6 * sink;
    ctx.beginPath(); ctx.arc(bp.x, bp.y - r * 0.8 + sink * r, r, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  }
  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
    const c = P.cupOf(pic()), cp = scr(c.x, c.z), b = S.ball, bp = scr(b.x, b.z);
    if (S.state === 'aim' || S.state === 'power' || S.state === 'roll') { slopeMarks(b, c); distTag(b, c, cp); }
    if (S.state === 'power') aimGuide(b, bp, c);
    drawBall(bp);
    for (const q of S.parts) { ctx.globalAlpha = Math.min(1, q.life / 0.5); ctx.fillStyle = q.c; ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillRect(-5, -2.5, 10, 5); ctx.restore(); }
    ctx.globalAlpha = 1;
    if (S.msgT > 0) {
      ctx.font = '800 26px "M PLUS Rounded 1c",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText(S.msg, W / 2, H * 0.42); ctx.fillStyle = '#fff'; ctx.fillText(S.msg, W / 2, H * 0.42);
    }
  }
  let T0 = performance.now();
  function loop(now) { if (!S.on) return; requestAnimationFrame(loop); const dt = Math.min(0.05, Math.max(0, (now - T0) / 1000)); T0 = now; if (document.hidden) return; update(dt); draw(); }

  // テストから中身をのぞく入口
  window.__putt = { S, CAM, camTarget, start, setHole, shoot, scr, ground, cupAngle, powerFor, aimFromPull, PERIOD, next, finish, get save() { return save; } };
})();
