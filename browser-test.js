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
          if (bg.style.transform) r.moved = true;
          if (G.phase === 'rest') { r.after = { bg: bg.style.transform, imp: G.imp, kick: G.kick }; return done(r); }
          if (now - t0 > 12000) return done(r);
          requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      }));
      ok(fx.hold >= 3, `当たった瞬間、インパクトの形で少し止まる (${fx.hold} コマ)`);
      ok(fx.imp && fx.moved, '当たった瞬間に玉の所が光り、写真ごとゆれて寄る');
      ok(fx.after && fx.after.bg === '' && fx.after.imp === null && fx.after.kick === 0, '玉が止まるころには、ゆれも寄りも光も元に戻っている');

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
        n: document.querySelectorAll('#rl div').length, best: window.__app.save.best }));
      ok(shots === 10 && res.over && res.n === 10, `ねらいうち 10 球を打ち切ると結果が出る (${shots} 球・${res.n} 個の記録)`);
      ok(String(res.score) === res.shown && res.best === res.score && res.score > 0, `合計 ${res.score} てんが出て、ベストに残る`);
      await pg.reload({ waitUntil: 'load' });
      const kept = await pg.evaluate(() => document.getElementById('best').textContent);
      ok(kept.includes(String(res.score)), `開き直してもベストが残る (${kept})`);
      await ctx.close();
    }

    // ------------------------------------------------ 明るい画面・暗い画面
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
