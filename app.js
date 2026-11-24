{
const $=id=>document.getElementById(id);
const cv=$('c'),ctx=cv.getContext('2d');
let W=0,H=0,HY=0,F=0,DPR=1;
function resize(){const st=document.getElementById('stage'),w=st.clientWidth||innerWidth,h=st.clientHeight||innerHeight;if(!(w>=1&&h>=1))return;DPR=Math.min(2,window.devicePixelRatio||1);W=w;H=h;cv.width=W*DPR;cv.height=H*DPR;ctx.setTransform(DPR,0,0,DPR,0,0);HY=H*0.29;F=Math.min(H*0.95,W*1.6);}
addEventListener('resize',resize);resize();

const CLUBS=[
 {id:'dr',k:'1W',name:'ドライバー',carry:230,apex:30,roll:24},
 {id:'i7',k:'7I',name:'7番アイアン',carry:150,apex:26,roll:8},
 {id:'pw',k:'PW',name:'ウェッジ',carry:100,apex:24,roll:3}];
const TG=[
 {z:60,x:-5,c:'#ff4d4d',n:'あか'},
 {z:100,x:7,c:'#ffd23f',n:'きいろ'},
 {z:140,x:-8,c:'#3d8bff',n:'あお'},
 {z:180,x:10,c:'#ffffff',n:'しろ'},
 {z:220,x:-3,c:'#ff8a1f',n:'オレンジ'}];
const GR=9,RING0=120,RSPD=90,RWIN=30,ARC=270,AR=78;

let save={best:0,far:{}};
try{const s=JSON.parse(localStorage.getItem('uchippanashi-v1')||'null');if(s)save=Object.assign(save,s);}catch(e){}
function store(){try{localStorage.setItem('uchippanashi-v1',JSON.stringify(save));}catch(e){}}

const G={mode:'free',phase:'title',club:1,p:0,dir:1,power:0,e:0,aim:0,ring:0,r0:24,ball:{x:0,y:0.05,z:0},trail:[],marks:[],parts:[],
 cam:{x:0,z:-14,h:4.5},wind:{x:0,z:0},target:null,left:10,score:0,list:[],shot:null,t:0,swT:0,aS:0,launched:false,sound:true,
 shown:0,hs:0,flash:0,shake:0,kick:0,imp:null,speed:0,combo:0,nice:false};
const A0=Math.atan2(-1.38,0.80);let ang=A0;

/* ---------- sound ---------- */
let AC=null;
function ac(){if(!G.sound)return null;if(!AC){try{AC=new (window.AudioContext||window.webkitAudioContext)();}catch(e){return null;}}if(AC.state==='suspended')AC.resume();return AC;}
let NB=null,live=0;
function nbuf(a){if(!NB){const n=Math.floor(a.sampleRate*1.2);NB=a.createBuffer(1,n,a.sampleRate);const ch=NB.getChannelData(0);for(let i=0;i<n;i++)ch[i]=Math.random()*2-1;}return NB;}
function tone(f,d,type,v,f2,delay){const a=ac();if(!a||live>48)return;try{const t=a.currentTime+(delay||0);const o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+d);g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(v,t+0.005);g.gain.exponentialRampToValueAtTime(0.0001,t+d);o.connect(g);g.connect(a.destination);live++;o.onended=()=>{live--;try{o.disconnect();g.disconnect();}catch(e){}};o.start(t);o.stop(t+d+0.02);}catch(e){}}
function noise(d,f,v,type,delay){const a=ac();if(!a||live>48)return;try{const t=a.currentTime+(delay||0);const s=a.createBufferSource();s.buffer=nbuf(a);const bp=a.createBiquadFilter();bp.type=type||'bandpass';bp.frequency.value=f;bp.Q.value=0.9;const g=a.createGain();g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(0.0001,t+d);s.connect(bp);bp.connect(g);g.connect(a.destination);live++;s.onended=()=>{live--;try{s.disconnect();bp.disconnect();g.disconnect();}catch(e){}};s.start(t,Math.random()*0.6,d+0.02);}catch(e){}}
const sfx={
 tick(){tone(880,0.05,'square',0.05);},
 aim(){tone(1200,0.03,'sine',0.06);},
 charge(p){tone(300+p*500,0.05,'triangle',0.05);},
 hit(nice,miss){if(miss){noise(0.12,600,0.6);tone(180,0.15,'square',0.12,90);tone(110,0.18,'sine',0.35,50);return;}
  // 打った音は 3 つを重ねる: 低い「ドン」(体に来る) + 乾いた「カッ」(芯) + 金属の「キーン」(余韻)
  tone(150,0.16,'sine',0.45,45);noise(0.035,4500,0.3,'highpass');noise(0.06,1800,0.25,'bandpass');
  tone(2100,0.18,'triangle',0.22,1300);
  if(nice){tone(2637,0.9,'sine',0.12);tone(3520,0.7,'sine',0.08,0,0.02);tone(1319,0.6,'triangle',0.07,0,0.03);noise(0.5,1200,0.12,'bandpass',0.05);}},
 land(){tone(150,0.2,'sine',0.4,55);noise(0.1,500,0.2);},
 green(){[523,659,784,1047].forEach((f,i)=>tone(f,0.3,'triangle',0.16,0,i*0.08));},
 pin(){[523,659,784,1047,1319].forEach((f,i)=>tone(f,0.45,'triangle',0.18,0,i*0.07));for(let i=0;i<14;i++)noise(0.08,2500+Math.random()*2000,0.08+Math.random()*0.1,'bandpass',0.3+i*0.07);},
 whoosh(){noise(0.25,800,0.3);}};
function buzz(ms){try{navigator.vibrate&&navigator.vibrate(ms);}catch(e){}}

/* ---------- UI ---------- */
function buildClubs(){$('clubs').innerHTML=CLUBS.map((c,i)=>`<button class="club${i===G.club?' on':''}" data-i="${i}">${c.k} ${c.name}<small>さいだい ${c.carry}y</small></button>`).join('');buildTicks();}
function pt(a,r){const t=a*Math.PI/180;return [100+Math.cos(t)*r,100+Math.sin(t)*r];}
function arcD(a0,a1,r){if(Math.abs(a1-a0)<0.5)a1=a0+0.5;const lo=Math.min(a0,a1),hi=Math.max(a0,a1);const p0=pt(lo,r),p1=pt(hi,r);return `M${p0[0].toFixed(1)} ${p0[1].toFixed(1)} A${r} ${r} 0 ${hi-lo>180?1:0} 1 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`;}
function angOf(p){return 90+p*ARC;}
function ydOf(p){const c=CLUBS[G.club];const car=c.carry*p;return car+G.wind.z*car/60+c.roll*(0.4+0.6*p);}
function pOf(y){const a=ydOf(0),b=ydOf(1);return (y-a)/(b-a);}
function buildTicks(){const c=CLUBS[G.club];let h=`<circle cx="100" cy="100" r="100" fill="rgba(12,20,15,.62)" stroke="rgba(255,255,255,.18)" stroke-width="1.5"/><path d="${arcD(90,90+ARC,AR)}" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="14" stroke-linecap="round"/>`;
 const mx=ydOf(1),st=mx>180?25:mx>90?10:5,big=mx>180?50:mx>90?50:25;for(let y=st;y<=mx;y+=st){if(pOf(y)<0.03)continue;const a=angOf(pOf(y)),b=y%big===0,p1=pt(a,AR+10),p2=pt(a,AR+(b?17:14));h+=`<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke="rgba(255,255,255,.8)" stroke-width="${b?2.5:1.5}"/>`;
  if(b){const q=pt(a,AR+29);h+=`<text x="${q[0].toFixed(1)}" y="${(q[1]+5).toFixed(1)}" text-anchor="middle" font-size="15" font-weight="800" fill="#fff" stroke="rgba(0,0,0,.65)" stroke-width="3" paint-order="stroke">${y}</text>`;}}
 const b0=pt(90,AR-12),b1=pt(90,AR+12);h+=`<line x1="${b0[0]}" y1="${b0[1]}" x2="${b1[0]}" y2="${b1[1]}" stroke="#ffd23f" stroke-width="5" stroke-linecap="round"/>`;
 if(G.target){const r=pOf(G.target.z);if(r<=1.02&&r>0){const a=angOf(r),q=pt(a,AR),f=pt(a,AR-22),col=G.target.c;h+=`<line x1="${q[0]}" y1="${q[1]}" x2="${f[0]}" y2="${f[1]}" stroke="#fff" stroke-width="2"/><circle cx="${f[0]}" cy="${f[1]}" r="6" fill="${col}" stroke="#fff" stroke-width="2"/>`;}}
 $('arcbg').innerHTML=h;}
$('clubs').addEventListener('pointerdown',e=>{e.stopPropagation();const b=e.target.closest('.club');if(!b||G.phase!=='ready')return;G.club=+b.dataset.i;buildClubs();setGauge();sfx.tick();});
const _c=new Map();function setA(el,k,v){const key=el.id+'|'+k;if(_c.get(key)===v)return;_c.set(key,v);if(k==='text')el.textContent=v;else if(k[0]==='-'||k==='left'||k==='top'||k==='opacity')el.style.setProperty(k,v);else el.setAttribute(k,v);}
function setCls(el,c,on){if(el.classList.contains(c)!==on)el.classList.toggle(c,on);}
function setGauge(){const ph=G.phase,c=CLUBS[G.club];let v=0,a=90;
 if(ph==='power'){v=G.p;a=angOf(v);}else if(ph==='ring'){v=G.power;a=90+(angOf(v)-90)*(G.ring-G.r0)/(RING0-G.r0);}
 else if(['swing','flight','roll','rest'].includes(ph)){v=G.power;a=70;}
 const fill=$('afill');if(v>0){setA(fill,'d',arcD(90,angOf(v),AR));setA(fill,'stroke','#ffd23f');setA(fill,'opacity',String(ph==='power'?1:ph==='ring'?0.35:0.55));}else setA(fill,'d','');
 const z=$('azone');if(ph==='ring'){const w=(angOf(G.power)-90)*RWIN*0.25/(RING0-G.r0);setA(z,'d',arcD(90-w,90+w,AR));setA(z,'stroke',Math.abs(G.ring-G.r0)<=RWIN*0.25?'#fff':'#ffd23f');}else setA(z,'d','');
 const q=pt(a,AR);setA($('amk'),'transform',`translate(${q[0].toFixed(1)} ${q[1].toFixed(1)})`);
 const sw=$('sw'),ok=ph==='ring'&&Math.abs(G.ring-G.r0)<=RWIN*0.25;setCls(sw,'now',ok);setCls(sw,'idle',ph==='ready');
 const yd=Math.round(ydOf(v))+'y';// ボタンには「いま何をするか」だけ。距離はゲージのまん中に 1 か所だけ出す (前はゲージ・ボタン・下の字の 3 か所に同じ距離が出ていた)
 let L=ph==='ready'?['スイング','ながおし']:ph==='power'?['はなす','ちょうどで']:ph==='ring'?(ok?['いま!','']:['タップ','▲で']):ph==='rest'?(G.mode==='chal'&&G.left<=0?['けっか','はっぴょう']:['つぎへ','タップ']):['…',''];
 const D=[ph==='ready'?CLUBS[G.club].k:yd,ph==='ready'?'パワー':ph==='power'?'ためて…':''];
 setA($('dyd'),'text',D[0]);setA($('dys'),'text',ph==='ring'?(ok?'いま!':'▲でタップ'):D[1]);setA($('swb'),'text',L[0]);setA($('sws'),'text',L[1]);}
function aimLab(){const v=Math.round((G.aim-(G.target?G.target.x/G.target.z:0))*100);if(G.phase==='ready')hint(v===0?(G.target?'ねらい:旗のほう':'ねらい:まっすぐ'):v>0?`ねらい:みぎ ${v}`:`ねらい:ひだり ${-v}`);}
function hud(){$('hl').innerHTML=G.mode==='chal'?`のこり<b>${G.left}</b>球<i></i><b>${G.shown}</b>てん`:'じゆうれんしゅう';
 const w=G.wind,m=Math.hypot(w.x,w.z);$('hw').style.visibility=G.mode==='chal'?'visible':'hidden';$('wv').textContent=m.toFixed(1)+'m';$('wa').style.transform=`rotate(${Math.atan2(w.x,w.z)*180/Math.PI}deg)`;
 const am=$('aimt');if(G.target){am.hidden=false;$('aimdot').style.background=G.target.c;$('aimtt').textContent=`${G.target.n}の旗 ${G.target.z}y`;}else am.hidden=true;
 $('aL').classList.toggle('off',G.phase!=='ready');$('aR').classList.toggle('off',G.phase!=='ready');$('clubs').style.opacity=G.phase==='ready'?1:0.4;}
function hint(t){$('hint').textContent=t;}
let popTimers=[];
function mapSvg(dx,dz){const k=30/GR;let x=dx*k,y=-dz*k;const L=Math.hypot(x,y),out=L>44;if(out){x*=44/L;y*=44/L;}
 return `<circle cx="50" cy="50" r="48" fill="#e9f5e3"/><circle cx="50" cy="50" r="30" fill="#8fe07d" stroke="#fff" stroke-width="2.5"/><circle cx="50" cy="50" r="11" fill="#b7ef9f"/>`+
 `<line x1="50" y1="50" x2="50" y2="24" stroke="#555" stroke-width="2"/><path d="M50 24 L64 29 L50 34Z" fill="${G.target.c==='#ffffff'?'#f4f4f4':G.target.c}" stroke="rgba(0,0,0,.3)"/><circle cx="50" cy="50" r="2.5" fill="#173a1c"/>`+
 `<line x1="50" y1="50" x2="${50+x}" y2="${50+y}" stroke="#173a1c" stroke-width="1.5" stroke-dasharray="3 3" opacity=".5"/>`+
 `<circle cx="${50+x}" cy="${50+y}" r="6" fill="#fff" stroke="#173a1c" stroke-width="2"><animate attributeName="r" values="6;8;6" dur="1s" repeatCount="indefinite"/></circle>`+
 (out?`<text x="${50+x*0.72}" y="${50+y*0.72+4}" font-size="12" font-weight="800" text-anchor="middle" fill="#173a1c">…</text>`:'');}
function pop(o){popTimers.forEach(clearTimeout);popTimers=[];const p=$('pop');p.classList.remove('on');void p.offsetWidth;
 const r=$('pt');r.textContent=o.title;r.className='rib '+(o.cls||'');$('pu').textContent=o.unit;$('ps').textContent=o.sub;
 const m=$('pmap');if(o.map){m.hidden=false;m.innerHTML=o.map;}else m.hidden=true;
 const st=$('pst');st.style.display=o.stars==null?'none':'flex';st.innerHTML='<i>★</i><i>★</i><i>★</i>';
 const b=$('pb');b.textContent='0';p.classList.add('on');
 const N=Math.min(14,Math.max(1,Math.round(o.num/8))),stepT=Math.min(45,700/N);
 for(let i=1;i<=N;i++)popTimers.push(setTimeout(()=>{b.textContent=Math.round(o.num*i/N);if(i%2||i===N)tone(500+i*45,0.04,'square',0.04);},120+i*stepT));
 const t0=160+N*stepT;
 for(let i=0;i<(o.stars||0);i++)popTimers.push(setTimeout(()=>{const el=st.children[i];el.classList.add('on');tone([1047,1319,1568][i],0.25,'triangle',0.15);popTimers.push(setTimeout(()=>el.classList.add('done'),220));},t0+120+i*180));
 popTimers.push(setTimeout(()=>{if(o.done)o.done();},t0+150+(o.stars||0)*180));}
function unpop(){popTimers.forEach(clearTimeout);popTimers=[];$('pop').classList.remove('on');}
function bestText(){const f=save.far;$('best').textContent=`ベスト ${save.best||'―'}てん`+(f.dr?` / 1W ${f.dr}y`:'');}

/* aim buttons: press-and-hold repeat */
let aimTimer=null;
function aimStep(d){if(G.phase!=='ready')return;G.aim=Math.max(-0.15,Math.min(0.15,G.aim+d*0.01));aimLab();sfx.aim();}
function aimBind(el,d){el.addEventListener('pointerdown',e=>{e.stopPropagation();e.preventDefault();aimStep(d);clearInterval(aimTimer);let n=0;aimTimer=setInterval(()=>{if(++n>3)aimStep(d);},80);});
 ['pointerup','pointerleave','pointercancel'].forEach(t=>el.addEventListener(t,()=>clearInterval(aimTimer)));}
aimBind($('aL'),-1);aimBind($('aR'),1);

/* ---------- flow ---------- */
function clearRun(){try{localStorage.removeItem('uchippanashi-run');}catch(e){}}
function start(mode,run){G.mode=mode;G.left=10;G.score=0;G.list=[];G.marks=[];G.combo=0;G.shown=0;G.stat={nice:0,green:0,pin:0};
 if(run){G.left=run.left;G.score=run.score;G.shown=run.score;G.list=run.list||[];G.stat=run.stat||G.stat;}$('title').hidden=true;$('over').hidden=true;ac();nextBall();}
function nextBall(){unpop();G.shown=G.score;G.phase='ready';G.launched=false;G.swT=0;G.p=0;G.power=0;G.trail=[];ang=A0;G.ball={x:0,y:0.05,z:0};
 if(G.mode==='chal'){G.target=TG[Math.floor(Math.random()*TG.length)];const m=0.5+Math.random()*3,d=Math.random()*Math.PI*2;G.wind={x:Math.sin(d)*m,z:Math.cos(d)*m};
  const need=G.target.z;G.club=need>155?0:need>100?1:2;G.aim=Math.round(G.target.x/G.target.z*100)/100;}else{G.target=null;G.wind={x:0,z:0};G.aim=0;}
 buildClubs();hud();aimLab();setGauge();}
function down(){
 if(G.phase==='ready'){ac();G.phase='power';G.p=0;G.ph=[];G.dir=1;hud();hint('ちょうどいい距離で はなす');}
 else if(G.phase==='ring'){hit();}
 else if(G.phase==='rest'&&G.restT>0.5){after();}}
function up(){if(G.phase==='power'){const h=G.ph||[],t=performance.now()-80;let pv=G.p;for(let i=h.length-1;i>=0;i--){if(h[i][0]<=t){pv=h[i][1];break;}}G.power=Math.max(0.05,pv);G.p=G.power;G.phase='ring';G.ring=RING0;sfx.tick();hint('白い玉が 下の▲にきたら タップ!');}}
function hit(){const e=Math.max(-1,Math.min(1,(G.ring-G.r0)/RWIN));G.e=e;G.phase='swing';G.swT=0;G.aS=ang;G.launched=false;sfx.whoosh();hint('');}
function launch(){const c=CLUBS[G.club],P=G.power,e=G.e,ae=Math.abs(e),miss=ae>=0.999,nice=ae<0.25;
 const ad=Math.max(0,(ae-0.25)/0.75);let carry=c.carry*P*(1-0.35*Math.pow(ad,1.4));if(miss)carry*=0.45;carry+=G.wind.z*carry/60;carry=Math.max(4,carry);
 const apex=c.apex*(0.45+0.55*P)*(miss?0.3:1);
 const roll=c.roll*(0.4+0.6*P)*(1-0.4*ad)*(miss?1.4:1);
 G.shot={carry,apex,aim:G.aim,roll,T:1.1+carry/85,curve:-e*carry*0.16,st:-e*0.05,wx:G.wind.x*carry/45,miss,ae,e};
 G.phase='flight';G.t=0;G.launched=true;G.nice=nice;
 sfx.hit(nice,miss);buzz(nice?35:15);
 // 手ごたえ: インパクトの形で一瞬止める → 玉のところに光と輪 → 画面ごと (写真も) ゆらしてぐっと寄る
 G.hs=miss?0.04:nice?0.13:0.07;G.flash=miss?0.1:nice?0.3:0.12;G.shake=miss?5:nice?14:8;G.kick=miss?0.3:nice?1:0.6;G.speed=nice?0.6:0.35;
 G.imp={t:0,nice,miss};
 burst(0,0.1,0,nice?34:16,['#ffffff','#fff3a6','#ffd23f'],{sp:6,up:4,g:8,life:0.55,size:0.12});
 if(nice){G.combo++;}else G.combo=0;}
function Z(s,u){return s.carry*u*(1.25-0.25*u);}
function X(s,u){const z=Z(s,u);return (s.aim+s.st)*z+s.curve*u*u+s.wx*u;}
function Y(s,u){return s.apex*Math.sin(Math.PI*Math.pow(u,1.15));}
function quality(s){if(s.miss)return 'ミスショット…';if(s.ae<0.25)return G.combo>1?`ナイスショット! ×${G.combo}`:'ナイスショット!';const h=s.e>0;if(s.ae<0.55)return h?'ちょいフック':'ちょいスライス';return h?'フック':'スライス';}
function landFx(){const b=G.ball;sfx.land();G.shake=Math.max(G.shake,3);burst(b.x,0.1,b.z,16,['#5fb64f','#3d8a35','#8b6b3d','#c8e6a0'],{sp:3,up:5,g:15,life:0.8,size:0.5});}
function rest(){G.phase='rest';G.restT=0;const s=G.shot,b=G.ball;const tot=Math.round(b.z),car=Math.round(s.carry);
 if(G.mode==='chal'){const t=G.target,d=Math.hypot(b.x-t.x,b.z-t.z);let pt=d<=1.5?100:Math.max(0,Math.round(100-d*4));G.score+=pt;G.left--;G.list.push(pt);if(G.nice)G.stat.nice++;if(d<GR)G.stat.green++;if(d<=3)G.stat.pin++;
  let lab=quality(s),cls=s.miss?'miss':G.nice?'green':'';
  if(d<=3){lab='ピンそば!!';cls='gold';sfx.pin();confetti(t,90);G.flash=0.5;}
  else if(d<GR){lab='グリーンオン!';cls='gold';sfx.green();confetti(t,45);}
  const stars=pt>=90?3:pt>=60?2:pt>=30?1:0;
  pop({title:lab,cls,num:pt,unit:'てん',stars,sub:`ピンまで ${Math.round(d)}y ・ ${tot}y とんだ`,map:mapSvg(b.x-t.x,b.z-t.z),done:()=>{G.shown=G.score;hud();const h=$('hl');h.classList.remove('bump');void h.offsetWidth;h.classList.add('bump');}});
  hud();hint(G.left>0?'':'10球おわり! ボタンで けっか');}
 else{const side=Math.round(b.x);const sd=Math.abs(side)<=3?'まっすぐ':side>0?`右へ ${side}y`:`左へ ${-side}y`;
  const c=CLUBS[G.club];let best=false;if(!s.miss&&tot>(save.far[c.id]||0)){save.far[c.id]=tot;store();best=true;confetti({x:b.x,z:b.z},40);sfx.green();}
  pop({title:best?'じこベスト!':quality(s),cls:best?'gold':s.miss?'miss':G.nice?'green':'',num:tot,unit:'y',stars:null,sub:`キャリー ${car}y ・ ${sd}`});hint('');}
 G.marks.push({x:b.x,z:b.z});if(G.marks.length>12)G.marks.shift();}
function after(){if(G.mode==='chal'&&G.left<=0){finish();return;}nextBall();}
let finT=[],finDone=null;
function finish(){G.phase='over';unpop();finT.forEach(clearTimeout);finT=[];const sc=G.score;const nb=sc>(save.best||0);if(nb){save.best=sc;store();}
 const rank=sc>=800?'プロ級!':sc>=600?'上級者':sc>=400?'中級者':sc>=200?'がんばり中':'ビギナー';
 $('rs').textContent='0';const st=$('rr');st.className='stamp';st.textContent=rank;
 $('rl').innerHTML=G.list.map(v=>`<div>${v}<small>${'★'.repeat(v>=90?3:v>=60?2:v>=30?1:0)||'・'}</small></div>`).join('');
 const S=G.stat||{nice:0,green:0,pin:0};const rst=$('rst');rst.className='stats';rst.innerHTML=`<div><b>${S.nice}</b>ナイスショット</div><div><b>${S.green}</b>グリーンオン</div><div><b>${S.pin}</b>ピンそば</div>`;
 const rb=$('rb');rb.className='newbest';rb.style.color=nb?'#e2402b':'#4d6b51';rb.textContent=nb?'じこベスト更新!':`ベスト ${save.best}てん`;
 $('rbtn').className='rbtn';$('rskip').style.visibility='visible';$('over').hidden=false;
 const T=(ms,f)=>finT.push(setTimeout(f,ms));
 const steps=[];
 // count-up with drumroll
 const N=30;for(let i=1;i<=N;i++)steps.push([300+i*40,()=>{$('rs').textContent=Math.round(sc*i/N);noise(0.03,300,0.25);}]);
 steps.push([1550,()=>{st.classList.add('on');sfx.land();if(sc>=400){sfx.pin();confetti({x:G.ball.x,z:G.ball.z},120);}else sfx.green();buzz(30);}]);
 G.list.forEach((v,i)=>steps.push([1900+i*110,()=>{$('rl').children[i].classList.add('on');tone(700+i*60,0.06,'triangle',0.08);}]));
 steps.push([3100,()=>{rst.classList.add('on');}]);
 steps.push([3400,()=>{rb.classList.add('on');if(nb){sfx.green();confetti({x:G.ball.x,z:G.ball.z},60);}}]);
 steps.push([3800,()=>{$('rbtn').classList.add('on');$('rskip').style.visibility='hidden';finDone=null;}]);
 steps.forEach(([ms,f])=>T(ms,f));
 finDone=()=>{finT.forEach(clearTimeout);finT=[];$('rs').textContent=sc;st.classList.add('on');[...$('rl').children].forEach(c=>c.classList.add('on'));rst.classList.add('on');rb.classList.add('on');
  T(400,()=>{$('rbtn').classList.add('on');$('rskip').style.visibility='hidden';});finDone=null;};}
$('over').addEventListener('pointerdown',e=>{if(finDone&&!e.target.closest('.rbtn.on'))finDone();});
/* ---------- particles ---------- */
function burst(x,y,z,n,cols,o){for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,r=Math.random()*o.sp;G.parts.push({x,y,z,vx:Math.cos(a)*r,vz:Math.sin(a)*r,vy:o.up*(0.4+Math.random()),g:o.g,life:o.life*(0.6+Math.random()*0.6),l0:o.life,c:cols[i%cols.length],s:o.size,rot:Math.random()*6});}}
function confetti(t,n){burst(t.x,3.5,t.z,n,['#ff4d4d','#ffd23f','#3d8bff','#ffffff','#ff8a1f','#7be36b','#ff7ad9'],{sp:7,up:16,g:13,life:2.4,size:0.9});}

const stage=$('stage');
$('sw').addEventListener('pointerdown',e=>{e.stopPropagation();e.preventDefault();$('sw').classList.add('press');buzz(8);down();});
addEventListener('pointerup',()=>$('sw').classList.remove('press'));addEventListener('pointercancel',()=>$('sw').classList.remove('press'));
stage.addEventListener('pointerdown',e=>{if(e.target.closest('.clubs,.ctrl'))return;e.preventDefault();down();});
addEventListener('pointerup',up);addEventListener('pointercancel',up);
stage.addEventListener('contextmenu',e=>e.preventDefault());
$('bC').onclick=()=>start('chal');
document.addEventListener('touchmove',e=>{e.preventDefault();},{passive:false});document.addEventListener('gesturestart',e=>e.preventDefault());
document.addEventListener('dblclick',e=>e.preventDefault());$('bF').onclick=()=>start('free');
$('bA').onclick=()=>start('chal');$('bT').onclick=()=>{$('over').hidden=true;$('title').hidden=false;G.phase='title';G.target=null;G.marks=[];G.wind={x:0,z:0};hud();bestText();};
$('bS').onclick=()=>{G.sound=!G.sound;$('bS').textContent='おと:'+(G.sound?'オン':'オフ');};

/* ---------- update ---------- */
function ease(t){return t<0?0:t>1?1:t*t*(3-2*t);}
let chargeTick=0;
function update(dt){
 G.flash=Math.max(0,G.flash-dt*2.5);G.shake=Math.max(0,G.shake-dt*30);G.speed=Math.max(0,G.speed-dt);G.kick=Math.max(0,G.kick-dt*3.5);
 if(G.imp){G.imp.t+=dt;if(G.imp.t>0.45)G.imp=null;}
 for(const q of G.parts){q.vy-=q.g*dt;q.x+=q.vx*dt;q.y+=q.vy*dt;q.z+=q.vz*dt;q.life-=dt;q.rot+=dt*8;if(q.y<0){q.y=0;q.vy*=-0.25;q.vx*=0.6;q.vz*=0.6;}}
 G.parts=G.parts.filter(q=>q.life>0);
 if(G.hs>0){G.hs-=dt;return;}
 const P=G.phase;
 if(P==='power'){G.p+=G.dir*dt*0.55;(G.ph=G.ph||[]).push([performance.now(),G.p]);if(G.ph.length>30)G.ph.shift();if(G.p>=1){G.p=1;G.dir=-1;}if(G.p<=0){G.p=0;G.dir=1;}chargeTick+=dt;if(chargeTick>0.09){chargeTick=0;sfx.charge(G.p);}}
 else if(P==='ring'){G.ring-=dt*RSPD;if(G.ring<G.r0-RWIN){G.ring=G.r0-RWIN;hit();}}
 if(P==='ready')ang=A0;
 else if(P==='power')ang=A0-G.p*3.0;
 else if(P==='ring')ang=A0-G.power*3.0;
 if(P==='swing'||(G.launched&&G.swT<0.6)){G.swT+=dt;const t1=0.07;
  if(G.swT<t1){const k=G.swT/t1;ang=G.aS+(A0-G.aS)*k*k;}else{ang=A0+2.5*ease((G.swT-t1)/0.38);if(!G.launched)launch();}}
 if(G.phase==='flight'){const s=G.shot;G.t+=dt;let u=G.t/s.T;if(u>=1){u=1;G.phase='roll';G.t=0;}
  G.ball={x:X(s,u),y:Y(s,u),z:Z(s,u)};G.trail.push({...G.ball});if(G.trail.length>110)G.trail.shift();if(G.phase==='roll')landFx();}
 else if(G.phase==='roll'){const s=G.shot;G.t+=dt;const v=Math.min(1,G.t/1.3);const lx=X(s,1),lz=Z(s,1),sl=(lx-X(s,0.97))/(lz-Z(s,0.97)||1);
  const r=s.roll*(1-(1-v)*(1-v));G.ball={x:lx+sl*r,y:s.apex*0.07*Math.abs(Math.sin(Math.PI*v*2))*(1-v),z:lz+r};if(v>=1)rest();}
 if(G.phase==='rest')G.restT+=dt;
 const c=G.cam,b=G.ball,active=['flight','roll','rest'].includes(G.phase);
 const tz=active?Math.max(-14,b.z-34):-14,th=active?4.5+b.y*0.6:4.5,tx=active?b.x*0.9:Math.min(1.8,W/F*2.8),k=Math.min(1,dt*(active?2.6:4));
 c.z+=(tz-c.z)*k;c.h+=(th-c.h)*k;c.x+=(tx-c.x)*k;
 setGauge();}

/* ---------- draw ---------- */
/* 背景は打席から見た練習場の写真 (range.jpg 704x1520)。カメラは打席に固定し、写真の遠近に合わせて描く。
   写真の上での値: 消える点 (VX,VY)、焦点 PF、目の高さ PH0、玉から目までの奥行き PCZ。
   玉 (0,0,0) が写真の (352,1149) = 大きいマットの上、奥のネットの足もと (約 250y) が写真の 720 あたりに来るように合わせた */
const PIC={w:704,h:1520,vx:352,vy:697,f:1520,h0:3.78,cz:-12.7};
function picK(){return Math.max(W/PIC.w,H/PIC.h);}
function pr(x,y,z){const d=z-PIC.cz;if(d<0.6)return null;const k=picK(),ox=(W-PIC.w*k)/2,oy=(H-PIC.h*k)/2,s=PIC.f*k/d;return {x:ox+PIC.vx*k+x*s,y:oy+PIC.vy*k+(PIC.h0-y)*s,s};}
const clouds=Array.from({length:5},()=>({x:Math.random(),y:0.06+Math.random()*0.2,r:30+Math.random()*40,v:0.004+Math.random()*0.006}));
const streaks=Array.from({length:26},()=>({x:Math.random(),y:Math.random(),l:0.5+Math.random()*0.8}));
function sky(t){const g=ctx.createLinearGradient(0,0,0,HY);g.addColorStop(0,'#5fb6ea');g.addColorStop(1,'#d8f0fb');ctx.fillStyle=g;ctx.fillRect(-20,-20,W+40,HY+22);
 const sg=ctx.createRadialGradient(W*0.82,H*0.08,0,W*0.82,H*0.08,H*0.25);sg.addColorStop(0,'rgba(255,250,215,.9)');sg.addColorStop(1,'rgba(255,250,215,0)');ctx.fillStyle=sg;ctx.fillRect(0,0,W,HY);
 const wx=G.wind.x*0.004;
 ctx.fillStyle='rgba(255,255,255,.9)';for(const c of clouds){const cx=(((c.x+t*(c.v+wx))%1.3+1.3)%1.3-0.15)*W,cy=c.y*H;ctx.beginPath();ctx.ellipse(cx,cy,c.r*1.6,c.r*0.55,0,0,7);ctx.ellipse(cx-c.r*0.7,cy+4,c.r*0.8,c.r*0.42,0,0,7);ctx.ellipse(cx+c.r*0.6,cy-c.r*0.2,c.r*0.8,c.r*0.5,0,0,7);ctx.fill();}
 const px=-G.cam.x*0.3;
 ctx.fillStyle='#9cc7d6';ctx.beginPath();ctx.moveTo(-20,HY);for(let x=-20;x<=W+20;x+=12){ctx.lineTo(x,HY-28-Math.sin((x+px)*0.008)*18-Math.sin((x+px)*0.021)*8);}ctx.lineTo(W+20,HY);ctx.fill();
 ctx.fillStyle='#7fae8f';ctx.beginPath();ctx.moveTo(-20,HY);for(let x=-20;x<=W+20;x+=10){ctx.lineTo(x,HY-12-Math.sin((x+px*1.5)*0.013+1)*7);}ctx.lineTo(W+20,HY);ctx.fill();}
function ground(){const c=G.cam;ctx.fillStyle='#3e9a3f';ctx.fillRect(-20,HY,W+40,H-HY+20);
 const zn=c.z+0.7;let i0=Math.floor(zn/12);for(let i=i0;i*12<340;i++){const z0=Math.max(i*12,zn),z1=(i+1)*12;const a=pr(0,0,z0),b=pr(0,0,z1);if(!a||!b)continue;ctx.fillStyle=i%2?'#46a646':'#3c973c';ctx.fillRect(-20,b.y,W+40,a.y-b.y+1);}
 const far=pr(0,0,340)||{y:HY+1};
 ctx.fillStyle='#2c6f33';ctx.beginPath();ctx.moveTo(-20,HY);for(let x=-20;x<=W+20;x+=8){ctx.lineTo(x,HY-6-Math.abs(Math.sin(x*0.09))*7-Math.abs(Math.sin(x*0.031))*6);}ctx.lineTo(W+20,far.y);ctx.lineTo(-20,far.y);ctx.fill();
 for(const sx of [-60,60]){const a=pr(sx,0,zn),b=pr(sx,0,340);if(!a||!b)continue;const e=sx<0?-W*4:W*5;ctx.fillStyle='rgba(20,60,20,.28)';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(e,b.y);ctx.lineTo(e,a.y);ctx.fill();}}
function greens(){for(const t of [...TG].sort((a,b)=>b.z-a.z)){const p=pr(t.x,0,t.z),f=pr(t.x,0,t.z+GR);if(!p||!f)continue;const n=pr(t.x,0,t.z-GR);if(!n||GR*p.s>W*3||n.y-f.y>H*3)continue;const ny=n.y;const cy=(ny+f.y)/2,ry=Math.max(1,(ny-f.y)/2),rx=GR*p.s;
  const on=G.target===t,ring=t.c;
  ctx.fillStyle=on?'rgba(160,240,140,.5)':'rgba(140,225,120,.32)';ctx.beginPath();ctx.ellipse(p.x,cy,rx,ry,0,0,7);ctx.fill();
  ctx.strokeStyle=ring;ctx.globalAlpha=on?1:.75;ctx.lineWidth=Math.max(1.5,Math.min(on?5:3,ry*0.4));ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,.7)';ctx.lineWidth=Math.max(1,Math.min(2,ry*0.2));ctx.beginPath();ctx.ellipse(p.x,cy,rx*0.45,ry*0.45,0,0,7);ctx.stroke();ctx.globalAlpha=1;}}
function marks(){for(const m of G.marks){const p=pr(m.x,0,m.z);if(!p||p.s>200)continue;const r=Math.max(2,0.6*p.s);ctx.fillStyle='rgba(255,255,255,.7)';ctx.beginPath();ctx.ellipse(p.x,p.y,r,r*0.35,0,0,7);ctx.fill();}}
function nets(){for(const sx of [-60,60]){for(let z=0;z<320;z+=40){const z1=Math.max(z,G.cam.z+1),z2=z+40;if(z2<=z1)continue;const a=pr(sx,0,z1),b=pr(sx,28,z1),c=pr(sx,28,z2),d=pr(sx,0,z2);if(!a||!d)continue;
  ctx.fillStyle='rgba(235,245,240,.13)';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.lineTo(d.x,d.y);ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,.22)';ctx.lineWidth=1;for(let h=7;h<=28;h+=7){const p=pr(sx,h,z1),q=pr(sx,h,z2);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();}}
  for(let z=320;z>=0;z-=40){const a=pr(sx,0,z),b=pr(sx,28,z);if(!a)continue;if(a.s>60)continue;ctx.strokeStyle='#5d6b66';ctx.lineWidth=Math.max(1,0.5*a.s);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}}
function sign(x,z,n){const a=pr(x,0,z);if(!a||a.s>45)return;const s=a.s,w=7*s,h=3.4*s,y=a.y-3*s;if(a.x+w/2<0||a.x-w/2>W)return;ctx.fillStyle='#55605a';ctx.fillRect(a.x-w*0.35,y,Math.max(1,0.3*s),3*s);ctx.fillRect(a.x+w*0.35,y,Math.max(1,0.3*s),3*s);
 ctx.fillStyle='#fffdf6';ctx.fillRect(a.x-w/2,y-h,w,h);ctx.fillStyle='#1d5e27';ctx.fillRect(a.x-w/2,y-h,w,h*0.18);if(h>7&&h<160){ctx.font=`800 ${h*0.62}px "M PLUS Rounded 1c",sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(n,a.x,y-h*0.42);}}
function flag(t,time){const a=pr(t.x,0,t.z);if(!a||a.s>120||a.x<-200||a.x>W+200)return;const s=a.s,top=pr(t.x,3.4,t.z);ctx.strokeStyle='#eee';ctx.lineWidth=Math.max(1,0.08*s);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(top.x,top.y);ctx.stroke();
 const wv=Math.sin(time*6+t.z)*0.15*s,fw=1.4*s*(G.wind.x<0?-1:1);
 ctx.fillStyle=t.c;ctx.strokeStyle='rgba(0,0,0,.25)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(top.x,top.y);ctx.quadraticCurveTo(top.x+fw*0.5,top.y+0.2*s+wv,top.x+fw,top.y+0.45*s);ctx.lineTo(top.x,top.y+0.9*s);ctx.fill();ctx.stroke();
 if(G.target===t&&['ready','power','ring'].includes(G.phase)){const tx=`${t.z}y`;ctx.font='800 15px "M PLUS Rounded 1c",sans-serif';const w=ctx.measureText(tx).width+16,x=top.x-w/2,y=top.y-30;
  ctx.fillStyle='rgba(12,20,15,.72)';ctx.beginPath();ctx.roundRect(x,y,w,22,6);ctx.fill();ctx.beginPath();ctx.moveTo(top.x-5,y+22);ctx.lineTo(top.x+5,y+22);ctx.lineTo(top.x,y+28);ctx.fill();
  ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(tx,top.x,y+12);}}
function mat(){const pts=[pr(-2.6,0,-1.6),pr(2.2,0,-1.6),pr(2.2,0,1.6),pr(-2.6,0,1.6)];if(pts.some(p=>!p))return;ctx.fillStyle='#24602a';ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.fill();ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=2;ctx.stroke();}
/* 打つ人は、使う人がくれた 8 ポーズの写真の切り抜き (g1〜g8: 構え・テークバック・クラブが真上・トップ・切り返し・インパクト・振り抜き・フィニッシュ)。
   構え (g1) のクラブの先を玉に重ね、ほかのポーズは前の足 (いちばん下の左はし) を同じ所にそろえる */
const GFR=[{fx:26,fy:444,hx:285,hy:412},{fx:28,fy:429},{fx:55,fy:514},{fx:27,fy:428},{fx:36,fy:417},{fx:38,fy:417},{fx:25,fy:399},{fx:46,fy:472}];
GFR.forEach((f,i)=>{f.im=new Image();f.im.src=(window.__IMG&&window.__IMG[i])||`g${i+1}.webp`;});
const GSC=0.0056;   // 玉の所の 1y あたりの点の数に掛ける。見本 (左下に小さく) に合わせ、写真の人の背丈より小さめ (前は 0.0088)
// いまのポーズ: ためている間はパワーで 構え→テークバック→真上→トップ、振ると 切り返し→インパクト→振り抜き→フィニッシュ
function poseIdx(){const ph=G.phase,bk=p=>p<0.2?0:p<0.45?1:p<0.75?2:3;
 if(ph==='power')return bk(G.p);if(ph==='ring')return bk(G.power);
 if(ph==='swing'&&!G.launched)return 4;
 if(G.launched){const t=G.swT;return t<0.16?5:t<0.28?6:7;}
 return 0;}
function golfer(){const b=pr(0,0,0);if(!b)return;const sc=b.s*GSC,A=GFR[0];
 const fx=b.x+(A.fx-A.hx)*sc,fy=b.y+(A.fy-A.hy)*sc;
 ctx.fillStyle='rgba(0,0,0,.22)';ctx.beginPath();ctx.ellipse(fx+70*sc,fy,110*sc,16*sc,0,0,7);ctx.fill();
 let i=poseIdx();if(!(GFR[i].im.complete&&GFR[i].im.naturalWidth))i=0;const f=GFR[i];
 if(f.im.complete&&f.im.naturalWidth)ctx.drawImage(f.im,fx-f.fx*sc,fy-f.fy*sc,f.im.naturalWidth*sc,f.im.naturalHeight*sc);}
function ball(){const b=G.ball,g=pr(b.x,0,b.z),p=pr(b.x,b.y,b.z);if(!p)return;const r=Math.max(2.2,0.075*p.s);
 if(g){ctx.fillStyle=`rgba(0,0,0,${0.3*Math.max(0.15,1-b.y/40)})`;ctx.beginPath();ctx.ellipse(g.x,g.y,r*1.1,r*0.4,0,0,7);ctx.fill();}
 if(b.z<1&&b.y<0.1&&g){ctx.strokeStyle='#ffe28a';ctx.lineWidth=Math.max(1,0.05*g.s);ctx.beginPath();ctx.moveTo(g.x,g.y);ctx.lineTo(p.x,p.y+r);ctx.stroke();}
 if(G.phase==='flight'&&(G.nice||G.t<0.5)){const gl=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r*4);gl.addColorStop(0,G.nice?'rgba(255,230,120,.7)':`rgba(255,255,255,${0.7*(1-G.t/0.5)})`);gl.addColorStop(1,'rgba(255,230,120,0)');ctx.fillStyle=gl;ctx.beginPath();ctx.arc(p.x,p.y,r*4,0,7);ctx.fill();}
 ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(p.x,p.y-r*0.2,r,0,7);ctx.fill();ctx.strokeStyle='rgba(0,0,0,.15)';ctx.lineWidth=1;ctx.stroke();
 if(G.phase==='rest'&&g){const k=(G.restT*1.5)%1,rr=r*2+k*r*6;ctx.strokeStyle=`rgba(255,255,255,${1-k})`;ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(g.x,g.y,rr,rr*0.4,0,0,7);ctx.stroke();}
}
function impact(){const m=G.imp;if(!m)return;const o=pr(0,0.05,0);if(!o)return;const k=Math.min(1,m.t/0.3),a=1-k,R=m.nice?1:m.miss?0.4:0.7;
 // 芯の光 (はじめが一番まぶしい)
 ctx.save();ctx.globalCompositeOperation='lighter';
 const r0=(34+60*k)*R,gl=ctx.createRadialGradient(o.x,o.y,0,o.x,o.y,r0);gl.addColorStop(0,`rgba(255,255,255,${a})`);gl.addColorStop(0.3,`rgba(255,235,150,${0.85*a})`);gl.addColorStop(1,'rgba(255,200,80,0)');
 ctx.fillStyle=gl;ctx.beginPath();ctx.arc(o.x,o.y,r0,0,7);ctx.fill();
 // 横に長い光 (ナイスのときだけ)
 if(m.nice){const lw=(160+120*k),hg=ctx.createLinearGradient(o.x-lw,0,o.x+lw,0);hg.addColorStop(0,'rgba(255,240,180,0)');hg.addColorStop(0.5,`rgba(255,255,255,${a})`);hg.addColorStop(1,'rgba(255,240,180,0)');ctx.fillStyle=hg;ctx.fillRect(o.x-lw,o.y-3*a-1,lw*2,6*a+2);}
 ctx.restore();
 // 光の筋 (星)
 if(!m.miss){ctx.strokeStyle=`rgba(255,255,255,${a})`;ctx.lineCap='round';for(let i=0;i<8;i++){const t=i/8*Math.PI*2+0.3,L=(46+95*Math.sqrt(k))*R*(i%2?0.55:1);ctx.lineWidth=(i%2?3:5.5)*a+0.5;ctx.beginPath();ctx.moveTo(o.x+Math.cos(t)*L*0.3,o.y+Math.sin(t)*L*0.3);ctx.lineTo(o.x+Math.cos(t)*L,o.y+Math.sin(t)*L);ctx.stroke();}}
 // 地面に広がる輪
 const rr=(14+120*Math.sqrt(k))*R;ctx.strokeStyle=`rgba(255,${m.nice?225:255},${m.nice?120:255},${0.9*a})`;ctx.lineWidth=6*a+1;ctx.beginPath();ctx.ellipse(o.x,o.y,rr,rr*0.32,0,0,7);ctx.stroke();}
function streak(){if(G.phase!=='flight'||G.t>0.45)return;const o=pr(0,0.05,0),p=pr(G.ball.x,G.ball.y,G.ball.z);if(!o||!p)return;const a=1-G.t/0.45;
 const g=ctx.createLinearGradient(o.x,o.y,p.x,p.y);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(1,`rgba(255,${G.nice?235:255},${G.nice?140:255},${0.9*a})`);
 ctx.strokeStyle=g;ctx.lineCap='round';ctx.lineWidth=2+10*a;ctx.beginPath();ctx.moveTo(o.x,o.y);ctx.lineTo(p.x,p.y);ctx.stroke();}
function trail(){const t=G.trail;if(t.length<2)return;const col=G.nice?'255,214,64':'255,255,255';ctx.lineCap='round';
 for(let i=1;i<t.length;i++){const a=pr(t[i-1].x,t[i-1].y,t[i-1].z),b=pr(t[i].x,t[i].y,t[i].z);if(!a||!b)continue;const k=i/t.length;ctx.strokeStyle=`rgba(${col},${0.85*k})`;ctx.lineWidth=Math.max(1,Math.min(G.nice?7:5,b.s*(G.nice?0.09:0.06)))*(0.4+0.6*k);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}
function aimLine(time){if(!['ready','power','ring'].includes(G.phase))return;const a=G.aim,zEnd=G.target?G.target.z:160;
 for(let z=4;z<zEnd;z+=z<40?3:6){const p=pr(a*z,0,z);if(!p)continue;const ph=((z*0.15-time*3)%1+1)%1;const r=Math.min(30,Math.max(1.6,0.25*p.s));ctx.fillStyle=`rgba(255,255,255,${0.45+0.5*ph})`;ctx.beginPath();ctx.ellipse(p.x,p.y,r,r*0.4,0,0,7);ctx.fill();}
 const e=pr(a*zEnd,0,zEnd);if(e){const rr=Math.max(6,4*e.s);ctx.strokeStyle='#fff';ctx.lineWidth=2.5;ctx.beginPath();ctx.ellipse(e.x,e.y,rr,rr*0.35,0,0,7);ctx.stroke();ctx.beginPath();ctx.moveTo(e.x,e.y-rr*0.35);ctx.lineTo(e.x,e.y-rr*1.4);ctx.stroke();}}
function windFx(dt){const w=G.wind,m=Math.hypot(w.x,w.z);if(m<0.1||G.phase==='title')return;const vx=w.x*0.05,vy=-w.z*0.02;ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=2;ctx.lineCap='round';
 for(const s of streaks){s.x+=vx*dt*(0.6+s.l);s.y+=vy*dt*(0.6+s.l);if(s.x>1.1)s.x-=1.2;if(s.x<-0.1)s.x+=1.2;if(s.y>1.1)s.y-=1.2;if(s.y<-0.1)s.y+=1.2;
  const x=s.x*W,y=s.y*H*0.75,L=(10+m*10)*s.l,n=Math.hypot(vx,vy)||1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-vx/n*L,y-vy/n*L);ctx.stroke();}}
function parts(){for(const q of G.parts){const p=pr(q.x,q.y,q.z);if(!p)continue;if(p.x<-50||p.x>W+50||p.y<-50||p.y>H+50)continue;const sz=Math.min(40,Math.max(2,q.s*p.s));ctx.globalAlpha=Math.min(1,q.life/(q.l0*0.4));ctx.fillStyle=q.c;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(q.rot);ctx.fillRect(-sz/2,-sz/4,sz,sz/2);ctx.restore();}ctx.globalAlpha=1;}
function speedLines(){if(G.speed<=0)return;const a=Math.min(1,G.speed/0.6);ctx.strokeStyle=`rgba(255,255,255,${0.5*a})`;ctx.lineWidth=3;const o=pr(0,0,0)||{x:W/2,y:H*0.6},cx=o.x,cy=o.y;
 for(let i=0;i<22;i++){const t=i/22*Math.PI*2+i,r1=Math.max(W,H)*(0.35+0.1*Math.sin(i*7)),r2=r1+60+40*a;ctx.beginPath();ctx.moveTo(cx+Math.cos(t)*r1,cy+Math.sin(t)*r1);ctx.lineTo(cx+Math.cos(t)*r2,cy+Math.sin(t)*r2);ctx.stroke();}}
function placeDial(){const d=$('dial'),ph=G.phase,show=['ready','power','ring'].includes(ph)||(ph==='swing')||(ph==='flight'&&G.t<0.35);
 setCls(d,'hide',!show);if(!show)return;const sz=150;setA(d,'--ds',sz+'px');
 const b=pr(0,0,0);if(!b)return;setA(d,'left',Math.round(W-sz/2-24)+'px');setA(d,'top',Math.round(Math.min(H-sz/2-250,b.y-sz*0.55))+'px');}
const bgEl=$('bg');let bgLast='';
function camBg(sx,sy,z,o){const v=(sx||sy||z>1.0005)?`translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) scale(${z.toFixed(4)})`:'';const tag=v+'|'+Math.round(o.x)+','+Math.round(o.y);if(tag===bgLast)return;bgLast=tag;
 bgEl.style.transformOrigin=`${o.x}px ${o.y}px`;bgEl.style.transform=v;}
let T0=performance.now(),TT=0;
function frame(now){requestAnimationFrame(frame);if(document.hidden){T0=now;return;}const dt=Math.min(0.05,Math.max(0,(now-T0)/1000));T0=now;TT+=dt;try{update(dt);placeDial();}catch(e){console.error(e);}
 ctx.setTransform(DPR,0,0,DPR,0,0);ctx.clearRect(0,0,W,H);ctx.globalAlpha=1;ctx.shadowBlur=0;ctx.save();try{
 // ゆれと寄り: canvas と写真 (#bg) を同じだけ動かす (canvas だけ動かすと写真の上で絵がずれて見えるだけになる)
 const sx=G.shake>0?(Math.random()-0.5)*G.shake:0,sy=G.shake>0?(Math.random()-0.5)*G.shake:0,z=1+0.07*G.kick*G.kick,o=pr(0,0,0)||{x:W/2,y:H/2};
 ctx.translate(sx+o.x,sy+o.y);ctx.scale(z,z);ctx.translate(-o.x,-o.y);camBg(sx,sy,z,o);
 greens();marks();aimLine(TT);
 const objs=[];
 for(const t of TG)objs.push({z:t.z,f:()=>flag(t,TT)});objs.push({z:0.01,f:golfer});objs.push({z:G.ball.z,f:()=>{trail();streak();ball();}});
 objs.sort((a,b)=>b.z-a.z).forEach(o=>o.f());impact();parts();windFx(dt);speedLines();
 }catch(e){console.error(e);}finally{ctx.restore();}
 if(G.flash>0){ctx.fillStyle=`rgba(255,255,240,${Math.min(0.8,G.flash)})`;ctx.fillRect(0,0,W,H);}
 }
buildClubs();hud();bestText();setGauge();requestAnimationFrame(frame);
clearRun();
// テストから中身をのぞく入口
window.__app={G,CLUBS,TG,pr,GFR,poseIdx,GSC,sfx,tone,noise,resetAudio(){AC=null;NB=null;live=0;},get audio(){return AC;},get size(){return {W,H};},get save(){return save;}};

}

// オフラインでも開けるように (ネット優先)
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
