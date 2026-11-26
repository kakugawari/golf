// パターゴルフの決まりごと (putt-core.js) のテスト
const test = require('node:test');
const assert = require('node:assert');
const P = require('./putt-core.js');

test('絵とカップ: 絵の上のカップの位置から世界へ、世界から絵へ戻すと同じ所', () => {
  for (const pic of P.PICS) {
    const c = P.cupOf(pic), back = P.toPic(pic, c.x, c.z);
    assert.ok(Math.abs(back.X - pic.cup.X) < 0.01 && Math.abs(back.Y - pic.cup.Y) < 0.01);
    assert.ok(c.z > 3 && c.z < 7, `カップまで ${c.z.toFixed(2)}m`);
  }
});

test('どのホールも、打ち始めは画面に見えて、グリーンの上・カップの手前', () => {
  P.HOLES.forEach((h, i) => {
    const pic = P.PICS[h.pic], s = P.startOf(h), c = P.cupOf(pic);
    assert.ok(!P.outOf(pic, s), `${i + 1} 番: 打ち始めがグリーンの外`);
    assert.ok(s.z < c.z - 1, `${i + 1} 番: カップまで近すぎる`);
    // かたむきは芝の止める力より弱い (止まった玉がひとりでに転がり出さない)
    assert.ok(Math.hypot(h.slope.x, h.slope.z) < P.MU * 0.6, `${i + 1} 番: かたむきが強すぎる`);
  });
});

test('どのホールも、1 打で入れられる打ち方がある (入れられないホールを作らない)', () => {
  P.HOLES.forEach((h, i) => {
    const s = P.startOf(h), sol = P.solve(h, s);
    assert.ok(sol, `${i + 1} 番: 1 打で入る打ち方が見つからない`);
    assert.ok(sol.power > 0.05 && sol.power < 0.95, `${i + 1} 番: ちょうどの強さが端すぎる (${sol.power})`);
  });
});

test('まっすぐのホール: 強すぎると入らず、弱すぎると手前で止まる', () => {
  const h = P.HOLES[0], s = P.startOf(h), sol = P.solve(h, s);
  const strong = P.simulate(h, s, sol.angle, 1), weak = P.simulate(h, s, sol.angle, sol.power * 0.6);
  assert.notStrictEqual(strong.r, 'in');
  assert.strictEqual(weak.r, 'stop');
  assert.ok(weak.ball.z < P.cupOf(P.PICS[h.pic]).z);
});

test('かたむき: 横にかたむいたホールでは、まっすぐカップへ打つと横へそれる', () => {
  const h = P.HOLES[1], s = P.startOf(h), c = P.cupOf(P.PICS[h.pic]);
  const ang = Math.atan2(c.x - s.x, c.z - s.z), r = P.simulate(h, s, ang, 0.5);
  const flat = P.simulate({ ...h, slope: { x: 0, z: 0 } }, s, ang, 0.5);
  assert.ok(r.ball.x < flat.ball.x - 0.05, `左へかたむいているのに左へそれない (${r.ball.x.toFixed(2)} / ${flat.ball.x.toFixed(2)})`);
});

test('どんな打ち方でも、玉は 30 秒以内に止まるか入るか外へ出る', () => {
  for (const h of P.HOLES) for (let a = -1; a <= 1; a += 0.25) for (const p of [0, 0.3, 0.7, 1]) {
    const r = P.simulate(h, P.startOf(h), a, p);
    assert.ok(r.t < 30, `止まらない (${a}, ${p})`);
  }
});

test('呼び名: 1 打はホールインワン、パーとの差で名前が変わる', () => {
  assert.strictEqual(P.nameOf(1, 2, true), 'ホールインワン!!');
  assert.strictEqual(P.nameOf(2, 2, true), 'パー');
  assert.strictEqual(P.nameOf(2, 3, true), 'バーディー!');
  assert.strictEqual(P.nameOf(3, 2, true), 'ボギー');
  assert.strictEqual(P.nameOf(6, 2, false), 'ギブアップ');
});

test('近くの絵 (putt1n.jpg) でも、カップが絵の中のカップの所に来て、遠くの絵と同じ所を指す', () => {
  const pic = P.PICS[0], n = pic.near, c = P.cupOf(pic), q = P.toPic(n, c.x, c.z);
  assert.ok(Math.abs(q.X - n.cup.X) < 1 && Math.abs(q.Y - n.cup.Y) < 1, `カップ ${q.X.toFixed(1)},${q.Y.toFixed(1)}`);
  // 近くの絵の上の 1 点 → 世界 → 近くの絵 で戻る
  const w = P.fromPic(n, 300, 1100), b = P.toPic(n, w.x, w.z);
  assert.ok(Math.abs(b.X - 300) < 0.01 && Math.abs(b.Y - 1100) < 0.01);
  // カップの大きさ: 絵のカップの幅 (61px) と、計算の幅がそろう
  assert.ok(Math.abs(2 * P.CUPR * q.s - 61) < 3, `幅 ${(2 * P.CUPR * q.s).toFixed(1)}px`);
});
