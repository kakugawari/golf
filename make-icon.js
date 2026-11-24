/*
 * make-icon.js — プレイ中の画面の材料で、ホーム画面のアイコン (PNG) を作る。
 *   練習場の写真 (range.jpg) + フィニッシュの打つ人 (g8.webp) + 奥へ飛んでいく金色の跡と玉
 *
 *   node make-icon.js                         → apple-touch-icon.png (180) と icon-192.png (192)
 *   node make-icon.js icon-512.png:512        → 名前と大きさを指定して作る
 *
 * iOS は apple-touch-icon に SVG を使えない (CLAUDE.md の落とし穴)。
 * 角は iOS が丸めるので、PNG は角を丸めず四角いまま塗りつぶす。
 * 写真や打つ人の絵を替えたら、これをもう一度流す。
 */
const fs = require('node:fs');
const path = require('node:path');
const url = (f, t) => `data:${t};base64,${fs.readFileSync(path.join(__dirname, f)).toString('base64')}`;

(async () => {
  const { chromium } = require('playwright');
  const jobs = process.argv.slice(2).map((a) => { const [name, size] = a.split(':'); return { name, size: Number(size) || 180 }; });
  if (!jobs.length) jobs.push({ name: 'apple-touch-icon.png', size: 180 }, { name: 'icon-192.png', size: 192 });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const big = await page.evaluate(async ([bgU, gfU]) => {
    const L = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = s; });
    const bg = await L(bgU), gf = await L(gfU);
    const N = 1024, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d');
    // 写真: 消える点 (352,697) を少し上に置いて、ネットのトンネルと芝が入るように切る
    const S = 560, sx = 352 - S / 2, sy = 697 - S * 0.47;
    x.drawImage(bg, sx, sy, S, S, 0, 0, N, N);
    const k = N / S, vx = (352 - sx) * k, vy = (697 - sy) * k;
    // 下を少し暗く (人と跡を浮かせる)
    let g = x.createLinearGradient(0, N * 0.45, 0, N); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.45)'); x.fillStyle = g; x.fillRect(0, 0, N, N);
    // 金色の跡: 打った所 (足もとの右) から、上がりながら奥の消える点の上へ。遠いほど細く
    const q=(t)=>{const P0=[N*0.62,N*0.93],P1=[N*0.575,N*0.42],P2=[vx+30,vy-190];const u=1-t;return [u*u*P0[0]+2*u*t*P1[0]+t*t*P2[0],u*u*P0[1]+2*u*t*P1[1]+t*t*P2[1]];};
    x.lineCap='round';
    for(const [w,a,c] of [[5.2,.16,'255,214,64'],[2.6,.4,'255,214,64'],[1,.95,'255,250,225']])for(let i=0;i<120;i++){const t0=i/120,t1=(i+1)/120,A=q(t0),B=q(t1),wd=(26-20*t0)*w*0.55;x.strokeStyle='rgba('+c+','+a+')';x.lineWidth=wd;x.beginPath();x.moveTo(...A);x.lineTo(...B);x.stroke();}
    const p2=q(1);g=x.createRadialGradient(p2[0],p2[1],0,p2[0],p2[1],46);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.3,'rgba(255,230,140,.8)');g.addColorStop(1,'rgba(255,210,63,0)');
    x.fillStyle=g;x.beginPath();x.arc(p2[0],p2[1],46,0,7);x.fill();x.fillStyle='#fff';x.beginPath();x.arc(p2[0],p2[1],9,0,7);x.fill();
    // 打つ人 (フィニッシュ): 左下に大きく
    const H = N * 0.8, W = gf.width * H / gf.height; const gx = N * 0.08, gy = N - H + N * 0.02;
    x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.ellipse(gx + W * 0.5, N * 0.985, W * 0.6, 22, 0, 0, 7); x.fill();
    x.drawImage(gf, gx, gy, W, H);
    return c.toDataURL('image/png');
  }, [url('range.jpg', 'image/jpeg'), url('g8.webp', 'image/webp')]);
  for (const j of jobs) {
    // 1024 の絵を、ブラウザに少しずつ縮めさせる (1 回で縮めると細い線がちらつく)
    const png = await page.evaluate(async ([src, n]) => {
      const im = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
      let cur = im, w = im.width;
      while (w / 2 >= n) { const c = document.createElement('canvas'); c.width = c.height = w / 2; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, w / 2, w / 2); cur = c; w /= 2; }
      const c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, n, n);
      return c.toDataURL('image/png');
    }, [big, j.size]);
    fs.writeFileSync(path.join(__dirname, j.name), Buffer.from(png.split(',')[1], 'base64'));
    console.log(`${j.name} (${j.size}x${j.size})`);
  }
  await browser.close();
})();
