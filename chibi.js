/* 圓潤 Q 版人物（換裝＋動作），之後線上動物園、緬懷地圖都可共用。
   用法：
     import { makeChibi, poseChibi, setHand, DEFAULT_LOOK } from './chibi.js';
     const p = makeChibi(THREE, look);  scene.add(p);
     每一格：poseChibi(p, dt, 動作名, 動作經過秒數);
     換手上的東西（買飲料、丟垃圾、收進背包…）：setHand(p, 'drink' | 'chips' | 'balloon' | 'lot' | 'none', { empty })
   look 的欄位見 DEFAULT_LOOK。
   動作：idle walk wave jump pray bow lot sit photo drink eat
   規則：手上拿著東西時，走路、跳、揮手（改用左手）、坐下、鞠躬都會繼續拿著；
        合掌、拍照、拿籤要空手（由頁面先檢查）；拍照是把掛在胸前的相機拿起來。 */

export const DEFAULT_LOOK = {
  size: 'adult',              // adult | kid
  skin: '#f2c9a8',
  hairStyle: 'short',         // short bob twin pony bun spiky long
  hairColor: '#4e3322',
  top: '#d9534a', bottom: '#4a8fd6', shoes: '#f4f1ea',
  hat: 'none', hatColor: '#4f7d44',          // none cap bucket straw beanie
  eyewear: 'none', eyewearColor: '#2b2b2b',  // none glasses sunglasses
  hold: 'none', holdColor: '#f2a65a',        // 手上拿的：none drink chips balloon lot
  camera: false, cameraColor: '#34373d',     // 相機配件：掛在胸前，拍照時才拿起來
  bag: 'none', bagColor: '#ef6f61',          // none backpack shoulder monkey（防猴包＝束口袋背包）
  badge: false, boots: false, cardigan: false, mouth: 'smile',
};

export function makeChibi(THREE, lookIn) {
  const o = { ...DEFAULT_LOOK, ...lookIn };
  if (o.hold === 'camera') { o.camera = true; o.hold = 'none'; }   // 舊設定相容
  /* ---------- 材質：三階卡通明暗＋細輪廓 ---------- */
  const grad = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
  const toon = c => new THREE.MeshToonMaterial({ color: c, gradientMap: grad });
  const outlineMat = new THREE.MeshBasicMaterial({ color: '#4a3426', side: THREE.BackSide });
  function part(geo, color, { outline = .018 } = {}) {
    const g = new THREE.Group(); const m = new THREE.Mesh(geo, toon(color)); m.castShadow = true; g.add(m);
    if (outline) { geo.computeBoundingSphere(); const ol = new THREE.Mesh(geo, outlineMat); ol.scale.setScalar(1 + outline / Math.max(.05, geo.boundingSphere.radius)); g.add(ol); }
    return g;
  }
  const sph = (r, w = 32, h = 24) => new THREE.SphereGeometry(r, w, h);
  const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 8, 20);
  // 半球殼：phi=90° 是正前方；gapFront＝前面留的開口（弧度）
  const shell = (r, gapFront, thetaStart, thetaLen) => new THREE.SphereGeometry(r, 40, 20, Math.PI / 2 + gapFront / 2, Math.PI * 2 - gapFront, thetaStart, thetaLen);

  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const S = o.size === 'kid' ? .84 : 1; body.scale.setScalar(S);

  /* ---------- 腿 ---------- */
  const legs = [];
  [-1, 1].forEach(s => {
    const hip = new THREE.Group(); hip.position.set(s * .13, .42, 0); body.add(hip);
    const leg = part(cap(.085, .16), o.bottom); leg.position.y = -.16; hip.add(leg);
    const shoe = part(sph(.12, 24, 16), o.shoes); shoe.scale.set(1, .7, 1.35); shoe.position.set(0, -.33, .04); hip.add(shoe);
    if (o.boots) { const b = part(new THREE.CylinderGeometry(.1, .11, .16, 20), o.shoes); b.position.y = -.26; hip.add(b); }
    legs.push(hip);
  });

  /* ---------- 身體（圓豆子） ---------- */
  const torso = new THREE.Group(); torso.position.y = .58; body.add(torso);
  const tb = part(sph(.27), o.top); tb.scale.set(1, 1.05, .85); torso.add(tb);
  const belly = part(sph(.25, 32, 16), o.bottom, { outline: .012 }); belly.scale.set(1.02, .45, .88); belly.position.y = -.16; torso.add(belly);
  if (o.apron) {   // 圍裙（小賣店店員）：包住胸口到肚子的前片＋掛脖子的細帶
    const ap = part(new THREE.CylinderGeometry(.268, .282, .46, 22, 1, true, -.72, 1.44), o.apron, { outline: 0 }); ap.position.y = -.1; ap.children[0].material = ap.children[0].material.clone(); ap.children[0].material.side = THREE.DoubleSide; torso.add(ap);
    const st = part(new THREE.TorusGeometry(.13, .012, 6, 20, Math.PI), shade(o.apron, -.15), { outline: .004 }); st.position.set(0, .14, .08); st.rotation.x = -.5; torso.add(st); }
  if (o.cardigan) [-1, 1].forEach(s => { const p = part(new THREE.BoxGeometry(.07, .36, .03), shade(o.top, -.18), { outline: .006 }); p.position.set(s * .09, 0, .225); p.rotation.y = s * .3; torso.add(p); });
  if (o.badge) { const b = part(new THREE.BoxGeometry(.09, .06, .02), '#f4efe2', { outline: .004 }); b.position.set(.11, .08, .23); torso.add(b); }

  /* ---------- 背帶：直接「畫」在身體表面（貼著身體的曲面帶子），不會浮在外面或穿進身體 ----------
     x0＝帶子在身體左右的位置；w＝寬度；phiFrom～phiTo＝從背後(-90°)經過肩膀(0°)到前面(90°)的範圍 */
  function strap(x0, w, phiFrom, phiTo, color, q) {
    const r = .277, t0 = Math.acos(Math.max(-1, Math.min(1, x0 / r)));
    const geo = new THREE.SphereGeometry(r, 56, 2, phiFrom, phiTo - phiFrom, t0 - w / 2 / r, w / r); geo.rotateZ(-Math.PI / 2);
    const mat = toon(color); mat.side = THREE.DoubleSide; mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2;
    const inner = new THREE.Group(); if (q) inner.quaternion.copy(q); inner.add(new THREE.Mesh(geo, mat));
    const outer = new THREE.Group(); outer.scale.set(1, 1.05, .85); outer.add(inner); torso.add(outer); return outer;
  }
  const BC = o.bagColor, BD = shade(BC, -.22);
  if (o.bag === 'backpack') {       // 後背包：圓角包身＋前口袋＋提把，兩條背帶畫在肩上
    const b = part(sph(.2, 28, 20), BC); b.scale.set(.8, .88, .45); b.position.set(0, -.03, -.29); torso.add(b);
    const pk = part(sph(.12, 20, 14), BD, { outline: .008 }); pk.scale.set(.95, .62, .38); pk.position.set(0, -.1, -.36); torso.add(pk);
    const hd = part(new THREE.TorusGeometry(.045, .012, 8, 16, Math.PI), BD, { outline: 0 }); hd.position.set(0, .14, -.29); torso.add(hd);
    [-1, 1].forEach(s => strap(s * .11, .055, -Math.PI / 2 - .3, Math.PI / 2 + .55, BD));
  }
  if (o.bag === 'shoulder') {       // 斜背包：包包掛在右腰側、貼著身體（正面朝外前方）；背帶從包包斜過胸前、繞過左肩、從背後繞回包包
    const g = new THREE.Group(); g.position.set(.27, -.29, .07); g.rotation.set(0, 1.0, -.05); torso.add(g);
    g.add(part(new THREE.BoxGeometry(.16, .13, .06), BC, { outline: .008 }));
    const flap = part(new THREE.BoxGeometry(.165, .065, .065), BD, { outline: 0 }); flap.position.y = .035; g.add(flap);
    const btn = part(sph(.012, 8, 6), '#f4f1ea', { outline: 0 }); btn.position.set(0, .01, .034); g.add(btn);
    const pts = [[.23, -.225, .14], [.18, -.15, .2], [.1, -.05, .235], [.02, .05, .238], [-.08, .14, .2], [-.14, .23, .1], [-.13, .26, -.02], [-.08, .2, -.17], [0, .08, -.245], [.1, -.06, -.235], [.19, -.17, -.17], [.26, -.235, -.07], [.3, -.225, .0]]
      .map(a => new THREE.Vector3(...a));
    torso.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, .015, 6), toon(BD)));
  }
  if (o.bag === 'monkey') {         // 防猴包：束口袋背包，袋口拉緊、兩條細繩畫在肩上，背後有「不給猴子」小貼片
    const b = part(sph(.2, 28, 20), BC); b.scale.set(.82, 1, .42); b.position.set(0, -.04, -.3); torso.add(b);
    const neck = part(new THREE.CylinderGeometry(.035, .09, .08, 20), BC, { outline: .006 }); neck.position.set(0, .17, -.3); torso.add(neck);
    const knot = part(new THREE.TorusGeometry(.04, .014, 8, 20), BD, { outline: 0 }); knot.rotation.x = Math.PI / 2; knot.position.set(0, .2, -.3); torso.add(knot);
    [-1, 1].forEach(s => { const t = part(sph(.022, 10, 8), BD, { outline: 0 }); t.position.set(s * .04, .13, -.39); torso.add(t); });
    const patch = new THREE.Mesh(new THREE.CircleGeometry(.075, 32), new THREE.MeshBasicMaterial({ map: monkeyPatchTex(THREE), transparent: true }));
    patch.position.set(0, -.06, -.386); patch.rotation.y = Math.PI; torso.add(patch);
    [-1, 1].forEach(s => strap(s * .09, .026, -Math.PI / 2 - .25, Math.PI / 2 + .3, BD));
  }

  /* ---------- 手（右手拿東西） ---------- */
  const arms = [], hands = [];
  [-1, 1].forEach(s => {
    const sh = new THREE.Group(); sh.position.set(s * .25, .12, 0); torso.add(sh);
    let arm; if (o.sleeve === 'short') {   // 短袖：上面一小截衣服色，下面露出膚色手臂
      arm = new THREE.Group(); const sl = part(cap(.078, .05), o.top); sl.position.y = .045; arm.add(sl); const sk = part(cap(.06, .12), o.skin, { outline: .008 }); sk.position.y = -.025; arm.add(sk);
    } else arm = part(cap(.07, .14), o.top);
    arm.position.y = -.12; sh.add(arm);           // 袖子（衣服色，長度固定）
    const fore = part(new THREE.CylinderGeometry(.055, .055, 1, 16), o.skin, { outline: .006 }); fore.visible = false; sh.add(fore);   // 伸手時才出現的膚色前臂
    const hand = new THREE.Group(); hand.position.y = -.27; sh.add(hand);
    hand.add(part(sph(.075, 20, 14), o.skin));
    sh.userData.base = new THREE.Vector3(s * .25, .12, 0);
    sh.rotation.z = s * .18; arms.push(sh); hands.push(hand);
  });
  // 吃洋芋片時，左手捏著的一小片
  const chipBit = part(sph(.04, 12, 8), '#f3c75a', { outline: .004 }); chipBit.scale.set(1, .35, .8); chipBit.position.set(0, .02, .07); chipBit.visible = false; hands[0].add(chipBit);

  /* ---------- 頭 ---------- */
  const head = new THREE.Group(); head.position.y = 1.12; body.add(head);
  const skull = part(sph(.42, 40, 32), o.skin, { outline: .02 }); skull.scale.set(1.05, .97, 1); head.add(skull);
  // 耳朵：頭兩側的小圓耳，內側淡粉
  [-1, 1].forEach(s => {
    const ear = part(sph(.085, 20, 16), o.skin, { outline: .012 }); ear.scale.set(.55, 1, .8); ear.position.set(s * .43, -.02, -.01); ear.rotation.y = s * .25; head.add(ear);
    const inner = new THREE.Mesh(sph(.05, 16, 12), toon(shade(o.skin, -.12))); inner.scale.set(.35, .85, .6); inner.position.set(s * .462, -.02, .005); head.add(inner);
  });
  const face = new THREE.Mesh(new THREE.SphereGeometry(.425, 40, 24, Math.PI * .25, Math.PI * .5, Math.PI * .3, Math.PI * .42),
    new THREE.MeshBasicMaterial({ map: faceTex(THREE, o), transparent: true, depthWrite: false }));
  face.scale.set(1.05, .97, 1); head.add(face);
  const eyes = [];
  [-1, 1].forEach(s => {
    const e = new THREE.Group(); e.position.set(s * .15, 0, .38); e.rotation.y = s * -.18; head.add(e);
    const pupil = new THREE.Mesh(sph(.06, 20, 16), new THREE.MeshBasicMaterial({ color: '#2a1d18' })); pupil.scale.set(.85, 1.15, .45); e.add(pupil);
    const hl = new THREE.Mesh(sph(.02, 12, 8), new THREE.MeshBasicMaterial({ color: '#fff' })); hl.position.set(.02, .03, .03); e.add(hl);
    const hl2 = new THREE.Mesh(sph(.01, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff' })); hl2.position.set(-.018, -.025, .03); e.add(hl2);
    eyes.push(e);
  });

  /* ---------- 頭髮 ---------- */
  const H = o.hairColor, hairRoot = new THREE.Group(); head.add(hairRoot);
  const hairCap = part(new THREE.SphereGeometry(.445, 40, 24, 0, Math.PI * 2, 0, Math.PI * .52), H, { outline: .02 }); hairCap.scale.set(1.06, 1, 1.02); hairCap.rotation.x = -.32; hairRoot.add(hairCap);
  if (o.hairStyle !== 'spiky') for (let k = -2; k <= 2; k++) { const b = part(sph(.12, 16, 12), H, { outline: 0 }); b.scale.set(1, .7, .6); b.position.set(k * .12, .22 - Math.abs(k) * .03, .33 - Math.abs(k) * .04); hairRoot.add(b); }
  if (o.hairStyle === 'bob') { const b = part(shell(.46, 1.5, Math.PI * .3, Math.PI * .42), H); b.scale.set(1.06, 1.02, 1.04); hairRoot.add(b); }
  if (o.hairStyle === 'long') { const b = part(shell(.46, 1.6, Math.PI * .3, Math.PI * .62), H); b.scale.set(1.06, 1.05, 1.04); b.position.y = -.04; hairRoot.add(b); }
  // 雙馬尾：綁在耳朵的後上方，往後下垂，不遮耳朵
  if (o.hairStyle === 'twin') [-1, 1].forEach(s => { const t = part(sph(.14, 20, 16), H); t.scale.set(.75, 1.2, .8); t.position.set(s * .4, .02, -.27); t.rotation.z = s * .25; hairRoot.add(t); const tie = part(sph(.05, 12, 10), '#ef6f61', { outline: 0 }); tie.position.set(s * .36, .16, -.22); hairRoot.add(tie); });
  if (o.hairStyle === 'pony') { const k = part(sph(.07, 12, 10), '#ef6f61', { outline: 0 }); k.position.set(0, .2, -.42); hairRoot.add(k); const t = part(cap(.1, .22), H); t.position.set(0, -.02, -.5); t.rotation.x = .35; hairRoot.add(t); }
  if (o.hairStyle === 'bun') { const b = part(sph(.16, 20, 16), H); b.position.set(0, .36, -.18); hairRoot.add(b); }
  if (o.hairStyle === 'spiky') for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; const c = part(new THREE.ConeGeometry(.08, .2, 10), H, { outline: 0 }); c.position.set(Math.sin(a) * .2, .4, Math.cos(a) * .2 - .05); c.rotation.set(Math.cos(a) * .6, 0, -Math.sin(a) * .6); hairRoot.add(c); }
  if (o.hat !== 'none') hairRoot.children.forEach(c => { if (c.position.y > .3) c.visible = false; });   // 戴帽子時，頭頂的髮髻、刺刺藏起來

  /* ---------- 帽子：都比「頭＋頭髮」大一圈，罩在頭上；帽緣壓在瀏海上方 ---------- */
  const HC = o.hatColor;
  let headR = .5;   // 給氣球判斷「頭有多大」
  if (o.hat !== 'none') {
    const hatG = new THREE.Group(); hatG.rotation.x = -.06; head.add(hatG);
    const R0 = .5, SX = 1.06, SY = .98, SZ = 1.04;
    const dome = (th, color) => { const d = part(new THREE.SphereGeometry(R0, 40, 20, 0, Math.PI * 2, 0, th), color, { outline: .016 }); d.scale.set(SX, SY, SZ); d.children[0].material.side = THREE.DoubleSide; hatG.add(d); return d; };
    const rimY = th => R0 * Math.cos(th) * SY, rimR = th => R0 * Math.sin(th);
    // 帽子質感：貼圖只畫明暗（底色淺灰、縫線白色），顏色由 hatColor 決定
    const texMat = (tex, color) => new THREE.MeshToonMaterial({ color, gradientMap: grad, map: tex, side: THREE.DoubleSide });
    if (o.hat === 'cap') {          // 棒球帽：六片布拼成的圓頂（縫線＋透氣孔＋斜紋布）＋月牙形帽簷（車縫線）＋頂扣
      const th = Math.PI * .38; dome(th, HC).children[0].material = texMat(capDomeTex(THREE), shade(HC, .14));
      const rIn = rimR(th) - .035, a = 1.2, shp = new THREE.Shape();
      const out = t => [Math.sin(t) * (rIn + .05), Math.cos(t) * (rIn + .3)], inn = t => [Math.sin(t) * rIn, Math.cos(t) * rIn];
      shp.moveTo(...out(-a)); for (let i = 1; i <= 24; i++) shp.lineTo(...out(-a + 2 * a * i / 24));
      for (let i = 0; i <= 24; i++) shp.lineTo(...inn(a - 2 * a * i / 24));
      const geo = new THREE.ExtrudeGeometry(shp, { depth: .028, bevelEnabled: false }); geo.rotateX(Math.PI / 2);
      const brimG = new THREE.Group(); brimG.scale.set(SX, 1, SZ); brimG.position.y = rimY(th) + .06; brimG.rotation.x = .12; hatG.add(brimG);   // 帽簷往前斜，所以整片抬高一點，前緣才會貼著帽緣、不露出頭髮
      const sweat = new THREE.Group(); sweat.scale.set(SX, 1, SZ); sweat.position.y = rimY(th) + .005; hatG.add(sweat);
      const sb = part(new THREE.TorusGeometry(rimR(th) + .004, .022, 8, 64), shade(HC, -.2), { outline: 0 }); sb.rotation.x = Math.PI / 2; sweat.add(sb);   // 帽緣一圈，蓋住帽頂與帽簷的接縫
      const brim = part(geo, shade(HC, -.28), { outline: .006 }); brim.children[0].material = texMat(capBrimTex(THREE, rIn, a), shade(HC, -.16)); brimG.add(brim);
      const btn = part(sph(.035, 12, 10), shade(HC, -.12), { outline: 0 }); btn.position.set(0, R0 * SY + .01, 0); hatG.add(btn);
    }
    if (o.hat === 'beanie') {       // 毛帽：針織紋路的圓頂＋直條羅紋反折邊＋毛茸茸的毛球
      const th = Math.PI * .42; dome(th, HC).children[0].material = texMat(knitTex(THREE, 30, 7), shade(HC, .12));
      const rimG = new THREE.Group(); rimG.scale.set(SX, 1, SZ); rimG.position.y = rimY(th); hatG.add(rimG);
      const rim = part(new THREE.TorusGeometry(rimR(th), .06, 12, 64), shade(HC, -.12), { outline: .008 }); rim.rotation.x = Math.PI / 2; rim.children[0].material = texMat(ribTex(THREE), shade(HC, 0)); rimG.add(rim);
      const pg = new THREE.IcosahedronGeometry(.09, 3), pa = pg.attributes.position, v = new THREE.Vector3();
      for (let k = 0; k < pa.count; k++) { v.fromBufferAttribute(pa, k); const n = Math.sin(v.x * 97) * Math.cos(v.y * 83) * Math.sin(v.z * 71); v.multiplyScalar(1 + .13 * n); pa.setXYZ(k, v.x, v.y, v.z); }
      pg.computeVertexNormals();
      const pom = part(pg, shade(HC, .3), { outline: .006 }); pom.position.y = R0 * SY + .05; hatG.add(pom);
    }
    if (o.hat === 'bucket') {       // 漁夫帽：帆布質感的圓頂（頂部、下緣車縫線）＋一圈往下斜、一圈圈車縫線的帽簷
      const th = Math.PI * .36; headR = .68;   // 漁夫帽：不要圓頂，改成稍微收口的筒狀帽頂＋微微拱起的平頂
      const r0 = rimR(th), y0 = rimY(th), yTop = .53, rTop = .37;
      const crownG = new THREE.Group(); crownG.scale.set(SX, 1, SZ); hatG.add(crownG);
      const side = part(new THREE.CylinderGeometry(rTop, r0, yTop - y0, 64, 1, true), HC, { outline: .01 }); side.position.y = (yTop + y0) / 2;
      side.children[0].material = texMat(canvasTex(THREE, [.12, .22, .9], 1024), shade(HC, .12)); crownG.add(side);
      const R = 1.0, a = Math.asin(rTop / R);
      const top = part(new THREE.SphereGeometry(R, 64, 6, 0, Math.PI * 2, 0, a), HC, { outline: 0 }); top.position.y = yTop - R * Math.cos(a);
      top.children[0].material = texMat(canvasTex(THREE, [.35, .7], 512), shade(HC, .14)); crownG.add(top);
      const seamTop = part(new THREE.TorusGeometry(rTop, .014, 6, 64), shade(HC, -.15), { outline: 0 }); seamTop.rotation.x = Math.PI / 2; seamTop.position.y = yTop; crownG.add(seamTop);
      const brimG = new THREE.Group(); brimG.scale.set(SX, 1, SZ); brimG.position.y = rimY(th) - .045; hatG.add(brimG);
      const brim = part(new THREE.CylinderGeometry(rimR(th), .66, .09, 64, 1, true), shade(HC, -.1), { outline: .008 }); brim.children[0].material = texMat(canvasTex(THREE, [.2, .4, .6, .8], 1024), shade(HC, .02)); brimG.add(brim);
      const band = part(new THREE.TorusGeometry(rimR(th), .025, 8, 48), shade(HC, -.3), { outline: 0 }); band.rotation.x = Math.PI / 2; band.position.y = .05; brimG.add(band);
    }
    if (o.hat === 'straw') {        // 草帽：圓圓高一點的帽頂＋往下彎的寬帽簷（正面看得到帽簷上緣）＋草編紋路＋紅緞帶與蝴蝶結
      const th = Math.PI * .42, YS = 1.12; headR = .8; hatG.rotation.x = -.22; hatG.position.set(0, .03, -.04);   // 往後戴一點，帽簷不遮眼睛
      const weave = (ru, rv) => new THREE.MeshToonMaterial({ color: HC, gradientMap: grad, map: strawTex(THREE, ru, rv), side: THREE.DoubleSide });
      const crown = part(new THREE.SphereGeometry(R0, 48, 20, 0, Math.PI * 2, 0, th), HC, { outline: .016 }); crown.scale.set(SX, SY * YS, SZ); crown.children[0].material = weave(14, 5); hatG.add(crown);
      const ry = R0 * Math.cos(th) * SY * YS, r0 = rimR(th);
      const prof = [[r0 - .03, .012], [r0 + .05, 0], [.57, -.015], [.63, -.045], [.67, -.085], [.69, -.12], [.7, -.135]].map(([x, y]) => new THREE.Vector2(x, y));
      const brimG = new THREE.Group(); brimG.scale.set(SX, 1, SZ); brimG.position.y = ry; hatG.add(brimG);
      const brim = part(new THREE.LatheGeometry(prof, 64), shade(HC, -.04), { outline: 0 }); brim.children[0].material = weave(40, 3); brimG.add(brim);
      const edge = part(new THREE.TorusGeometry(.7, .016, 6, 64), '#5a4630', { outline: 0 }); edge.rotation.x = Math.PI / 2; edge.position.y = -.135; brimG.add(edge);   // 帽簷收邊
      const band = part(new THREE.CylinderGeometry(r0 * 1.0, r0 * 1.04, .07, 48, 1, true), '#a8363a', { outline: 0 }); band.position.y = .045; band.children[0].material.side = THREE.DoubleSide; brimG.add(band);
      const bow = new THREE.Group(); bow.position.set(r0 * .72, .05, r0 * .72); bow.rotation.y = Math.PI / 4; brimG.add(bow);
      [-1, 1].forEach(s => { const l = part(sph(.05, 12, 10), '#a8363a', { outline: .004 }); l.scale.set(1, .6, .35); l.position.x = s * .05; l.rotation.z = s * .3; bow.add(l); });
      const knot = part(sph(.022, 10, 8), shade('#a8363a', -.2), { outline: 0 }); bow.add(knot);
    }
  }

  /* ---------- 眼鏡／太陽眼鏡 ---------- */
  if (o.eyewear !== 'none') {
    const frame = new THREE.MeshBasicMaterial({ color: o.eyewear === 'sunglasses' ? '#1b1b1b' : o.eyewearColor });
    [-1, 1].forEach(s => {
      const rimG = new THREE.Mesh(new THREE.TorusGeometry(.085, .013, 8, 24), frame); rimG.position.set(s * .15, 0, .425); rimG.rotation.y = s * -.18; head.add(rimG);
      if (o.eyewear === 'sunglasses') { const lens = new THREE.Mesh(new THREE.CircleGeometry(.085, 24), new THREE.MeshBasicMaterial({ color: o.eyewearColor === '#2b2b2b' ? '#222831' : o.eyewearColor, transparent: true, opacity: .88 })); lens.position.set(s * .15, 0, .428); lens.rotation.y = s * -.18; head.add(lens); }
      // 眼鏡腳：從鏡框外緣沿著頭的弧度往後彎一小段（貼著頭，正面看是一條順的短細線）
      const R = .448, pts = [new THREE.Vector3(s * .232, .015, .418)];
      for (let k = 0; k <= 8; k++) { const ph = .56 + k / 8 * .42; pts.push(new THREE.Vector3(s * 1.05 * R * Math.sin(ph), .015 - k * .003, R * Math.cos(ph))); }
      head.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, .011, 6), frame));
    });
    // 鼻樑：一條微微拱起的細管，兩端接到左右鏡框內緣
    const br = new THREE.CatmullRomCurve3([new THREE.Vector3(-.07, .005, .412), new THREE.Vector3(-.03, .016, .432), new THREE.Vector3(.03, .016, .432), new THREE.Vector3(.07, .005, .412)]);
    head.add(new THREE.Mesh(new THREE.TubeGeometry(br, 16, .012, 6), frame));
  }

  /* ---------- 手上的東西（放在身體座標，每格由 poseChibi 依手的位置擺好） ---------- */
  const seg = (r, color) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 6), toon(color)); body.add(m); return m; };
  const items = { drink: makeDrink(), chips: makeChips(), balloon: makeBalloon(), lot: makeLot() };
  Object.values(items).forEach(g => { g.visible = false; body.add(g); });
  function makeDrink() { const g = new THREE.Group(); const cup = part(new THREE.CylinderGeometry(.065, .05, .17, 20), '#fdf7ee', { outline: .006 }); g.add(cup);
    const tea = part(new THREE.CylinderGeometry(.062, .052, .1, 20), o.hold === 'drink' ? o.holdColor : '#c8935e', { outline: 0 }); tea.position.y = -.025; g.add(tea);
    const lid = part(new THREE.SphereGeometry(.066, 20, 8, 0, Math.PI * 2, 0, Math.PI * .5), '#ffffff', { outline: 0 }); lid.position.y = .085; g.add(lid);
    const straw = part(new THREE.CylinderGeometry(.012, .012, .16, 8), '#ef6f61', { outline: 0 }); straw.position.set(.015, .16, 0); straw.rotation.z = -.15; g.add(straw);
    g.userData.tea = tea; return g; }
  function makeChips() { const g = new THREE.Group(); const c = o.hold === 'chips' ? o.holdColor : '#d9534a';
    const side = toon(c), front = new THREE.MeshToonMaterial({ map: chipsTex(THREE, c), gradientMap: grad });
    const geo = new THREE.BoxGeometry(.2, .24, .06); const m = new THREE.Mesh(geo, [side, side, side, side, front, side]); m.castShadow = true; g.add(m);
    const ol = new THREE.Mesh(geo, outlineMat); ol.scale.set(1.05, 1.04, 1.12); g.add(ol);
    [-1, 1].forEach(s => { const cr = part(new THREE.BoxGeometry(.21, .025, .03), shade(c, -.25), { outline: 0 }); cr.position.y = s * .125; g.add(cr); });
    return g; }
  function makeBalloon() { const g = new THREE.Group();
    const string = new THREE.Mesh(new THREE.CylinderGeometry(.005, .005, 1, 4), new THREE.MeshBasicMaterial({ color: '#7a6f60' })); g.add(string);
    const ball = part(sph(.2, 24, 18), o.hold === 'balloon' ? o.holdColor : '#ef6f61', { outline: .012 }); ball.scale.set(1, 1.15, 1); g.add(ball);
    const knot = part(new THREE.ConeGeometry(.03, .04, 8), o.hold === 'balloon' ? o.holdColor : '#ef6f61', { outline: 0 }); knot.position.y = -.235; knot.rotation.x = Math.PI; ball.add(knot);
    g.userData = { string, ball }; return g; }
  function makeLot() { const g = new THREE.Group(); const stick = part(new THREE.BoxGeometry(.04, .36, .012), '#e3c48f', { outline: .004 }); stick.position.y = .14; g.add(stick);
    const tip = part(new THREE.BoxGeometry(.042, .07, .014), '#c0392b', { outline: 0 }); tip.position.y = .3; g.add(tip); return g; }

  /* ---------- 相機配件：掛在胸前，帶子繞過脖子 ---------- */
  const cam = new THREE.Group(); body.add(cam); cam.visible = !!o.camera;
  cam.add(part(new THREE.BoxGeometry(.18, .11, .08), o.cameraColor, { outline: .006 }));
  { const l = part(new THREE.CylinderGeometry(.04, .04, .06, 16), '#55585f', { outline: 0 }); l.rotation.x = Math.PI / 2; l.position.z = .06; cam.add(l);
    const f = part(new THREE.BoxGeometry(.035, .025, .02), '#f4f1ea', { outline: 0 }); f.position.set(-.05, .065, 0); cam.add(f); }
  const camAnchor = new THREE.Object3D(); camAnchor.position.set(0, -.05, .27); torso.add(camAnchor);
  const neckAnchors = [-1, 1].map(s => { const a = new THREE.Object3D(); a.position.set(s * .1, .24, .08); torso.add(a); return a; });
  const camStraps = [0, 1].map(() => { const m = seg(.01, '#3a3530'); m.visible = !!o.camera; return m; });

  root.traverse(x => { if (x.isMesh && x.material !== outlineMat && !x.material.transparent) x.castShadow = true; });
  root.userData = { faceMesh: face, faceBase: face.material.map, faceOpen: faceTex(THREE, { ...o, mouth: 'open' }), THREE, body, torso, head, arms, hands, legs, eyes, items, chipBit, cam, camAnchor, neckAnchors, camStraps,
    hasCam: !!o.camera, headR, armOut: o.bag === 'shoulder' ? .3 : .18, hold: o.hold, empty: false, bal: null, t: Math.random() * 10, blink: 2 + Math.random() * 3, scale: S };
  return root;
}

/* ---------- 換手上的東西（買、丟、收進背包、拿出來） ---------- */
export function setHand(p, item = 'none', { empty = false, color } = {}) {
  const u = p.userData; u.hold = item; u.empty = empty; u.bal = null;
  u.items.drink.userData.tea.visible = !empty;
  if (color && item === 'drink') u.items.drink.userData.tea.children[0].material.color.set(color);
  if (color && item === 'balloon') u.items.balloon.userData.ball.children[0].material.color.set(color);
}

/* ---------- 動作：每一格呼叫一次 ---------- */
const ease = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
const lerp = (a, b, t) => a + (b - a) * t;
// 伸手：袖子長度不變，多出來的長度用膚色前臂補（ext＝多伸出的長度）
function reach(a, ext) { const fore = a.children[1], hand = a.children[2];   // 手臂零件順序：0 袖子、1 前臂、2 手掌
  fore.visible = ext > .01; fore.scale.y = Math.max(.001, ext); fore.position.y = -.27 - ext / 2 + .02; hand.position.y = -.27 - ext; }
// 上半身整塊彎（頭跟著身體轉，不會頭身分家）：繞著腰轉 a 弧度，頭再多點 extra
const TORSO_Y = .58, NECK = .54;
function bendUpper(u, a, extra = 0) { u.torso.rotation.x = a; u.head.position.set(0, TORSO_Y + NECK * Math.cos(a), NECK * Math.sin(a)); u.head.rotation.x = a + extra; }
// 右手拿著東西時的姿勢：[往前抬, 往內(-)／往外(+), 前臂伸出長度]
const CARRY = { drink: [-1.0, -.15, .06], chips: [-1.0, -.15, .06], lot: [-1.0, .05, .04], balloon: [-.35, .35, 0] };
function setSeg(m, a, b) { const d = b.clone().sub(a), len = d.length(); m.position.copy(a).addScaledVector(d, .5);
  m.quaternion.setFromUnitVectors(new m.position.constructor(0, 1, 0), d.multiplyScalar(1 / Math.max(1e-6, len))); m.scale.set(1, len, 1); }

// dur：一次性的動作長度（秒）。有給就「做一次」：前 0.4 秒淡入、最後 0.45 秒淡出回到待機；沒給就一直做（走路、坐著…）
// seat：'chair'／'ground'＝目前坐著（坐著時做合掌、喝飲料…，下半身維持坐姿）
export function poseChibi(p, dt, act, actT, dur = 0, seat = '') {
  const u = p.userData; u.t += dt; const T = u.t, { THREE, body, torso, head, arms, hands, legs, eyes, items } = u;
  const V = THREE.Vector3, k = ease(actT / .4) * (dur ? ease((dur - actT) / .45) : 1), hold = u.hold;
  body.position.set(0, 0, 0); body.rotation.set(0, 0, 0); body.scale.set(u.scale, u.scale, u.scale);
  torso.rotation.set(0, 0, 0); head.rotation.set(0, 0, 0); head.position.set(0, 1.12, 0);
  arms.forEach((a, i) => { a.rotation.set(0, 0, i ? u.armOut : -.18); a.position.copy(a.userData.base); reach(a, 0); });   // 背斜背包時右手平常放外面一點
  legs.forEach(l => l.rotation.set(0, 0, 0));
  Object.entries(items).forEach(([key, g]) => { g.visible = key === hold && act !== 'pray'; });
  u.chipBit.visible = false;
  // 眨眼
  u.blink -= dt; let eb = 1; if (u.blink < 0) { eb = Math.max(.08, Math.abs(u.blink + .06) / .06); if (u.blink < -.12) u.blink = 2.5 + Math.random() * 3; }
  eyes.forEach(e => e.scale.y = eb);
  const R = arms[1], L = arms[0];  // R＝+x 側（拿東西的手）。rotation.z：R 用正值往外、負值往內；L 相反
  const carry = () => { const c = CARRY[hold]; if (!c) return false; reach(R, c[2]); R.rotation.x = c[0]; R.rotation.z = c[1]; return true; };
  switch (act) {
    case 'walk': { const w = T * 8; body.position.y = Math.abs(Math.sin(w)) * .06; legs[0].rotation.x = Math.sin(w) * .7; legs[1].rotation.x = -Math.sin(w) * .7;
      L.rotation.x = -Math.sin(w) * .7; if (carry()) R.rotation.x += Math.sin(w) * .1; else R.rotation.x = Math.sin(w) * .7;
      torso.rotation.y = Math.sin(w) * .08; head.rotation.z = Math.sin(w) * .05; break; }
    case 'run': { const w = T * 13; body.position.y = Math.abs(Math.sin(w)) * .1; body.rotation.x = .12; legs[0].rotation.x = Math.sin(w) * .95; legs[1].rotation.x = -Math.sin(w) * .95;   // 小跑步：步伐快、身體微微往前傾、彈跳大一點
      L.rotation.x = -Math.sin(w) * 1.0; L.rotation.z = -.25; if (carry()) R.rotation.x += Math.sin(w) * .12; else { R.rotation.x = Math.sin(w) * 1.0; R.rotation.z = .25; }
      torso.rotation.y = Math.sin(w) * .12; head.rotation.z = Math.sin(w) * .04; break; }
    case 'wave': { const busy = hold !== 'none', W = busy ? L : R, s = busy ? -1 : 1;   // 右手拿著東西就改用左手揮
      W.rotation.z = s * ((.18 + 2.25 * k) + Math.sin(T * 10) * .25 * k); W.rotation.x = -.55 * k; head.rotation.z = -s * .1 * k; torso.rotation.z = -s * .04 * k; if (busy) carry(); break; }
    case 'jump': { const c = dur ? Math.min(.999, actT / dur) : (T * 1.3) % 1, up = Math.max(0, Math.sin(c * Math.PI * 1.2)); body.position.y = up * .55; body.scale.y = u.scale * (c < .12 ? 1 - Math.sin(c / .12 * Math.PI) * .12 : 1 + up * .06);
      if (!carry()) R.rotation.z = .2 + up * 1.9; L.rotation.z = -(.2 + up * 1.9); legs.forEach(l => l.rotation.x = -up * .4); break; }
    case 'pray':   // 合掌：肩膀往前、往內收，兩手掌在胸前碰在一起，微低頭
      [L, R].forEach((a, i) => { const s = i ? 1 : -1; a.position.set(s * (.25 - .05 * k), .12, .2 * k); a.rotation.x = -1.1 * k; a.rotation.z = -s * .4 * k + s * .18 * (1 - k); });
      bendUpper(u, .06 * k, .1 * k); break;
    case 'bow': { const b = (dur ? Math.sin(Math.min(1, actT / (dur * .85)) * Math.PI) : Math.sin(Math.min(1, (T % 3) / 1.2) * Math.PI)) * k; bendUpper(u, .6 * b, .05 * b); arms.forEach(a => a.rotation.x = .15 * b); carry(); break; }
    case 'lot':    // 拿籤：右手在臉的斜前方拿著，籤往外側、往前斜，不靠近臉
      reach(R, .08 * k); R.rotation.x = -1.3 * k; R.rotation.z = .15 * k + .18 * (1 - k);
      head.rotation.y = .22 * k; head.rotation.x = -.04 * k; body.position.y = Math.abs(Math.sin(T * 3)) * .02 * k; L.rotation.z = -.35 * k; break;
    case 'sitGround': {   // 坐在地上：屁股落地、雙腿往前伸、兩手往後撐地，輕輕晃
      { const kb = seat ? 1 : k; body.position.y = -.36 * kb; legs.forEach((l, i) => { l.rotation.x = -1.5 * kb; l.rotation.z = (i ? -1 : 1) * .12 * kb; }); }
      if (!carry()) { R.rotation.x = .55 * k; R.rotation.z = .5 * k + .18 * (1 - k); } L.rotation.x = .55 * k; L.rotation.z = -.5 * k - .18 * (1 - k);
      torso.rotation.x = -.08 * k; head.rotation.z = Math.sin(T * 1.1) * .05; head.rotation.x = .04 * k; break; }
    case 'sit':    // 坐椅子：臀部落到椅面，雙腿往前，手放膝上（拿著東西就繼續拿著）
      { const kb = seat ? 1 : k; body.position.y = -.14 * kb; legs.forEach(l => l.rotation.x = -1.45 * kb); }
      arms.forEach((a, i) => { a.rotation.x = -.75 * k; a.rotation.z = (i ? 1 : -1) * .12; });
      carry(); head.rotation.z = Math.sin(T * 1.1) * .05; head.rotation.x = -.05; break;
    case 'photo':  // 拍照：把胸前的相機拿起來，雙手拿在下巴前方
      [L, R].forEach((a, i) => { const s = i ? 1 : -1; reach(a, .1 * k); a.rotation.x = -1.35 * k; a.rotation.z = -s * .5 * k + s * .18 * (1 - k); });
      head.rotation.x = .1 * k; break;
    case 'drink': { // 喝飲料（Q 版）：杯子拿在胸前、手微微往前抬；喝的時候手抬高一點、頭往杯子低一下
      const c = dur ? Math.max(0, actT - .45) / 2.6 : (T % 2.6) / 2.6, sip = c < .35 ? Math.sin(c / .35 * Math.PI) : 0;
      carry(); R.rotation.x -= .3 * sip * k; R.rotation.z -= .2 * k;
      head.rotation.x = .12 * sip * k; L.rotation.z = -.25 * k; break; }
    case 'eat': {   // 吃洋芋片：右手拿著袋子，左手伸進袋子拿一片，送到嘴巴下方
      carry(); R.rotation.z -= .15 * k;
      const c = dur ? Math.min(1, Math.max(0, actT - .1) / (dur - .3)) : (T % 2.4) / 2.4, m = c < .25 ? 0 : c < .5 ? ease((c - .25) / .25) : c < .7 ? 1 : 1 - ease((c - .7) / .3);
      reach(L, .06 * k); L.rotation.x = lerp(-1.05, -1.7, m) * k; L.rotation.z = lerp(.5, .28, m) * k - .18 * (1 - k);
      u.chipBit.visible = c > .22 && c < .72; head.rotation.x = .08 * m * k; break; }
    case 'serve': {   // 店員遞東西：雙手往前伸出去再收回，身體微微往前
      const e = Math.sin(Math.min(1, actT / Math.max(.5, dur || 1.8)) * Math.PI);
      [L, R].forEach((a, i) => { const s = i ? 1 : -1; reach(a, .12 * e); a.rotation.x = -1.25 * e * k; a.rotation.z = -s * .25 * e + s * .18 * (1 - e); });
      bendUpper(u, .12 * e, .05 * e); break; }
    case 'talk': {   // 說話：手比劃、頭輕輕點，嘴巴一開一合（在下面換臉）
      const b = Math.sin(T * 2.2); body.scale.y = u.scale * (1 + b * .02);
      if (!carry()) { R.rotation.x = -.55 + Math.sin(T * 3.1) * .25; R.rotation.z = .35 + Math.sin(T * 2.3) * .12; }
      L.rotation.x = -.3 + Math.sin(T * 2.6 + 1) * .2; L.rotation.z = -.3;
      head.rotation.x = Math.sin(T * 4.2) * .06; head.rotation.z = Math.sin(T * 1.7) * .05; break; }
    case 'push': {   // 推推車：腳走路、雙手往前握推車把手、身體微微前傾
      const w = T * 7; body.position.y = Math.abs(Math.sin(w)) * .04; legs[0].rotation.x = Math.sin(w) * .6; legs[1].rotation.x = -Math.sin(w) * .6;
      [L, R].forEach((a, i) => { const s = i ? 1 : -1; reach(a, .05); a.rotation.x = -1.05; a.rotation.z = -s * .12; }); bendUpper(u, .12, 0); break; }
    case 'sweep': {   // 掃地：雙手往前下方握著掃把，左右掃，身體跟著扭（掃把由場景另外畫）
      const w = Math.sin(T * 3.2), b = Math.sin(T * 2.2);
      R.rotation.x = -.75; R.rotation.z = -.25 + w * .22; L.rotation.x = -.55; L.rotation.z = .35 + w * .22;
      torso.rotation.y = w * .14; bendUpper(u, .14, .04); body.scale.y = u.scale * (1 + b * .02); legs[0].rotation.x = .12; legs[1].rotation.x = -.12; break; }
    default: { const b = Math.sin(T * 2.2); body.scale.y = u.scale * (1 + b * .024); head.rotation.z = Math.sin(T * 1.1) * .04; head.position.y = 1.12 + b * .012; arms.forEach(a => a.position.y = a.userData.base.y + b * .01); carry(); }
  }
  if (u.faceMesh) { const fm = act === 'talk' && Math.sin(T * 14) > -.1 ? u.faceOpen : u.faceBase; if (u.faceMesh.material.map !== fm) u.faceMesh.material.map = fm; }   // 說話時嘴巴開合
  if (seat && act !== 'sit' && act !== 'sitGround') {
    if (seat === 'chair') { body.position.y += -.14; legs.forEach(l => l.rotation.x = -1.45); }
    else { body.position.y += -.36; legs.forEach((l, i) => { l.rotation.x = -1.5; l.rotation.z = (i ? -1 : 1) * .12; }); }
  }

  /* 道具擺位：跟著手的位置走，方向固定（杯子直立、袋子正面朝前、籤往外斜） */
  p.updateMatrixWorld(true);
  const toBody = w => body.worldToLocal(w), hp = i => toBody(hands[i].getWorldPosition(new V()));
  const rh = hp(1), it = items;
  if (it.drink.visible) { it.drink.position.set(rh.x - .02, rh.y + .05, rh.z + .08); it.drink.rotation.set(0, 0, 0); }
  if (it.chips.visible) { it.chips.position.set(rh.x - .03, rh.y + .06, rh.z + .07);
    if (u.empty) { it.chips.scale.set(.9, .7, .45); it.chips.rotation.set(0, 0, .3); } else { it.chips.scale.set(1, 1, 1); it.chips.rotation.set(0, 0, 0); } }
  if (it.lot.visible) { it.lot.position.set(rh.x + .01, rh.y - .02, rh.z + .03); it.lot.rotation.set(.25, 0, -.4); }
  // 氣球：有浮力、有阻力、繩子長度固定，碰到頭（或帽簷）會被推開，不會跟頭融在一起
  if (it.balloon.visible) {
    const hw = hands[1].getWorldPosition(new V()), sc = u.scale;
    const right = new V(1, 0, 0).applyQuaternion(p.getWorldQuaternion(new THREE.Quaternion()));
    const Ls = .95 * sc, headC = head.getWorldPosition(new V()), rr = (u.headR + .25) * sc;
    if (!u.bal) u.bal = { pos: hw.clone().addScaledVector(right, .4 * sc).add(new V(0, Ls * .9, 0)), vel: new V() };
    const B = u.bal, h = Math.min(dt, .05) / 3;
    for (let i = 0; i < 3; i++) {
      const tgt = hw.clone().addScaledVector(right, .42 * sc);
      const acc = new V(0, 6, 0).addScaledVector(B.vel, -2.4);
      acc.x += (tgt.x - B.pos.x) * 3 + Math.sin(T * .9) * .35; acc.z += (tgt.z - B.pos.z) * 3 + Math.cos(T * .7) * .2;
      B.vel.addScaledVector(acc, h); B.pos.addScaledVector(B.vel, h);
      const d = B.pos.clone().sub(hw), len = d.length();
      if (len > Ls) { d.multiplyScalar(1 / len); B.pos.copy(hw).addScaledVector(d, Ls); const vr = B.vel.dot(d); if (vr > 0) B.vel.addScaledVector(d, -vr); }
      const e = B.pos.clone().sub(headC), el = e.length();
      if (el < rr) { e.multiplyScalar(1 / el); B.pos.copy(headC).addScaledVector(e, rr); const vn = B.vel.dot(e); if (vn < 0) B.vel.addScaledVector(e, -vn); }
    }
    const { ball, string } = it.balloon.userData, bl = toBody(B.pos.clone()), hl = rh.clone();
    const dir = bl.clone().sub(hl).normalize();
    ball.position.copy(bl); ball.quaternion.setFromUnitVectors(new V(0, 1, 0), dir);
    setSeg(string, hl, bl.clone().addScaledVector(dir, -.25));
  } else u.bal = null;
  // 相機：平常掛在胸前（跟著身體彎），拍照時從胸前拿到下巴前方
  u.cam.visible = u.hasCam; u.camStraps.forEach(s => s.visible = u.hasCam);
  if (u.hasCam) {
    const rest = toBody(u.camAnchor.getWorldPosition(new V())); let pos = rest, rx = torso.rotation.x;
    if (act === 'photo') { const mid = rh.clone().add(hp(0)).multiplyScalar(.5).add(new V(0, .07, .07)); pos = rest.clone().lerp(mid, k); rx = lerp(rx, -.1, k); }
    u.cam.position.copy(pos); u.cam.rotation.set(rx, 0, 0);
    u.neckAnchors.forEach((a, i) => { const s = i ? 1 : -1; setSeg(u.camStraps[i], toBody(a.getWorldPosition(new V())), pos.clone().add(new V(s * .075, .05, -.02))); });
  }
}

/* ---------- 臉部貼圖（腮紅、嘴） ---------- */
function faceTex(THREE, o) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,130,140,.45)'; [[62, 172], [194, 172]].forEach(([x, y]) => { g.beginPath(); g.ellipse(x, y, 24, 13, 0, 0, Math.PI * 2); g.fill(); });
  g.strokeStyle = '#5a2e22'; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath();
  if (o.mouth === 'open') { g.fillStyle = '#c4483f'; g.ellipse(128, 196, 15, 12, 0, 0, Math.PI * 2); g.fill(); } else { g.arc(128, 180, 17, .2 * Math.PI, .8 * Math.PI); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/* 草編紋路：一排排編織的格紋（顏色由帽子顏色決定，這裡只畫明暗） */
function strawTex(THREE, ru, rv) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
  for (let row = 0; row < 4; row++) { const y = row * 16;
    g.fillStyle = 'rgba(150,110,50,.28)'; g.fillRect(0, y + 14, 64, 2);
    for (let k = 0; k < 4; k++) { const x = k * 16 + (row % 2) * 8; g.fillStyle = 'rgba(150,110,50,.18)'; g.fillRect(x, y + 1, 2, 13);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + 3, y + 3, 9, 3); } }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(ru, rv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
/* ---------- 帽子質感貼圖（淺灰底＋深色紋路＋白色縫線；乘上帽子顏色） ---------- */
function canvasTexOf(THREE, c, ru = 1, rv = 1) { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(ru, rv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function dashRow(g, y, w, dash = 7, gap = 5, lw = 2.5) { g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = lw; g.setLineDash([dash, gap]); g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); g.setLineDash([]); }
// 棒球帽圓頂：六片布的縫線＋兩側車縫線＋每片一個透氣孔＋斜紋布
function capDomeTex(THREE) {
  const W = 768, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#d6d6d6'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(0,0,0,.05)'; g.lineWidth = 1; for (let x = -H; x < W; x += 5) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + H, 0); g.stroke(); }
  for (let k = 0; k < 6; k++) { const x = k * W / 6;
    g.fillStyle = 'rgba(60,40,30,.35)'; g.fillRect(x - 1.5, 0, 3, H);
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2; g.setLineDash([6, 5]); [-8, 8].forEach(d => { g.beginPath(); g.moveTo(x + d, 10); g.lineTo(x + d, H); g.stroke(); }); g.setLineDash([]);
    const ex = x + W / 12; g.fillStyle = 'rgba(60,40,30,.45)'; g.beginPath(); g.arc(ex, H * .3, 6, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 2; g.stroke(); }
  dashRow(g, H - 10, W, 8, 5);
  return canvasTexOf(THREE, c);
}
// 棒球帽帽簷：貼圖座標＝帽簷形狀座標（x：-0.6～0.6、y：0～0.8），沿著帽簷外緣畫幾道車縫線
function capBrimTex(THREE, rIn, a) {
  const W = 512, H = 340, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#d6d6d6'; g.fillRect(0, 0, W, H);
  const P = (x, y) => [(x / 1.2 + .5) * W, (1 - y / .8) * H];
  g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 2.5; g.setLineDash([8, 6]);
  [.25, .45, .65, .85].forEach(f => { g.beginPath(); for (let i = 0; i <= 40; i++) { const t = -a + 2 * a * i / 40, [px, py] = P(Math.sin(t) * (rIn + .05 * f), Math.cos(t) * (rIn + .3 * f)); i ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke(); });
  g.setLineDash([]); const t = canvasTexOf(THREE, c, 1 / 1.2, 1 / .8); t.offset.set(.5, 0); return t;
}
// 毛帽針織：一欄欄的 V 字針目
function knitTex(THREE, ru, rv) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, 64, 64);
  for (let col = 0; col < 2; col++) for (let row = 0; row < 4; row++) { const cx = col * 32 + 16, cy = row * 16 + 8;
    [-1, 1].forEach(s => { g.save(); g.translate(cx + s * 6, cy); g.rotate(s * -.55); g.fillStyle = '#e6e6e6'; g.beginPath(); g.ellipse(0, 0, 5.5, 9, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(-1, -2, 2, 4, 0, 0, Math.PI * 2); g.fill(); g.restore(); }); }
  return canvasTexOf(THREE, c, ru, rv);
}
// 毛帽反折邊：直條羅紋
function ribTex(THREE) {
  const c = document.createElement('canvas'); c.width = 32; c.height = 8; const g = c.getContext('2d');
  g.fillStyle = '#a0a0a0'; g.fillRect(0, 0, 32, 8); g.fillStyle = '#e8e8e8'; g.fillRect(3, 0, 10, 8); g.fillRect(19, 0, 10, 8); g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(6, 0, 3, 8); g.fillRect(22, 0, 3, 8);
  return canvasTexOf(THREE, c, 70, 1);
}
// 漁夫帽帆布：細細的交織紋＋幾圈車縫線（rows＝在高度的哪些位置）
function canvasTex(THREE, rows, W) {
  const H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 3) { g.fillStyle = 'rgba(0,0,0,' + (y % 6 ? .04 : .07) + ')'; g.fillRect(0, y, W, 1); }
  for (let x = 0; x < W; x += 3) { g.fillStyle = 'rgba(0,0,0,' + (x % 6 ? .03 : .06) + ')'; g.fillRect(x, 0, 1, H); }
  rows.forEach(v => dashRow(g, (1 - v) * H, W, 8, 5, 3));
  return canvasTexOf(THREE, c);
}
/* 洋芋片袋子正面 */
function chipsTex(THREE, color) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 160; const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 128, 160);
  g.fillStyle = '#fff7e0'; g.beginPath(); g.ellipse(64, 70, 46, 36, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f3c75a'; g.strokeStyle = '#c99a3a'; g.lineWidth = 3;
  [[48, 66], [74, 60], [62, 84], [84, 80]].forEach(([x, y]) => { g.beginPath(); g.ellipse(x, y, 15, 10, x / 30, 0, Math.PI * 2); g.fill(); g.stroke(); });
  g.fillStyle = '#fff'; g.font = 'bold 24px "Noto Sans TC",sans-serif'; g.textAlign = 'center'; g.fillText('洋芋片', 64, 136);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/* 防猴包背後的小貼片：猴子臉＋禁止圈 */
function monkeyPatchTex(THREE) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#fff7e0'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#8b6b4e'; g.beginPath(); g.arc(64, 66, 30, 0, Math.PI * 2); g.arc(36, 64, 11, 0, Math.PI * 2); g.arc(92, 64, 11, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#eab7a3'; g.beginPath(); g.ellipse(64, 72, 20, 17, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2a1d18'; [[56, 66], [72, 66]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill(); });
  g.strokeStyle = '#d9534a'; g.lineWidth = 10; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(28, 28); g.lineTo(100, 100); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// 顏色變亮／變暗（amt：-1～1）
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = n >> 8 & 255, b = n & 255;
  const f = v => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  return '#' + [f(r), f(g), f(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}
