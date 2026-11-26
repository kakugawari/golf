/*
 * ブラウザで実際に動かして確かめるテスト。
 *
 *   npm i -D playwright && npm run test:ui
 *
 * 画面まわりの不具合は node のテストでは捕まらない。ここでは本物の
 * ブラウザを立ち上げ、指の操作をそのまま再現して確かめる。
 *
 * ★ アプリを作ったら「ここにアプリごとの確認を足す」に書き足すこと。
 *   直した不具合には、かならず見張り役をここに置く。
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');

const PORT = Number(process.env.PORT || 8123);
const URL = `http://localhost:${PORT}/`;
const ROOT = __dirname;
const CHROMIUM = process.env.CHROMIUM_PATH;   // 手元の Chromium を使いたいとき

let passed = 0;
let failed = 0;

function ok(condition, message) {
  if (condition) {
    passed++;
    console.log('  \x1b[32m✓\x1b[0m ' + message);
  } else {
    failed++;
    console.log('  \x1b[31m✗ FAIL\x1b[0m ' + message);
  }
}

function skip(message) {
  console.log('  \x1b[90m- とばした: ' + message + '\x1b[0m');
}

function section(name) {
  console.log('\n' + name);
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      http.get(URL, (res) => { res.resume(); resolve(); })
        .on('error', () => {
          if (Date.now() - started > 10000) reject(new Error('サーバーが起動しない'));
          else setTimeout(tick, 100);
        });
    };
    tick();
  });
}

/**
 * 何かした直後に、その要素が本来の場所からどれだけずれるかを
 * 1 フレームずつ測る。「置いた瞬間に一瞬とぶ」たぐいの不具合はこれで見つかる。
 *
 * @returns {Promise<number>} 最大のずれ (px)
 */
function measureJump(page, selector, act) {
  return page.evaluate(async ({ sel, code }) => {
    const before = document.querySelector(sel).getBoundingClientRect();
    // eslint-disable-next-line no-new-func
    new Function(code)();
    let worst = 0;
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const el = document.querySelector(sel);
      if (!el) { worst = Infinity; break; }
      const now = el.getBoundingClientRect();
      worst = Math.max(worst, Math.abs(now.left - before.left), Math.abs(now.top - before.top));
    }
    return Math.round(worst);
  }, { sel: selector, code: act });
}

async function run() {
  let chromium;
  let devices;
  try {
    ({ chromium, devices } = require('playwright'));
  } catch (e) {
    console.error('playwright が必要です:  npm i -D playwright');
    process.exit(1);
  }

  const server = spawn(process.execPath, [path.join(ROOT, 'serve.js'), String(PORT)], {
    stdio: 'ignore'
  });
  await waitForServer();

  const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
  const errors = [];

  try {
    // ------------------------------------------------ スマホで開く
    section('スマホで開く');
    const context = await browser.newContext({ ...devices['iPhone 14 Pro Max'] || devices['iPhone 13'] });
    const phone = await context.newPage();
    phone.on('pageerror', (e) => errors.push('スマホ: ' + e.message));
    phone.on('console', (m) => { if (m.type() === 'error') errors.push('スマホ: ' + m.text()); });
    await phone.goto(URL, { waitUntil: 'load' });
    ok(true, 'ページが開く');

    const fit = await phone.evaluate(() => ({
      wide: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      title: document.title.trim(),
      painted: document.body.innerText.trim().length + document.querySelectorAll('canvas, svg, img').length
    }));
    ok(fit.wide <= 1, 'スマホ幅で横スクロールが出ない');
    ok(fit.title.length > 0, `ページの名前 (title) がある (${fit.title})`);
    ok(fit.painted > 0, '画面に何か出ている (真っ白ではない)');

    // ホーム画面から開いたとき、時計や電池の帯の下まで描く指定がそろっている
    // (無いと、画面のいちばん上が theme-color の板になる。帯そのものは実機でしか見られない)
    const bar = await phone.evaluate(() => {
      const meta = (n) => (document.querySelector(`meta[name="${n}"]`) || {}).content || '';
      return {
        capable: meta('apple-mobile-web-app-capable'),
        style: meta('apple-mobile-web-app-status-bar-style'),
        cover: /viewport-fit=cover/.test(meta('viewport')),
        theme: meta('theme-color')
      };
    });
    ok(bar.capable === 'yes' && bar.style === 'black-translucent' && bar.cover,
      `ホーム画面から開くと帯の下まで描く指定がある (${JSON.stringify(bar)})`);
    ok(/^#[0-9a-f]{6}$/i.test(bar.theme), `帯の色 (theme-color) が決めてある (${bar.theme})`);

    // ------------------------------------------------ ここにアプリごとの確認を足す
    section('打った音 (うちっぱなし)');
    {
      // 耳で聞けないので、OfflineAudioContext で描き出して大きさを測る。割れない (1 未満) で、低い「ドン」が入っている
      const pg = await browser.newPage();
      await pg.addInitScript(() => { window.AudioContext = function () { return new OfflineAudioContext(1, 44100, 44100); }; });
      await pg.goto(URL, { waitUntil: 'load' });
      const snd = await pg.evaluate(async () => { const A = window.__app, out = [];
        for (const [n, m] of [[true, false], [false, false], [false, true]]) { for (let k = 0; k < 3; k++) {
          A.resetAudio(); A.G.sound = true; A.sfx.hit(n, m); const d = (await A.audio.startRendering()).getChannelData(0);
          let pk = 0, lo = 0; for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
          for (let i = 10; i < 8820; i++) { let s = 0; for (let j = 0; j < 10; j++) s += d[i - j]; lo += (s / 10) ** 2; }
          out.push({ pk, lo: Math.sqrt(lo / 8810), m }); } }
        return out; });
      const pk = Math.max(...snd.map((x) => x.pk)), lo = Math.min(...snd.filter((x) => !x.m).map((x) => x.lo));
      ok(pk < 0.97, `打った音が割れない (いちばん大きい所 ${pk.toFixed(2)})`);
      ok(lo > 0.055, `打った音に低い「ドン」が入っている (低い音の量 ${lo.toFixed(3)}・前は 0.028〜0.039)`);
      await pg.close();
    }
    section('アプリの操作 (うちっぱなし)');
    {
      const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
      const pg = await ctx.newPage();
      pg.on('pageerror', (e) => errors.push('操作: ' + e.message));
      await pg.goto(URL, { waitUntil: 'load' });
      // 1 球打つ (ページの中で毎コマ見て、白い玉が▲に来た瞬間に押す)。hold はパワーをためる長さ
      await pg.evaluate(() => {
        window.__shoot = (hold, late) => new Promise((done) => {
          const G = window.__app.G, sw = document.getElementById('sw');
          const ev = (t, el) => el.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerId: 1 }));
          ev('pointerdown', sw);
          setTimeout(() => {
            ev('pointerup', window);
            const t0 = performance.now();
            const tick = () => {
              if (G.phase === 'ring' && G.ring - G.r0 <= (late ? -25 : 2)) ev('pointerdown', sw);
              if (G.phase === 'rest' && G.restT > 0.7) return done({ z: G.ball.z, x: G.ball.x, nice: G.nice, miss: G.shot.miss });
              if (performance.now() - t0 > 15000) return done(null);
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }, hold);
        });
      });

      // 画面いっぱいに描く。安全域 (上 59・下 34) を足しても、スイングのボタンが画面に収まる
      const fit = await pg.evaluate(() => {
        const r = (q) => document.querySelector(q).getBoundingClientRect();
        document.querySelector('.panel').style.paddingBottom = '46px';
        const sw = r('#sw'), hud = r('.hud');
        document.querySelector('.panel').style.paddingBottom = '';
        return { cv: Math.round(r('#c').height), H: window.__app.size.H, sw: Math.round(sw.bottom), h: innerHeight };
      });
      ok(fit.cv === 932 && fit.H === 932, `絵が画面いっぱい (canvas ${fit.cv} / H ${fit.H})`);
      ok(fit.sw <= fit.h - 34, `下の安全域を足しても、スイングのボタンが画面に収まる (ボタンの下 ${fit.sw})`);
      // 背景は練習場の写真。写真の遠近に合わせて、玉はマットの上・旗は芝の上・奥ほど小さく描く
      const pic = await pg.evaluate(async () => {
        const bg = getComputedStyle(document.getElementById('stage')).backgroundImage;
        const ok = await fetch('range.jpg').then((r) => r.ok).catch(() => false);
        const { pr, TG } = window.__app, H = innerHeight, b = pr(0, 0, 0);
        const flags = TG.map((t) => pr(t.x, 0, t.z));
        return { bg, ok, ball: b.y / H, flagsY: flags.map((f) => f.y / H), flagsX: flags.map((f) => f.x / innerWidth),
          farther: flags.slice(1).every((f, i) => f.s < flags[i].s) };
      });
      ok(/range\.jpg/.test(pic.bg) && pic.ok, '背景に練習場の写真を敷いている');
      // 打つ人は写真の切り抜き 8 ポーズ。どれも読み込めている
      const gim = await pg.evaluate(() => window.__app.GFR.map((f) => f.im.naturalWidth));
      ok(gim.length === 8 && gim.every((w) => w > 0), `打つ人の写真 8 ポーズが読み込めている (${gim.join(', ')}px)`);
      // 打つ人は小さめ (見本のように左下に小さく)。構えの背の高さを画面の点で測る
      const gh = await pg.evaluate(() => { const A = window.__app, b = A.pr(0, 0, 0), f = A.GFR[0]; return Math.round((f.fy - 40) * b.s * A.GSC); });
      ok(gh > 120 && gh < 220, `打つ人は小さめ (構えの背丈 ${gh}pt・画面の高さ 932)`);
      ok(pic.ball > 0.7 && pic.ball < 0.8, `玉はマットの上に描く (上から ${Math.round(pic.ball * 100)}%)`);
      ok(pic.flagsY.every((y) => y > 0.46 && y < 0.6) && pic.flagsX.every((x) => x > 0.08 && x < 0.92) && pic.farther,
        `旗はどれも芝の上 (上から ${pic.flagsY.map((y) => Math.round(y * 100)).join('/')}%)、遠いほど小さい`);

      // スイングの流れ: ためている間にポーズが進み (構え→トップ)、打つと振り抜いてフィニッシュで止まる
      await pg.locator('#bF').tap();
      const seq = await pg.evaluate(() => new Promise((done) => {
        const G = window.__app.G, sw = document.getElementById('sw'), seen = [];
        const ev = (t, el) => el.dispatchEvent(new PointerEvent(t, { bubbles: true }));
        const rec = () => { const i = window.__app.poseIdx(); if (seen[seen.length - 1] !== i) seen.push(i); };
        ev('pointerdown', sw);
        const t0 = performance.now();
        const tick = () => { rec();
          if (G.phase === 'power' && performance.now() - t0 > 1500) ev('pointerup', window);
          if (G.phase === 'ring' && G.ring - G.r0 <= 2) ev('pointerdown', sw);
          if (G.phase === 'rest') return done(seen);
          if (performance.now() - t0 > 12000) return done(seen);
          requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      }));
      const up = seq.indexOf(3), fin = seq.lastIndexOf(7);
      ok(seq[0] === 0 && up > 0 && seq.slice(0, up + 1).every((v, k, arr) => k === 0 || v >= arr[k - 1]) && fin > up && seq[seq.length - 1] === 7,
        `ためるとトップまで上がり、打つとフィニッシュで止まる (ポーズの順 ${seq.join('→')})`);
      // 次の球へ (タイトルへ戻して、次の確かめをいつもの入口から始める)
      await pg.waitForFunction(() => window.__app.G.restT > 0.7, null, { timeout: 5000 });
      await pg.evaluate(() => { document.getElementById('sw').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
      await pg.waitForFunction(() => window.__app.G.phase === 'ready', null, { timeout: 3000 });
      await pg.evaluate(() => { document.getElementById('title').hidden = false; });
      // じゆうれんしゅう: ためて、▲で押すと、まっすぐ遠くへ飛ぶ。わざと遅れて押すと曲がって短い
      await pg.locator('#bF').tap();
      const good = await pg.evaluate(() => window.__shoot(1400, false));
      ok(good && good.z > 60 && Math.abs(good.x) < good.z * 0.15, `うまく打つと遠くへまっすぐ飛ぶ (${good && Math.round(good.z)}y・横に ${good && Math.round(good.x)}y)`);
      await pg.evaluate(() => document.getElementById('sw').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
      await pg.waitForFunction(() => window.__app.G.phase === 'ready', null, { timeout: 3000 });
      const bad = await pg.evaluate(() => window.__shoot(1400, true));
      ok(bad && (bad.z < good.z || Math.abs(bad.x) > Math.abs(good.x) + 3), `遅れて押すと短いか曲がる (${bad && Math.round(bad.z)}y・横に ${bad && Math.round(bad.x)}y)`);

      await pg.evaluate(() => document.getElementById('sw').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
      await pg.waitForFunction(() => window.__app.G.phase === 'ready', null, { timeout: 3000 });
      // 写真の置き場所は、的を描く計算と同じ数で px で決める (CSS の cover まかせだと、実機で写真だけずれて的が浮いた)。
      // 入れ物の大きさが変わっても写真が動かないことを、画素で見る
      await pg.waitForFunction(() => Math.abs(window.__app.C.z - 1.06) < 0.001, null, { timeout: 5000 });   // カメラが打席に戻りきってから測る
      await pg.evaluate(() => { document.getElementById('c').style.visibility = 'hidden'; });
      const before = await pg.screenshot({ clip: { x: 100, y: 380, width: 230, height: 120 } });
      await pg.evaluate(() => { const b = document.getElementById('bg'); b.style.bottom = '-120px'; b.style.right = '-60px'; });
      const nudged = await pg.screenshot({ clip: { x: 100, y: 380, width: 230, height: 120 } });
      await pg.evaluate(() => { const b = document.getElementById('bg'); b.style.bottom = ''; b.style.right = ''; document.getElementById('c').style.visibility = ''; });
      const diff = await pg.evaluate(async ([a, b]) => { const L = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; });
        const [A, B] = await Promise.all([L(a), L(b)]); const c = document.createElement('canvas'); c.width = A.width; c.height = A.height; const x = c.getContext('2d');
        x.drawImage(A, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data; x.drawImage(B, 0, 0); const db = x.getImageData(0, 0, c.width, c.height).data;
        let s = 0; for (let i = 0; i < da.length; i += 4) s += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]); return s / (da.length / 4) / 3; },
        ['data:image/png;base64,' + before.toString('base64'), 'data:image/png;base64,' + nudged.toString('base64')]);
      ok(diff < 10, `写真は入れ物の大きさが変わってもずれない (画素の差 ${diff.toFixed(1)})`);

      // ゲージは右はしに小さく: 旗・ねらい線・クラブの札・ボタンに重ならない (前は画面のまん中に 230pt で、旗とねらい線を隠していた)
      await pg.waitForFunction(() => getComputedStyle(document.getElementById('dial')).opacity === '1', null, { timeout: 3000 });
      const lay = await pg.evaluate(() => { const A = window.__app, r = (q) => document.querySelector(q).getBoundingClientRect(), d = r('#dial');
        const inD = (p) => p && p.x > d.left && p.x < d.right && p.y > d.top && p.y < d.bottom;
        const flags = A.TG.filter((t) => inD(A.pr(t.x, 3.4, t.z)) || inD(A.pr(t.x, 0, t.z))).length;
        let aim = 0; for (let z = 4; z < 220; z += 3) if (inD(A.pr(A.G.aim * z, 0, z))) aim++;
        const hit = (q) => { const e = r(q); return !(e.right < d.left || e.left > d.right || e.bottom < d.top || e.top > d.bottom); };
        return { w: Math.round(d.width), flags, aim, clubs: hit('#clubs'), sw: hit('#sw'), right: Math.round(d.right), W: innerWidth, vis: getComputedStyle(document.getElementById('dial')).opacity }; });
      ok(lay.vis === '1' && lay.w <= 160 && lay.right <= lay.W, `ゲージは右はしに小さく出ている (幅 ${lay.w}pt・右はし ${lay.right}/${lay.W})`);
      ok(lay.flags === 0 && lay.aim === 0 && !lay.clubs && !lay.sw, `ゲージが旗・ねらい線・クラブの札・ボタンに重ならない (旗 ${lay.flags}・ねらい線 ${lay.aim})`);

      // カメラ: 構えでは屋根の影を出さない。打つと玉についていき (寄る)、玉はいつも画面の中。次の球で元に戻る
      await pg.waitForFunction(() => window.__app.C.z < 1.07, null, { timeout: 5000 });
      const cam = await pg.evaluate(() => new Promise((done) => {
        const A = window.__app, G = A.G, sw = document.getElementById('sw');
        const ev = (t, el) => el.dispatchEvent(new PointerEvent(t, { bubbles: true }));
        const top = () => { const m = A.camT(); return m.ty + A.roofY() * m.z; };   // 屋根の下はしが画面のどこに来るか (0 以下なら見えない)
        const r = { roof0: -1e9, roof: -1e9, zmax: 0, out: 0, n: 0 };
        let t0 = performance.now();
        ev('pointerdown', sw);
        const tick = () => { const now = performance.now();
          if (G.phase === 'power' && now - t0 > 1400) ev('pointerup', window);
          if (G.phase === 'ring' && G.ring - G.r0 <= 2) ev('pointerdown', sw);
          if (r.roof0 === -1e9) r.roof0 = top(); r.roof = Math.max(r.roof, top());
          if (G.phase === 'flight' || G.phase === 'roll') { r.n++; r.zmax = Math.max(r.zmax, A.C.z);
            const p = A.view(A.pr(G.ball.x, G.ball.y, G.ball.z)); if (p && (p.x < 0 || p.x > innerWidth || p.y < 0 || p.y > innerHeight)) r.out++; }
          if (G.phase === 'rest' && G.restT > 0.7) { ev('pointerdown', sw); r.back = performance.now(); }
          if (r.back && performance.now() - r.back > 1500) { r.zback = A.C.z; return done(r); }
          if (now - t0 > 15000) return done(r);
          requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      }));
      ok(cam.roof0 <= 0 && cam.roof <= 0.5, `画面のいちばん上に写真の屋根の影 (黒い帯) が出ない (構え ${cam.roof0.toFixed(1)}・いちばん下がった時 ${cam.roof.toFixed(1)})`);
      ok(cam.zmax > 1.6 && cam.out <= cam.n * 0.05, `打つとカメラが玉についていく (寄り ${cam.zmax.toFixed(2)} 倍・玉が画面の外 ${cam.out}/${cam.n} コマ)`);
      ok(cam.zback < 1.1, `次の球でカメラが打席に戻る (寄り ${cam.zback && cam.zback.toFixed(2)} 倍)`);
      await pg.waitForFunction(() => window.__app.G.phase === 'ready', null, { timeout: 3000 });

      // 打った手ごたえ: インパクトの形で一瞬止まり、玉の所に光、写真ごとゆれて寄る。そのあと元に戻る
      const fx = await pg.evaluate(() => new Promise((done) => {
        const G = window.__app.G, sw = document.getElementById('sw'), bg = document.getElementById('bg');
        const ev = (t, el) => el.dispatchEvent(new PointerEvent(t, { bubbles: true }));
        const r = { hold: 0, imp: false, moved: false };
        let tap = 0, t0 = performance.now();
        ev('pointerdown', sw);
        const tick = () => { const now = performance.now();
          if (G.phase === 'power' && now - t0 > 1400) ev('pointerup', window);
          if (G.phase === 'ring' && G.ring - G.r0 <= 2) { tap = now; ev('pointerdown', sw); }
          if (G.launched && r.lag === undefined) r.lag = Math.round(now - tap);
          if (G.launched && G.hs > 0 && window.__app.poseIdx() === 5) r.hold++;
          if (G.imp) r.imp = true;
          { const a = +(bg.style.transform.match(/matrix\(([\d.]+)/) || [0, 0])[1]; if (a / window.__app.C.z > 1.01) r.moved = true; }   // 写真がカメラより寄っている = 打った瞬間の寄り
          if (G.phase === 'rest') { r.after = { shake: G.shake, imp: G.imp, kick: G.kick }; return done(r); }
          if (now - t0 > 12000) return done(r);
          requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      }));
      ok(fx.hold >= 3, `当たった瞬間、インパクトの形で少し止まる (${fx.hold} コマ)`);
      ok(fx.imp && fx.moved, '当たった瞬間に玉の所が光り、写真ごとゆれて寄る');
      ok(fx.after && fx.after.shake === 0 && fx.after.imp === null && fx.after.kick === 0, '玉が止まるころには、ゆれも寄りも光も元に戻っている');

      // 爽快感の改修 (2026-11): 飛んでいる間の距離・ナイスの連続・画面を軽く・ねらいを指で・カップイン・小さい点数の札
      await pg.reload({ waitUntil: 'load' });
      await pg.locator('#bF').tap();
      // (8) 芝の上を左右になぞるとねらいが変わり、パワーはたまらない
      await pg.waitForTimeout(300);
      const aim0 = await pg.evaluate(() => window.__app.G.aim);
      await pg.mouse.move(215, 450); await pg.mouse.down();
      for (let i = 1; i <= 8; i++) { await pg.mouse.move(215 + i * 8, 450); await pg.waitForTimeout(16); }
      await pg.mouse.up();
      const dr = await pg.evaluate(() => ({ aim: window.__app.G.aim, ph: window.__app.G.phase }));
      ok(dr.aim > aim0 + 0.03 && dr.ph === 'ready', `芝の上を右へなぞると、ねらいが右へ動く (${aim0} → ${dr.aim.toFixed(3)}・${dr.ph})`);
      await pg.evaluate(() => { window.__app.G.aim = 0; window.__app.G.combo = 2; });
      // (1)(3)(6) 飛んでいる間: 距離が数えあがる・3 連続ナイスの札と虹色の跡・下の帯とボタンは引っこむ。止まったら「つぎへ」だけ
      const fl = await pg.evaluate(() => new Promise((done) => {
        const A = window.__app, G = A.G, sw = document.getElementById('sw'), ev = (t, el) => el.dispatchEvent(new PointerEvent(t, { bubbles: true }));
        const r = { n: [], away: false, combo: false, rainbow: false };
        ev('pointerdown', sw); setTimeout(() => ev('pointerup', window), 1400);
        const tick = () => {
          if (G.phase === 'ring' && G.ring - G.r0 <= 0.5) ev('pointerdown', sw);
          if (G.phase === 'flight') { r.n.push(+document.getElementById('lvn').textContent); if (document.getElementById('live').classList.contains('on')) r.live = true;
            if (document.getElementById('panel').classList.contains('away')) r.away = true; if (document.getElementById('combo').classList.contains('on')) r.combo = true;
            if (A.trailCol(5, 10).startsWith('hsla')) r.rainbow = true; }
          if (G.phase === 'rest' && G.restT > 0.5) { const p = document.getElementById('panel'); r.rest = { cls: p.className, clubs: getComputedStyle(document.getElementById('clubs')).opacity, sw: getComputedStyle(document.getElementById('sw')).opacity };
            r.liveOff = !document.getElementById('live').classList.contains('on'); r.nice = G.nice; r.pop = Math.round(document.getElementById('pop').getBoundingClientRect().height); return done(r); }
          requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      }));
      const rising = fl.n.every((v, i) => i === 0 || v >= fl.n[i - 1]);
      ok(fl.live && rising && fl.n[fl.n.length - 1] > 60 && fl.liveOff, `飛んでいる間、距離が数えあがり (${fl.n[0]}→${fl.n[fl.n.length - 1]}y)、止まると消える`);
      ok(!fl.nice || (fl.combo && fl.rainbow), `ナイスが 3 回続くと「れんぞく」の札と虹色の跡が出る (ナイス ${fl.nice}・札 ${fl.combo}・虹 ${fl.rainbow})`);
      ok(fl.away && fl.rest.clubs === '0' && fl.rest.sw === '1', `打っている間は下の帯とボタンが引っこみ、止まったら「つぎへ」だけ出る (止まったとき クラブ ${fl.rest.clubs}・ボタン ${fl.rest.sw})`);
      ok(fl.pop <= 150, `点数の札は小さく、玉の落ちた所にかからない (高さ ${fl.pop}pt)`);
      // (4) カップイン: 旗から 1y 以内で止まると特別の札・数・記録の旗
      await pg.evaluate(() => document.getElementById('sw').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
      await pg.waitForFunction(() => window.__app.G.phase === 'ready', null, { timeout: 3000 });
      const cup = await pg.evaluate(() => { const A = window.__app, G = A.G, t = A.TG[0];
        Object.assign(G, { mode: 'chal', target: t, left: 10, score: 0, list: [], recs: [], stat: { nice: 0, green: 0, pin: 0, cup: 0 }, nice: true, launched: true,
          shot: { carry: t.z, miss: false, ae: 0, e: 0 }, ball: { x: t.x + 0.4, y: 0, z: t.z + 0.3 } });
        A.rest(); return { title: document.getElementById('pt').textContent, cup: G.stat.cup, recs: G.recs.length, pt: G.list[0] }; });
      ok(cup.title === 'カップイン!!' && cup.cup === 1 && cup.recs === 1 && cup.pt === 100, `カップインで特別の札が出て、数えられ、記録の旗が立つ (${cup.title}・${cup.pt}てん・旗 ${cup.recs})`);

      // ねらいうち 10 球: 最後まで打つと結果が出て、ベストを覚え、開き直しても残る
      await pg.reload({ waitUntil: 'load' });
      await pg.evaluate(() => { window.__shoot = undefined; });
      await pg.evaluate(() => {
        window.__shoot = (hold) => new Promise((done) => {
          const G = window.__app.G, sw = document.getElementById('sw');
          const ev = (t, el) => el.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerId: 1 }));
          ev('pointerdown', sw);
          setTimeout(() => { ev('pointerup', window); const t0 = performance.now();
            const tick = () => { if (G.phase === 'ring' && G.ring - G.r0 <= 2) ev('pointerdown', sw);
              if (G.phase === 'rest' && G.restT > 0.7) return done(true); if (performance.now() - t0 > 15000) return done(false); requestAnimationFrame(tick); };
            requestAnimationFrame(tick); }, hold);
        });
      });
      await pg.locator('#bC').tap();
      // ねらう旗のグリーンだけはっきり、ほかの丸はうすく (1 コマぶん、輪を描くときの濃さを控える)
      const rings = await pg.evaluate(() => new Promise((done) => {
        const c = document.getElementById('c').getContext('2d'), A = window.__app, cols = A.TG.map((t) => t.c), seen = {}, st = c.stroke;
        c.stroke = function (...a) { const k = String(this.strokeStyle).toLowerCase(); const i = cols.findIndex((x) => x.toLowerCase() === k);
          if (i >= 0) seen[i] = Math.max(seen[i] || 0, this.globalAlpha); return st.apply(this, a); };
        requestAnimationFrame(() => requestAnimationFrame(() => { c.stroke = st; done({ seen, on: A.TG.indexOf(A.G.target), white: cols.findIndex((x) => x.toLowerCase() === '#ffffff') }); }));
      }));
      // 白い旗の輪は、ねらいの印 (白い輪) と色が同じで見分けられないので数えない
      const others = Object.entries(rings.seen).filter(([i]) => +i !== rings.on && rings.white !== +i).map(([, a]) => a);
      ok(rings.seen[rings.on] === 1 && others.length > 0 && others.every((a) => a <= 0.2),
        `ねらう旗の丸だけはっきり、ほかの丸はうすい (ねらう丸の濃さ ${rings.seen[rings.on]}・ほか ${others.map((a) => a.toFixed(2)).join('/')})`);
      let shots = 0;
      for (let i = 0; i < 10; i++) {
        const z = await pg.evaluate(() => window.__app.G.target.z);
        // 旗の距離に合わせて ためる長さを変える (おおざっぱで良い)
        if (await pg.evaluate((zz) => window.__shoot(400 + zz * 5), z)) shots++;
        await pg.evaluate(() => document.getElementById('sw').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
        await pg.waitForTimeout(150);
      }
      await pg.waitForFunction(() => !document.getElementById('over').hidden, null, { timeout: 5000 }).catch(() => {});
      await pg.waitForTimeout(4200);
      const res = await pg.evaluate(() => ({ over: !document.getElementById('over').hidden, score: window.__app.G.score, shown: document.getElementById('rs').textContent,
        n: document.querySelectorAll('#rl div').length, best: window.__app.save.best, rank: document.getElementById('rr').textContent, last: window.__app.save.last }));
      ok(shots === 10 && res.over && res.n === 10, `ねらいうち 10 球を打ち切ると結果が出る (${shots} 球・${res.n} 個の記録)`);
      ok(String(res.score) === res.shown && res.best === res.score && res.score > 0, `合計 ${res.score} てんが出て、ベストに残る`);
      ok(/^[SABCD] ランク$/.test(res.rank) && res.last === res.score, `ランクが出て (${res.rank})、次に比べるため今回の点を覚える (${res.last})`);
      await pg.reload({ waitUntil: 'load' });
      const kept = await pg.evaluate(() => document.getElementById('best').textContent);
      ok(kept.includes(String(res.score)), `開き直してもベストが残る (${kept})`);
      await ctx.close();
    }

    // ------------------------------------------------ 明るい画面・暗い画面
    section('パターゴルフ (9 ホール)');
    {
      const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
      const pg = await ctx.newPage();
      pg.on('pageerror', (e) => errors.push('パター: ' + e.message));
      await pg.goto(URL, { waitUntil: 'load' });
      await pg.locator('#bP').tap();
      await pg.waitForTimeout(300);
      const st0 = await pg.evaluate(() => { const r = document.getElementById('putt'); return { shown: !r.hidden, bg: getComputedStyle(document.getElementById('pbg')).backgroundImage, hud: document.getElementById('phl').textContent, title: document.getElementById('title').hidden }; });
      ok(st0.shown && /putt1\.jpg/.test(st0.bg) && /ホール1\/9/.test(st0.hud) && st0.title, `タイトルの「パターゴルフ」で 1 番ホールが開く (${st0.hud})`);
      // 絵の大きさと位置は、玉やカップを描く計算と同じ数で px で決める (カップの絵の所に、計算のカップが来る)
      // 絵のカップの画素が、カメラの寄り (#pbg の transform) をかけた先で、計算のカップと同じ所に来る。玉 (近い所) でも見る
      const alAt = () => pg.evaluate(() => { const P = window.PUTT, U = window.__putt, v = U.VW.to, base = P.PICS[0], pic = v ? base.near : base, r = document.getElementById(v ? 'pbg2' : 'pbg'), cs = getComputedStyle(r);
        const [w] = cs.backgroundSize.split(' ').map(parseFloat), [ox, oy] = cs.backgroundPosition.split(' ').map(parseFloat), k = w / pic.w, m = new DOMMatrix(cs.transform);
        const at = (X, Y) => m.transformPoint(new DOMPoint(ox + X * k, oy + Y * k)), c = P.cupOf(base), s = U.scr(c.x, c.z), q = at(pic.cup.X, pic.cup.Y);
        const bw = U.S.ball, bp = P.toPic(pic, bw.x, bw.z), sb = U.scr(bw.x, bw.z), qb = at(bp.X, bp.Y);
        return Math.max(Math.hypot(q.x - s.x, q.y - s.y), Math.hypot(qb.x - sb.x, qb.y - sb.y)) + (cs.opacity === '1' ? 0 : 99); });
      const al = await alAt();
      ok(al < 0.5, `絵のカップと、計算のカップの位置がそろう (ずれ ${al.toFixed(2)}pt)`);
      // ひっぱって向きを決め、はなした瞬間のゲージの強さで打つ (モンスト風)
      const bp = await pg.evaluate(() => { const U = window.__putt; return U.scr(U.S.ball.x, U.S.ball.z); });
      ok((await pg.evaluate(() => !document.getElementById('pgauge').hidden && !document.getElementById('pshot'))), '打つ前から ゲージが出ている (「うつ」のボタンは無い)');
      // 少しだけ引いて はなすと、打たない
      await pg.mouse.move(215, 500); await pg.mouse.down(); await pg.mouse.move(215, 510); await pg.mouse.up(); await pg.waitForTimeout(100);
      ok((await pg.evaluate(() => window.__putt.S.state + window.__putt.S.strokes)) === 'aim0', 'ほとんど引かずに はなすと 打たない');
      // 右下へ引くと、左前をねらう (ひっぱった向きの反対)
      await pg.mouse.move(215, 500); await pg.mouse.down();
      for (let i = 1; i <= 6; i++) { await pg.mouse.move(215 + i * 12, 500 + i * 20); await pg.waitForTimeout(16); }
      const pull = await pg.evaluate(() => ({ st: window.__putt.S.state, a: window.__putt.S.aim, ca: window.__putt.cupAngle() }));
      ok(pull.st === 'power' && pull.a < pull.ca - 0.1, `右下へ引くと 左前をねらう (カップの向き ${pull.ca.toFixed(2)} → ${pull.a.toFixed(2)})`);
      // まっすぐ下へ引き直すと、カップの向き
      for (let i = 1; i <= 6; i++) { await pg.mouse.move(215 + (6 - i) * 12, 620); await pg.waitForTimeout(16); }
      const pws = []; for (let i = 0; i < 6; i++) { await pg.waitForTimeout(90); pws.push(await pg.evaluate(() => window.__putt.S.pw)); }
      const a2 = await pg.evaluate(() => window.__putt.S.aim - window.__putt.cupAngle());
      const fillH = await pg.evaluate(() => { const e = document.getElementById('pgfill'), m = /inset\(([\d.]+)%/.exec(e.style.clipPath); return m ? e.getBoundingClientRect().height * (1 - m[1] / 100) : 0; });
      ok(Math.abs(a2) < 0.12 && Math.max(...pws) - Math.min(...pws) > 0.15 && fillH > 5, `まっすぐ下へ引くとカップの向き (ずれ ${a2.toFixed(3)})。引いているあいだゲージが動く (${pws.map((v) => v.toFixed(2)).join(' ')}・棒 ${fillH.toFixed(0)}pt)`);
      // 矢印が玉の前 (画面の上の方) に描かれている: 玉の少し上の画素が金色/赤
      const arrow = await pg.evaluate((bp) => { const c = document.getElementById('pc'), x = c.getContext('2d'), k = c.width / c.clientWidth; let n = 0;
        for (let y = bp.y - 60; y < bp.y - 15; y += 2) for (let dx = -6; dx <= 6; dx += 2) { const d = x.getImageData(Math.round((bp.x + dx) * k), Math.round(y * k), 1, 1).data; if (d[0] > 200 && d[1] > 80 && d[2] < 110) n++; } return n; }, bp);
      ok(arrow > 10, `ひっぱっているあいだ、玉から前へ矢印が出る (金色の画素 ${arrow})`);
      const want = await pg.evaluate(() => window.__putt.S.pw);
      const z0 = await pg.evaluate(() => window.__putt.S.ball.z);
      await pg.mouse.up();
      const shot = await pg.evaluate(() => ({ st: window.__putt.S.state, sp: Math.hypot(window.__putt.S.v.x, window.__putt.S.v.z) }));
      const exp = await pg.evaluate((w) => window.PUTT.speedOf(w), want);
      ok(shot.st === 'roll' && Math.abs(shot.sp - exp) < 0.35, `はなした瞬間の強さで打つ (速さ ${shot.sp.toFixed(2)}・はなす直前のゲージなら ${exp.toFixed(2)})`);
      await pg.waitForFunction(() => window.__putt.S.state !== 'roll' && window.__putt.S.strokes > 0, null, { timeout: 10000 });
      const st1 = await pg.evaluate(() => ({ z: window.__putt.S.ball.z, n: window.__putt.S.strokes, st: window.__putt.S.state }));
      ok(st1.n === 1 && st1.z > z0 + 0.05, `前へ転がって 1 打 (${z0.toFixed(2)} → ${st1.z.toFixed(2)}m・${st1.st})`);
      // 目安の線: 平らなホール 1 で、目安の強さで打つとカップの近くに止まる
      const mk = await pg.evaluate(() => { const U = window.__putt, P = window.PUTT; U.setHole(0); const c = P.cupOf(P.PICS[0]); const d = Math.hypot(c.x - U.S.ball.x, c.z - U.S.ball.z); const r = P.simulate(P.HOLES[0], U.S.ball, U.cupAngle(), U.powerFor(d)); return { r: r.r, e: Math.hypot(r.ball.x - c.x, r.ball.z - c.z) }; });
      ok(mk.r === 'in' || mk.e < 0.15, `ゲージの「カップ」の目安で打つと、平らならカップに届く (${mk.r}・ずれ ${mk.e.toFixed(2)}m)`);
      // カメラ: 玉がカップの近くに止まると、カップの近くから見た絵 (putt1n.jpg) へ歩いて近づく。近くの絵でも、絵と計算の位置がそろう
      const v0 = await pg.evaluate(() => window.__putt.VW.to);
      await pg.evaluate(() => { const U = window.__putt, P = window.PUTT; U.setHole(0); const sol = P.solve(P.HOLES[0], U.S.ball); U.shoot(sol.angle, sol.power * 0.85); });
      await pg.waitForFunction(() => window.__putt.S.state === 'aim', null, { timeout: 10000 });
      const mid = []; for (let i = 0; i < 16; i++) { await pg.waitForTimeout(50); mid.push(await pg.evaluate(() => ({ u: window.__putt.VW.u, a: +getComputedStyle(document.getElementById('pbg2')).opacity }))); }
      await pg.waitForFunction(() => window.__putt.VW.u >= 1, null, { timeout: 4000 });
      const cam = await pg.evaluate(() => { const U = window.__putt, c = window.PUTT.cupOf(window.PUTT.PICS[0]); return { v: U.VW.to, by: U.scr(U.S.ball.x, U.S.ball.z).y / innerHeight, d: Math.hypot(U.S.ball.x - c.x, U.S.ball.z - c.z), src: getComputedStyle(document.getElementById('pbg2')).backgroundImage, far: getComputedStyle(document.getElementById('pbg2')).opacity }; });
      const al2 = await alAt();
      ok(v0 === 0 && cam.v === 1 && /putt1n\.jpg/.test(cam.src) && cam.far === '1' && cam.by < 0.8 && al2 < 0.5 && mid.some((m) => m.u > 0 && m.u < 1 && m.a > 0.02 && m.a < 0.98),
        `カップの近く (残り ${cam.d.toFixed(2)}m) に止まると、近くから見た絵へ重ねながら切りかわる (途中の濃さ ${mid.map((m) => m.a.toFixed(2)).join(' ')}・玉は上から ${Math.round(cam.by * 100)}%・絵とのずれ ${al2.toFixed(2)}pt)`);
      // 近くの絵でも、ひっぱって打てる (向きと玉の位置は近くの絵の計算で)
      const nb = await pg.evaluate(() => { const U = window.__putt; return U.scr(U.S.ball.x, U.S.ball.z); });
      await pg.mouse.move(nb.x, nb.y - 100); await pg.mouse.down(); for (let i = 1; i <= 6; i++) { await pg.mouse.move(nb.x, nb.y - 100 + i * 14); await pg.waitForTimeout(16); }
      const na = await pg.evaluate(() => ({ st: window.__putt.S.state, d: window.__putt.S.aim - window.__putt.cupAngle() }));
      await pg.mouse.move(nb.x, nb.y - 100); await pg.mouse.up();
      ok(na.st === 'power' && Math.abs(na.d) < 0.25, `近くの絵でも、まっすぐ下へひっぱるとカップの向き (ずれ ${na.d.toFixed(3)})`);
      // ピンより奥に止まった玉も、手前のカップへ打ち返せる (前は手前向きのひっぱりが横へ逃がされていた)。
      // ピンより奥 (グリーンの奥のはしまで 約 1.9m) は、どこでも近くの絵で見る
      for (const [ox, oz] of [[0.15, 0.7], [-0.4, 1.5]]) {
        const back = await pg.evaluate(async ([ox, oz]) => { const U = window.__putt, P = window.PUTT, c = P.cupOf(P.PICS[0]); U.setHole(0); U.S.ball = { x: c.x + ox, z: c.z + oz }; U.S.prev = { ...U.S.ball }; U.S.aim = U.cupAngle();
          await new Promise((r) => { const t = () => (U.VW.u >= 1 && U.VW.to === 1 ? r() : requestAnimationFrame(t)); t(); }); return { bp: U.scr(U.S.ball.x, U.S.ball.z), ca: U.cupAngle() }; }, [ox, oz]);
        // 手前へ打ちたいので、画面の上 (奥) へ ひっぱる
        await pg.mouse.move(back.bp.x, back.bp.y + 60); await pg.mouse.down(); for (let i = 1; i <= 6; i++) { await pg.mouse.move(back.bp.x - ox * 10, back.bp.y + 60 - i * 12); await pg.waitForTimeout(16); }
        const ba = await pg.evaluate(() => ({ st: window.__putt.S.state, a: window.__putt.S.aim }));
        await pg.waitForFunction(() => window.__putt.S.pw > 0.25 && window.__putt.S.pw < 0.45, null, { timeout: 4000 });
        const z0 = await pg.evaluate(() => window.__putt.S.ball.z); await pg.mouse.up();
        await pg.waitForFunction(() => window.__putt.S.state !== 'roll' && window.__putt.S.state !== 'power', null, { timeout: 10000 });
        const bz = await pg.evaluate(() => window.__putt.S.ball.z);
        let dd = ba.a - back.ca; while (dd > Math.PI) dd -= 2 * Math.PI; while (dd < -Math.PI) dd += 2 * Math.PI;
        ok(ba.st === 'power' && Math.abs(dd) < 0.3 && bz < z0 - 0.2, `ピンより ${oz}m 奥の玉は、画面の上へひっぱると手前のカップへ打ち返せる (ねらいとカップの向きのずれ ${dd.toFixed(3)}・${z0.toFixed(2)} → ${bz.toFixed(2)}m)`);
      }
      // 遠くへ戻る: 近くの絵に収まらない所 (打ち始め) では遠くの絵
      await pg.evaluate(() => { const U = window.__putt; U.setHole(0); });
      ok(await pg.evaluate(() => window.__putt.VW.to === 0 && getComputedStyle(document.getElementById('pbg')).opacity === '1'), '次のホール (遠い所から) では遠くの絵に戻る')

      // グリーンの外へ出ると、打つ前の所に戻って 1 打ふえる
      await pg.evaluate(() => { const U = window.__putt; U.setHole(0); U.shoot(Math.PI / 2, 1); });
      await pg.waitForFunction(() => window.__putt.S.state !== 'roll', null, { timeout: 10000 });
      const ob = await pg.evaluate(() => { const U = window.__putt, s = window.PUTT.startOf(window.PUTT.HOLES[0]); return { n: U.S.strokes, d: Math.hypot(U.S.ball.x - s.x, U.S.ball.z - s.z) }; });
      ok(ob.n === 2 && ob.d < 0.001, `グリーンの外へ出ると、打った所に戻って +1 (${ob.n} 打)`);
      // 9 ホールを、どれも 1 打目で入れる (お手本の打ち方): 札 → タップで次 → 最後に結果とベスト
      const fin = await pg.evaluate(async () => { const U = window.__putt, P = window.PUTT, seen = [];
        const wait = (f) => new Promise((r) => { const t = () => (f() ? r() : requestAnimationFrame(t)); t(); });
        U.setHole(0); U.S.cards = [];
        for (let i = 0; i < 9; i++) { const sol = P.solve(P.HOLES[i], U.S.ball); U.shoot(sol.angle, sol.power); await wait(() => U.S.state === 'card');
          seen.push({ t: document.getElementById('ppt').textContent, bg: getComputedStyle(document.getElementById('pbg')).backgroundImage.includes(P.PICS[P.HOLES[i].pic].src) });
          document.getElementById('putt').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await wait(() => U.S.state === 'aim' || U.S.state === 'over'); }
        return { seen, over: !document.getElementById('pover').hidden, res: document.getElementById('pres').textContent, n: document.querySelectorAll('#pcards div').length, best: U.save.best, rank: document.getElementById('prank').textContent }; });
      ok(fin.seen.every((x) => x.t === 'ホールインワン!!' && x.bg), `9 ホールとも同じグリーンで、1 打で入るとホールインワンの札 (${fin.seen.filter((x) => x.t === 'ホールインワン!!').length}/9)`);
      ok(fin.over && fin.res === '9' && fin.n === 9 && fin.best === 9 && /^[SABCD] ランク$/.test(fin.rank), `9 ホールで結果が出て、ベストを覚える (${fin.res} 打・${fin.rank})`);
      await pg.locator('#ptitle').tap();
      ok(await pg.evaluate(() => document.getElementById('putt').hidden && !document.getElementById('title').hidden), '「タイトルへ」でタイトルに戻る');
      await ctx.close();
    }

    section('明るい画面と暗い画面');
    for (const scheme of ['light', 'dark']) {
      const themed = await browser.newContext({ ...devices['iPhone 14 Pro Max'] || devices['iPhone 13'], colorScheme: scheme });
      const page = await themed.newPage();
      page.on('pageerror', (e) => errors.push(scheme + ': ' + e.message));
      await page.goto(URL, { waitUntil: 'load' });
      const colors = await page.evaluate(() => ({
        bg: getComputedStyle(document.body).backgroundColor,
        fg: getComputedStyle(document.body).color
      }));
      ok(colors.bg !== colors.fg, `${scheme}: 文字と背景の色が違う (${colors.bg} / ${colors.fg})`);
      await themed.close();
    }

    // ------------------------------------------------ アイコン (用意していれば)
    section('アイコン');
    const desk = await browser.newPage();
    await desk.goto(URL);
    const apple = await desk.evaluate(() =>
      document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'));
    // 対象は iPhone のホーム画面から開く使い方なので、無ければとばさずに落とす
    // (とばしにしていたら、れんだメーターでアイコンが無いまま公開した。CLAUDE.md の落とし穴)
    ok(!!apple, 'ホーム画面用のアイコン (apple-touch-icon) の指定がある');
    if (apple) {
      // iOS は SVG のアイコンを使えない
      ok(apple.endsWith('.png'), `ホーム画面用アイコンが PNG (${apple})`);
      const res = await desk.request.get(URL + apple.replace('./', ''));
      ok(res.ok(), `${apple} が配信される`);
    }

    // ------------------------------------------------ 更新とオフライン (sw.js があれば)
    section('更新とオフライン');
    if (!fs.existsSync(path.join(ROOT, 'sw.js'))) {
      skip('サービスワーカーはまだ無い (オフライン対応するときに用意する)');
    } else {
      const swCtx = await browser.newContext();
      const swPage = await swCtx.newPage();
      await swPage.goto(URL, { waitUntil: 'load' });
      ok(await swPage.evaluate(() => navigator.serviceWorker.ready.then((r) => !!r.active).catch(() => false)),
        'サービスワーカーが動く');
      await swPage.waitForTimeout(800);

      // 直したものが 1 回のリロードで出るか (キャッシュ優先だと古い画面が出る)
      const indexPath = path.join(ROOT, 'index.html');
      const original = fs.readFileSync(indexPath, 'utf8');
      // 画面を JS で描くアプリもあるので、<h1> ではなく <title> を書き換えて見る
      const marker = original.match(/<title[^>]*>([^<]*)<\/title>/);
      fs.writeFileSync(indexPath, original.replace(marker[0], '<title>こうしんかくにん</title>'));
      await swPage.reload();
      await swPage.waitForTimeout(400);
      const title = await swPage.title();
      fs.writeFileSync(indexPath, original);
      ok(title.trim() === 'こうしんかくにん', `直したものが 1 回のリロードで出る (${title.trim()})`);

      await swPage.reload();
      await swPage.waitForTimeout(500);
      await swCtx.setOffline(true);
      await swPage.reload().catch(() => {});
      await swPage.waitForTimeout(400);
      // 画面が絵だけで字が無いアプリもあるので、字の量ではなくページの名前で見る (はんにんダンスで踏んだ)
      ok(await swPage.evaluate(() => document.title.length > 0 && document.body.children.length > 0).catch(() => false),
        'ネットにつながらなくても開ける');
      await swCtx.setOffline(false);
    }

    section('エラー');
    ok(errors.length === 0, errors.length ? '画面のエラー: ' + errors.join(' / ') : 'JS エラーなし');
  } finally {
    await browser.close();
    server.kill();
  }

  console.log(`\n${passed} 件合格 / ${failed} 件失敗`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
