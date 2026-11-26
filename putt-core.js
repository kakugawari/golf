/* putt-core.js — パターゴルフの決まりごと (DOM を触らない。ブラウザと node の両方で動く)
 *
 * 世界の座標は メートル。カメラ (目) が原点、x が右、z が奥。地面は y=0 の平らな面 (かたむきは「横から押す力」で表す)。
 * 背景はグリーン 1 つ。遠くから見た絵 putt1.jpg と、カップの近くから見た絵 putt1n.jpg (near)。絵の上の値:
 *   vx, vy   消える点 (vy は地平線の高さ)
 *   f        焦点 (絵の画素)。カップの楕円の縦横の比 (= (カップの y - vy) / f) から決めた
 *   h0       目の高さ (m)。2 枚ともカップの半径が CUPR になるように決めた
 *   cup      絵の中のカップのまん中
 * 絵 → 世界: z = f*h0/(Y-vy)、x = (X-vx)*z/f。世界 → 絵: X = vx + f*x/z、Y = vy + f*h0/z
 * 近くの絵は、カメラが奥へ cz (m) 進んだ所から見た絵 (z の代わりに z - cz を使う)。値の決め方:
 *   f   遠くの山や木が遠くの絵と同じ大きさ (= 同じ画角) なので、遠くの絵の f を絵の高さの比で直した値
 *   cz  カップの幅 (61px) から、近いカメラからカップまで 2.42m → 4.53 - 2.42
 *   vy  芝の縞が集まる高さ (縞に線を重ねた見本で決めた)。h0 はカップの Y が合うように
 * (2 枚目の池のグリーンはやめた: カップの近くから見た絵が無いので)
 */
(function (root) {
  const MU = 0.65;      // 芝で 1 秒あたりに減る速さ (m/s²)
  const CUPR = 0.12;    // カップの半径 (絵に描いてあるカップの大きさに合わせた。本物より大きい)
  const SINKV = 1.5;    // これより遅ければカップに入る
  const LIPV = 2.3;     // これより遅く、カップのまん中寄りを通ると、ふちに当たってはねる
  const VMIN = 0.35, VMAX = 3.6;   // 引いた強さ 0〜1 を、打ち出す速さにする
  const MAXSTROKE = 6;  // これだけ打って入らなければ、そのホールはおしまい

  const PICS = [
    { src: 'putt1.jpg', w: 941, h: 1672, vx: 475, vy: 560, f: 753, h0: 0.68, cup: { X: 475, Y: 673 }, farY: 640,
      near: { src: 'putt1n.jpg', w: 768, h: 1365, vx: 385, vy: 520, f: 615, h0: 1.082, cz: 2.111, cup: { X: 385, Y: 795 } } },
  ];

  function toWorld(pic, X, Y) { const z = pic.f * pic.h0 / (Y - pic.vy); return { x: (X - pic.vx) * z / pic.f, z }; }
  function toPic(pic, x, z) { const zz = z - (pic.cz || 0); return { X: pic.vx + pic.f * x / zz, Y: pic.vy + pic.f * pic.h0 / zz, s: pic.f / zz }; }
  function fromPic(pic, X, Y) { const zz = pic.f * pic.h0 / (Y - pic.vy); return { x: (X - pic.vx) * zz / pic.f, z: zz + (pic.cz || 0) }; }
  function cupOf(pic) { return toWorld(pic, pic.cup.X, pic.cup.Y); }

  // 9 ホール。打ち始めは絵の上の点 (X, Y) で決める (画面に見える所に置くため)。slope は かたむきが玉を押す力 (m/s²。x 右・z 奥)
  const HOLES = [
    { pic: 0, X: 470, Y: 1250, slope: { x: 0, z: 0 }, par: 2 },
    { pic: 0, X: 600, Y: 1180, slope: { x: -0.14, z: 0 }, par: 2 },
    { pic: 0, X: 330, Y: 1150, slope: { x: 0.16, z: 0 }, par: 2 },
    { pic: 0, X: 420, Y: 1420, slope: { x: 0.08, z: -0.2 }, par: 2 },
    { pic: 0, X: 640, Y: 1350, slope: { x: -0.2, z: 0.1 }, par: 2 },
    { pic: 0, X: 250, Y: 1220, slope: { x: 0.22, z: 0 }, par: 2 },
    { pic: 0, X: 290, Y: 1300, slope: { x: 0.12, z: -0.16 }, par: 2 },
    { pic: 0, X: 720, Y: 1260, slope: { x: -0.22, z: 0.12 }, par: 2 },
    { pic: 0, X: 520, Y: 1480, slope: { x: 0.2, z: -0.2 }, par: 3 },
  ];

  function startOf(hole) { return toWorld(PICS[hole.pic], hole.X, hole.Y); }
  function speedOf(power) { return VMIN + (VMAX - VMIN) * Math.max(0, Math.min(1, power)); }

  // グリーンの外か (絵の左右のはし・カップの奥の池やバンカー・手前の画面の外)
  function outOf(pic, b) {
    const c = cupOf(pic);
    if (b.z < 0.4 || b.z > c.z + (pic.f * pic.h0 / (pic.farY - pic.vy) - c.z)) return true;
    const p = toPic(pic, b.x, b.z);
    return p.X < 70 || p.X > pic.w - 70 || p.Y > pic.h - 20;
  }

  // 玉を 1 歩進める。返り値: 'roll' | 'stop' | 'in' | 'out'
  function step(st, hole, dt) {
    const pic = PICS[hole.pic], c = cupOf(pic), a = hole.slope, b = st.ball, v = st.v;
    const sp = Math.hypot(v.x, v.z);
    // 芝の止める力が、いまの速さより大きければ止まる (かたむきの力はどのホールも MU より弱いので、止まったら動かない)
    if (sp <= MU * dt) { v.x = 0; v.z = 0; return 'stop'; }
    v.x += (a.x - MU * v.x / sp) * dt; v.z += (a.z - MU * v.z / sp) * dt;
    b.x += v.x * dt; b.z += v.z * dt;
    const d = Math.hypot(b.x - c.x, b.z - c.z), s2 = Math.hypot(v.x, v.z);
    if (d < CUPR) {
      if (s2 < SINKV) { b.x = c.x; b.z = c.z; v.x = 0; v.z = 0; return 'in'; }
      if (!st.lipped && d < CUPR * 0.7 && s2 < LIPV) {
        // ふちに当たって、はねる: 向きを 35° ずらして半分の速さに
        st.lipped = true; const ang = (b.x - c.x) * v.z - (b.z - c.z) * v.x >= 0 ? 0.6 : -0.6, cs = Math.cos(ang), sn = Math.sin(ang);
        const nx = (v.x * cs - v.z * sn) * 0.5, nz = (v.x * sn + v.z * cs) * 0.5; v.x = nx; v.z = nz;
      }
    } else if (d > CUPR * 1.5) st.lipped = false;
    if (outOf(pic, b)) return 'out';
    return 'roll';
  }

  // 打ってから止まるまで、まとめて進める (テストと自動の打ち手で使う)
  function simulate(hole, from, angle, power) {
    const st = { ball: { x: from.x, z: from.z }, v: { x: Math.sin(angle) * speedOf(power), z: Math.cos(angle) * speedOf(power) }, lipped: false };
    for (let i = 0; i < 120 * 30; i++) { const r = step(st, hole, 1 / 120); if (r !== 'roll') return { r, ball: st.ball, t: i / 120 }; }
    return { r: 'stop', ball: st.ball, t: 30 };
  }

  // 1 打で入る打ち方を探す (どのホールも入れられることをテストで確かめる。CPU のお手本にも使える)
  function solve(hole, from) {
    const c = cupOf(PICS[hole.pic]), base = Math.atan2(c.x - from.x, c.z - from.z);
    for (let da = 0; da <= 0.6; da += 0.005) for (const sg of [1, -1]) for (let p = 0; p <= 1; p += 0.01) {
      const a = base + sg * da, r = simulate(hole, from, a, p);
      if (r.r === 'in') return { angle: a, power: p };
    }
    return null;
  }

  function nameOf(strokes, par, holed) {
    if (!holed) return 'ギブアップ';
    if (strokes === 1) return 'ホールインワン!!';
    const d = strokes - par;
    return d <= -2 ? 'イーグル!' : d === -1 ? 'バーディー!' : d === 0 ? 'パー' : d === 1 ? 'ボギー' : d === 2 ? 'ダブルボギー' : `+${d}`;
  }

  const api = { MU, CUPR, SINKV, LIPV, VMIN, VMAX, MAXSTROKE, PICS, HOLES, toWorld, toPic, fromPic, cupOf, startOf, speedOf, outOf, step, simulate, solve, nameOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PUTT = api;
})(typeof window !== 'undefined' ? window : globalThis);
