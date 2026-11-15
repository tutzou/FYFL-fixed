/* ===== Mods Subway : piste droite, chrono, retour lobby, SFX, noir, parametres, keyshow ===== */
(function () {
  'use strict';
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem('ssmod_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('ssmod_' + k, JSON.stringify(v)); } catch (e) {} }
  };
  var S = LS.get('settings', {});
  var DEF = { potato: false, scale: 100, fpsUnlock: false, fps: false, keyshow: true, stretch: false, resW: 1440, resH: 1080, black: true, spaceHint: true, skinPerso: false };
  try { var sk0 = JSON.parse(localStorage.getItem('ssmod_skin') || 'null'); if (sk0) S.skinPerso = !!sk0.perso; } catch (e) {}
  for (var dk in DEF) if (S[dk] === undefined) S[dk] = DEF[dk];
  function saveS() { LS.set('settings', S); }

  var ksKeys = {};
  var KS_MAP = { w: 'up1', z: 'up1', a: 'left1', q: 'left1', s: 'down1', d: 'right1', arrowup: 'up2', arrowleft: 'left2', arrowdown: 'down2', arrowright: 'right2' };
  function ksSet(e, on) {
    if (!e.isTrusted) return;
    var k = KS_MAP[(e.key || '').toLowerCase()]; if (!k || !ksKeys[k]) return;
    ksKeys[k].style.background = on ? 'rgba(255,255,255,.9)' : 'rgba(40,40,40,.85)';
    ksKeys[k].style.color = on ? '#111' : '#ddd';
  }
  window.addEventListener('keydown', function (e) { ksSet(e, true); }, true);
  window.addEventListener('keyup', function (e) { ksSet(e, false); }, true);

  /* ---------- acces aux compteurs injectes dans le wasm (ss_coin, ss_board) ---------- */
  var X = null;
  var oi = WebAssembly.instantiate;
  WebAssembly.instantiate = function () {
    return oi.apply(this, arguments).then(function (r) {
      var inst = r && (r.instance || r);
      if (inst && inst.exports && inst.exports.ss_coin) { X = inst.exports; window.__ssExports = X; try { window.dispatchEvent(new Event('ss-exports-ready')); } catch (e) {} }
      return r;
    });
  };
  function ctr(n) { try { return X && X['ss_' + n] ? X['ss_' + n].value : 0; } catch (e) { return 0; } }

  /* ---------- WebGL : piste droite + pieces/persos en noir ---------- */
  var distortLocs = new WeakSet(), vpLocProg = new WeakMap(), blackProgs = new WeakMap(), progOfShader = new WeakMap();
  var curProg = null, vsMarked = new WeakSet(), pending = new WeakMap();
  /* textures du jeu reconnues par empreinte (piece = atlas des objets, metro = atlas des trains) */
  var TEX_FP = { 'c512x512_33777_33893491': 'coin', 'c1024x1024_33779_be405dc5': 'train' };
  var texKind = new WeakMap(), boundTex = {}, activeUnit = 0x84C0;
  var custom = { coin: null, train: null, skin: null, ver: 0 };
  function fnv(u8, off, len) { var h = 2166136261 >>> 0, n = Math.min(len, 8192); for (var i = 0; i < n; i++) { h ^= u8[off + i]; h = Math.imul(h, 16777619) >>> 0; } return h.toString(16); }
  function buildCustomCanvas(kind, img) {
    var N = kind === 'train' ? 1024 : 512, c = document.createElement('canvas'); c.width = c.height = N;
    var g = c.getContext('2d');
    function flipDraw(x, y, w, h) { g.save(); g.translate(x, y + h); g.scale(1, -1); g.drawImage(img, 0, 0, w, h); g.restore(); }
    flipDraw(0, 0, N, N);                                   // tout l'atlas
    if (kind === 'coin') flipDraw(0.400 * N, 0.063 * N, 0.323 * N, 0.386 * N);   // face de la piece en entier
    return c;
  }
  function loadCustom(kind) {
    var url = LS.get('img_' + kind, null);
    if (!url) { custom[kind] = null; custom.ver++; return; }
    var im = new Image(); im.onload = function () { custom[kind] = buildCustomCanvas(kind, im); custom.ver++; }; im.src = url;
  }
  loadCustom('coin'); loadCustom('train'); loadCustom('skin');
  var BLACK_SIG = /SV_Target0\.xyz = vs_TEXCOORD1\.www \* u_xlat16_1\.xyz \+ vs_TEXCOORD1\.xyz;/;
  [window.WebGLRenderingContext, window.WebGL2RenderingContext].forEach(function (C) {
    if (!C) return;
    var P = C.prototype;
    var ss = P.shaderSource;
    P.shaderSource = function (sh, src) {
      if (BLACK_SIG.test(src) && /void main\s*\(\s*\)/.test(src)) {
        src = src.replace(/void main\s*\(\s*\)/, 'uniform mediump float _ssBlack;\nvoid ss_main_()') +
          '\nvoid main(){ ss_main_(); SV_Target0.xyz *= (1.0 - _ssBlack); }\n';
        progOfShader.set(sh, true);
      }
      else if (/gl_Position/.test(src) && /out mediump vec4 vs_COLOR0;/.test(src) && /_Distort/.test(src) && /vs_COLOR0 = vec4\(0\.0, 0\.0, 0\.0, 0\.0\);/.test(src)) vsMarked.add(sh);
      return ss.call(this, sh, src);
    };
    // programme "perso + pieces" = fragment avec la signature + vertex qui sort vs_COLOR0 (le decor ne l'a pas)
    var att = P.attachShader;
    P.attachShader = function (p, sh) {
      var f = pending.get(p) || { fs: false, vs: false };
      if (progOfShader.has(sh)) f.fs = true;
      if (vsMarked.has(sh)) f.vs = true;
      pending.set(p, f);
      if (f.fs && f.vs) blackProgs.set(p, { loc: null, val: -1, persp: false });
      return att.call(this, p, sh);
    };
    var getLoc = P.getUniformLocation;
    P.getUniformLocation = function (prog, name) {
      var loc = getLoc.call(this, prog, name);
      if (loc) {
        if (name === '_Distort' || name === '_Distort[0]') distortLocs.add(loc);
        if (name === 'hlslcc_mtx4x4unity_MatrixVP' || name === 'hlslcc_mtx4x4unity_MatrixVP[0]') vpLocProg.set(loc, prog);
      }
      return loc;
    };
    var u2fv = P.uniform2fv;
    P.uniform2fv = function (loc, data) {
      if (loc && distortLocs.has(loc)) {
        var off = arguments.length > 2 ? arguments[2] : 0;
        var len = arguments.length > 3 && arguments[3] ? arguments[3] : (data.length - off);
        var arr = Float32Array.from(data.subarray ? data.subarray(off, off + len) : Array.prototype.slice.call(data, off, off + len));
        for (var i = 0; i < arr.length; i += 2) arr[i] = 0;
        return u2fv.call(this, loc, arr);
      }
      return u2fv.apply(this, arguments);
    };
    var u2f = P.uniform2f;
    P.uniform2f = function (loc, x, y) { if (loc && distortLocs.has(loc)) x = 0; return u2f.call(this, loc, x, y); };
    var u4fv = P.uniform4fv;
    P.uniform4fv = function (loc, data) {
      if (loc) {
        var pr = vpLocProg.get(loc), bi = pr && blackProgs.get(pr);
        if (bi) { // on retient si la camera est en perspective (scene) ou orthographique (interface)
          var off = arguments.length > 2 ? arguments[2] : 0;
          bi.persp = Math.abs(data[off + 3]) + Math.abs(data[off + 7]) + Math.abs(data[off + 11]) > 1e-6;
        }
      }
      return u4fv.apply(this, arguments);
    };
    var actT = P.activeTexture, bindT = P.bindTexture;
    P.activeTexture = function (u) { activeUnit = u; return actT.call(this, u); };
    P.bindTexture = function (t, x) { if (t === this.TEXTURE_2D) boundTex[activeUnit] = x; return bindT.call(this, t, x); };
    var cts = P.compressedTexSubImage2D;
    if (cts) P.compressedTexSubImage2D = function (tg, lv, xo, yo, w, h, fmt, src, off, len) {
      try {
        var t = boundTex[activeUnit];
        if (t && lv === 0 && src && src.buffer && !texKind.has(t)) {
          var u = new Uint8Array(src.buffer, src.byteOffset, src.byteLength), o = off || 0;
          texKind.set(t, TEX_FP['c' + w + 'x' + h + '_' + fmt + '_' + fnv(u, o, len || (src.length - o))] || '');
        }
      } catch (e) {}
      return cts.apply(this, arguments);
    };
    function subTex(gl, kind) {
      var st = gl.__ssSub || (gl.__ssSub = {});
      if (!custom[kind]) return null;
      if (st[kind] && st[kind].ver === custom.ver) return st[kind].tex;
      var tex = (st[kind] && st[kind].tex) || gl.createTexture();
      var prevUnit = activeUnit, prev = boundTex[0x84C7];
      actT.call(gl, gl.TEXTURE7); bindT.call(gl, gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, custom[kind]);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      bindT.call(gl, gl.TEXTURE_2D, prev || null); actT.call(gl, prevUnit);
      st[kind] = { tex: tex, ver: custom.ver };
      return tex;
    }
    var up = P.useProgram;
    P.useProgram = function (p) { curProg = p; return up.call(this, p); };
    ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced'].forEach(function (d) {
      var f = P[d]; if (!f) return;
      P[d] = function () {
        var bi = curProg && blackProgs.get(curProg);
        var t0 = boundTex[0x84C0], kind = t0 ? texKind.get(t0) : '';
        var swap = null;
        if (kind === 'train' && custom.train) swap = subTex(this, 'train');
        else if (kind === 'coin' && custom.coin && bi) swap = subTex(this, 'coin');
        else if (bi && kind !== 'coin' && S.skinPerso && custom.skin && !noSkin && bi.persp) swap = subTex(this, 'skin');
        if (bi) {
          if (bi.loc === null) bi.loc = getLoc.call(this, curProg, '_ssBlack') || false;
          var want = (S.black && !noBlack && bi.persp && !swap) ? 1 : 0;
          if (bi.loc && bi.val !== want) { this.uniform1f(bi.loc, want); bi.val = want; }
        }
        if (!swap) return f.apply(this, arguments);
        var pu = activeUnit;
        actT.call(this, this.TEXTURE0); bindT.call(this, this.TEXTURE_2D, swap);
        var r = f.apply(this, arguments);
        bindT.call(this, this.TEXTURE_2D, t0); actT.call(this, pu);
        return r;
      };
    });
  });

  /* ---------- SFX : on garde seulement le son des pieces (et la musique) ---------- */
  var keep = new WeakMap();
  function keepBuffer(b) {
    var r = keep.get(b);
    if (r === undefined) {
      r = true;
      if (b.duration < 20) {               // effets sonores (la musique est longue)
        r = false;
        if (Math.abs(b.duration - 0.58) < 0.008) {
          var d = b.getChannelData(0), s = 0;
          for (var i = 0; i < d.length; i++) s += Math.abs(d[i]);
          var m = s / d.length; r = m > 0.029 && m < 0.038;   // son "piece"
        }
      }
      keep.set(b, r);
    }
    return r;
  }
  if (window.AudioBufferSourceNode) {
    var st0 = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function () {
      try { if (this.buffer && !keepBuffer(this.buffer)) this.disconnect(); } catch (e) {}
      return st0.apply(this, arguments);
    };
  }

  /* ---------- outils UI ---------- */
  function el(tag, css, parent, html) {
    var e = document.createElement(tag); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html;
    (parent || document.body).appendChild(e); return e;
  }
  function draggable(box, key, defPos) {
    var p = LS.get('pos_' + key, defPos);
    function place() {
      var x = Math.min(Math.max(0, p.x), window.innerWidth - 40), y = Math.min(Math.max(0, p.y), window.innerHeight - 30);
      box.style.left = x + 'px'; box.style.top = y + 'px';
    }
    place(); window.addEventListener('resize', place);
    var drag = null;
    box.addEventListener('pointerdown', function (e) {
      if (e.target.closest && e.target.closest('[data-nodrag]')) return;
      drag = { dx: e.clientX - box.offsetLeft, dy: e.clientY - box.offsetTop };
      box.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation();
    });
    box.addEventListener('pointermove', function (e) { if (!drag) return; p = { x: e.clientX - drag.dx, y: e.clientY - drag.dy }; place(); });
    box.addEventListener('pointerup', function () { if (drag) { drag = null; LS.set('pos_' + key, p); } });
    ['mousedown', 'mouseup', 'click', 'touchstart'].forEach(function (t) { box.addEventListener(t, function (e) { e.stopPropagation(); }); });
  }
  var FONT = 'font-family:Arial,Helvetica,sans-serif;';

  /* ---------- Chrono ---------- */
  var state = 'idle', t0 = 0, coinBase = 0, boardBase = 0, box, timeEl, infoEl;
  function fmt(ms) {
    var m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, c = Math.floor(ms / 10) % 100;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s + '.' + (c < 10 ? '0' : '') + c;
  }
  function buildTimer() {
    box = el('div', 'position:fixed;z-index:100000;cursor:move;user-select:none;background:rgba(0,0,0,.65);color:#fff;border-radius:14px;' +
      'padding:6px 18px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.4);touch-action:none;' + FONT);
    timeEl = el('div', 'font-size:34px;font-weight:bold;font-variant-numeric:tabular-nums;letter-spacing:1px', box, '00:00.00');
    infoEl = el('div', 'font-size:14px;font-weight:bold;display:none;margin-top:2px', box);
    draggable(box, 'timer', { x: Math.round(window.innerWidth / 2 - 85), y: 30 });
  }
  function tick() {
    if (state !== 'running') return;
    timeEl.textContent = fmt(performance.now() - t0);
    if (ctr('coin') > coinBase) stopRun('coin');
    else if (ctr('board') > boardBase) stopRun('board');
    if (state === 'running') rafUI(tick);
  }
  function send(m) { try { if (window.unityGame) window.unityGame.SendMessage('Game', m); } catch (e) {} }

  // retour au lobby : tuer -> passer "Save me!" -> bouton Home de l'ecran de fin
  var lobbyTimers = [];
  function clickHome() {
    var c = document.querySelector('#game canvas') || document.querySelector('canvas'); if (!c) return;
    var r = c.getBoundingClientRect();
    var x = r.left + r.width / 2 - 0.2417 * r.height, y = r.top + 0.9097 * r.height;
    var o = { bubbles: true, cancelable: true, clientX: x, clientY: y, screenX: x, screenY: y, button: 0, buttons: 1, view: window };
    c.dispatchEvent(new MouseEvent('mousemove', o)); c.dispatchEvent(new MouseEvent('mousedown', o));
    setTimeout(function () { o.buttons = 0; c.dispatchEvent(new MouseEvent('mouseup', o)); window.dispatchEvent(new MouseEvent('mouseup', o)); c.dispatchEvent(new MouseEvent('click', o)); }, 60);
  }
  function toLobby(alreadyDead) {
    lobbyTimers.forEach(clearTimeout); lobbyTimers = [];
    if (!alreadyDead) send('Die');
    [300, 650, 1000, 1350].forEach(function (ms) { lobbyTimers.push(setTimeout(function () { send('SkipRevive'); }, ms)); });
    lobbyTimers.push(setTimeout(clickHome, 2000));
  }
  function stopRun(reason) {
    if (state !== 'running') return;
    state = 'stopped'; updHint();
    timeEl.textContent = fmt(performance.now() - t0);
    var L = { coin: ['PIECE TOUCHEE', 'rgba(200,140,0,.88)'], board: ['PLANCHE ACTIVEE', 'rgba(30,110,210,.88)'], death: ['MORT', 'rgba(190,20,20,.88)'] }[reason];
    infoEl.textContent = L[0]; infoEl.style.display = 'block'; box.style.background = L[1];
    var ms = performance.now() - t0;
    lastRun = { ms: ms, reason: reason };
    var best = LS.get('best', 0); if (ms > best) { LS.set('best', ms); lastRun.newBest = true; Acc.submit(ms).then(loadBoard); }
    toLobby(reason === 'death');
    setTimeout(showHome, 2300);
  }
  window.__ssGameplayStart = function () {
    lobbyTimers.forEach(clearTimeout); lobbyTimers = [];
    state = 'running'; t0 = performance.now(); coinBase = ctr('coin'); boardBase = ctr('board'); updHint(); hideHome();
    infoEl.style.display = 'none'; box.style.background = 'rgba(0,0,0,.65)';
    rafUI(tick);
  };
  window.__ssGameplayStop = function () { stopRun('death'); };

  /* ---------- FPS : compteur (frames du jeu) + FPS illimites ---------- */
  var captureCb = null, noBlack = false, noSkin = false;
  var origRAF = window.requestAnimationFrame.bind(window), fpsEl, gameFrames = 0, lastF = performance.now();
  var mc = new MessageChannel(), queued = [];
  mc.port1.onmessage = function () { var q = queued; queued = []; var t = performance.now(); for (var i = 0; i < q.length; i++) { try { q[i](t); } catch (e) { setTimeout(function () { throw e; }); } } };
  window.requestAnimationFrame = function (cb) {
    var wrapped = function (t) { gameFrames++; cb(t); if (captureCb) { var f = captureCb; captureCb = null; try { f(); } catch (e) {} } };
    if (S.fpsUnlock) { queued.push(wrapped); if (queued.length === 1) mc.port2.postMessage(0); return 1; }
    return origRAF(wrapped);
  };
  function fpsLoop(t) {
    if (t - lastF >= 500) { if (fpsEl) fpsEl.textContent = Math.round(gameFrames * 1000 / (t - lastF)) + ' FPS'; gameFrames = 0; lastF = t; }
    origRAF(fpsLoop);
  }
  var rafUI = origRAF;

  /* ---------- Texte "Espace = lancer" ---------- */
  var hintEl;
  function updHint() { if (hintEl) hintEl.style.display = (S.spaceHint && state !== 'running' && !homeOpen) ? 'block' : 'none'; }

  /* ---------- Style "fait main" commun ---------- */
  var HAND_CSS =
    '.hm{font-family:"Trebuchet MS",Verdana,Arial,sans-serif;color:#1d1b16}' +
    '.hm-card{background:#fff8e4;border:3px solid #1d1b16;border-radius:7px;box-shadow:7px 7px 0 #1d1b16;padding:18px;box-sizing:border-box}' +
    '.hm-tilt{transform:rotate(-.7deg)}' +
    '.hm-h{font-family:Impact,"Arial Black",sans-serif;font-size:26px;letter-spacing:1px;text-transform:uppercase;margin:0 0 10px;line-height:1}' +
    '.hm-tag{display:inline-block;background:#1d1b16;color:#fff8e4;font-size:11px;font-weight:bold;letter-spacing:2px;padding:3px 7px;transform:rotate(-2deg);text-transform:uppercase}' +
    '.hm-btn{border:3px solid #1d1b16;border-radius:6px;box-shadow:4px 4px 0 #1d1b16;font-family:Impact,"Arial Black",sans-serif;letter-spacing:1px;cursor:pointer;text-transform:uppercase;color:#1d1b16;background:#ffd23f;transition:transform .05s,box-shadow .05s}' +
    '.hm-btn:hover{filter:brightness(1.06)}.hm-btn:active{transform:translate(3px,3px);box-shadow:1px 1px 0 #1d1b16}' +
    '.hm-green{background:#3ddc97}.hm-pink{background:#ff7a8a}.hm-white{background:#fff}.hm-blue{background:#7cc4ff}' +
    '.hm-in{width:100%;box-sizing:border-box;border:3px solid #1d1b16;border-radius:5px;padding:9px 10px;font-size:16px;background:#fff;color:#1d1b16;font-family:inherit;outline:none}' +
    '.hm-in:focus{background:#fffde0}' +
    '.hm-lbl{font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;margin:10px 0 4px}' +
    '.hm-err{color:#c81e3a;font-weight:bold;font-size:13px;min-height:18px;margin-top:8px}' +
    '.hm-small{font-size:12px;color:#5d574a}';
  el('style', '', document.head, HAND_CSS);

  /* ---------- Comptes + classement (Supabase si configure, sinon local) ---------- */
  var CFG = window.SS_CONFIG || {}, ONLINE = !!(CFG.supabaseUrl && CFG.supabaseKey);
  function rpc(fn, body) {
    return fetch(CFG.supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/' + fn, {
      method: 'POST', headers: { apikey: CFG.supabaseKey, Authorization: 'Bearer ' + CFG.supabaseKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { if (!r.ok) throw new Error('serveur ' + r.status); return r.text(); }).then(function (t) { return t ? JSON.parse(t) : null; });
  }
  function sha256(str) {
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (b) {
        return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
      });
    }
    var h1 = 0x811c9dc5, out = '';               // repli (pas de crypto) : hachage simple
    for (var r = 0; r < 8; r++) { for (var i = 0; i < str.length; i++) { h1 ^= str.charCodeAt(i) + r; h1 = Math.imul(h1, 16777619) >>> 0; } out += ('0000000' + h1.toString(16)).slice(-8); }
    return Promise.resolve(out);
  }
  function passHash(pseudo, pass) { return sha256(pseudo.toLowerCase() + ':' + pass + ':ss-surf'); }
  var Acc = {
    session: LS.get('session', null),
    register: function (pseudo, pass) {
      return passHash(pseudo, pass).then(function (h) {
        if (ONLINE) return rpc('ss_register', { p_pseudo: pseudo, p_hash: h }).then(function (ok) { if (!ok) throw new Error('Ce pseudo est deja pris.'); return h; });
        var all = LS.get('accounts', {}); if (all[pseudo.toLowerCase()]) throw new Error('Ce pseudo est deja pris sur ce navigateur.');
        all[pseudo.toLowerCase()] = { pseudo: pseudo, h: h, best: 0 }; LS.set('accounts', all); return h;
      }).then(function (h) { Acc.session = { pseudo: pseudo, h: h }; LS.set('session', Acc.session); });
    },
    login: function (pseudo, pass) {
      return passHash(pseudo, pass).then(function (h) {
        if (ONLINE) return rpc('ss_login', { p_pseudo: pseudo, p_hash: h }).then(function (ok) { if (!ok) throw new Error('Pseudo ou mot de passe faux.'); return h; });
        var a = LS.get('accounts', {})[pseudo.toLowerCase()]; if (!a || a.h !== h) throw new Error('Pseudo ou mot de passe faux.'); return h;
      }).then(function (h) { Acc.session = { pseudo: pseudo, h: h }; LS.set('session', Acc.session); });
    },
    logout: function () { Acc.session = null; try { localStorage.removeItem('ssmod_session'); } catch (e) {} },
    submit: function (ms) {
      if (!Acc.session) return Promise.resolve();
      var s = Acc.session;
      if (ONLINE) return rpc('ss_submit', { p_pseudo: s.pseudo, p_hash: s.h, p_ms: Math.round(ms) }).catch(function () {});
      var all = LS.get('accounts', {}), a = all[s.pseudo.toLowerCase()]; if (a && ms > a.best) { a.best = Math.round(ms); LS.set('accounts', all); }
      return Promise.resolve();
    },
    top: function () {
      if (ONLINE) return rpc('ss_top', { p_limit: 10 }).then(function (r) { return r || []; });
      var all = LS.get('accounts', {}), arr = [];
      for (var k in all) if (all[k].best > 0) arr.push({ pseudo: all[k].pseudo, best_ms: all[k].best });
      arr.sort(function (a, b) { return b.best_ms - a.best_ms; }); return Promise.resolve(arr.slice(0, 10));
    }
  };

  /* ---------- Ecran de compte (obligatoire a la 1re visite) ---------- */
  var accWrap;
  function showAccount() {
    if (accWrap) { accWrap.style.display = 'flex'; return; }
    accWrap = el('div', 'position:fixed;inset:0;z-index:100010;display:flex;align-items:center;justify-content:center;background:rgba(20,18,12,.72)');
    accWrap.className = 'hm';
    ['mousedown', 'mouseup', 'click', 'keydown', 'keyup', 'pointerdown', 'touchstart', 'wheel'].forEach(function (t) { accWrap.addEventListener(t, function (e) { e.stopPropagation(); }); });
    var card = el('div', 'width:min(360px,90vw)', accWrap); card.className = 'hm-card hm-tilt';
    var mode = 'create';
    var tag = el('div', '', card, ONLINE ? 'classement mondial' : 'mode local'); tag.className = 'hm-tag';
    var title = el('div', 'margin-top:10px', card, 'Cree ton compte'); title.className = 'hm-h';
    el('div', '', card, 'Pseudo').className = 'hm-lbl';
    var ip = el('input', '', card); ip.className = 'hm-in'; ip.maxLength = 16; ip.placeholder = '3 a 16 lettres / chiffres';
    el('div', '', card, 'Mot de passe').className = 'hm-lbl';
    var iw = el('input', '', card); iw.className = 'hm-in'; iw.type = 'password'; iw.placeholder = '4 caracteres minimum';
    var err = el('div', '', card); err.className = 'hm-err';
    var go = el('button', 'width:100%;font-size:22px;padding:10px;margin-top:4px', card, 'Creer le compte'); go.className = 'hm-btn hm-green';
    var sw = el('div', 'margin-top:14px;text-align:center;font-size:13px;cursor:pointer;text-decoration:underline', card, 'J\'ai deja un compte');
    function setMode(m) { mode = m; title.textContent = m === 'create' ? 'Cree ton compte' : 'Connexion'; go.textContent = m === 'create' ? 'Creer le compte' : 'Se connecter'; sw.textContent = m === 'create' ? 'J\'ai deja un compte' : 'Creer un nouveau compte'; err.textContent = ''; }
    sw.addEventListener('click', function () { setMode(mode === 'create' ? 'login' : 'create'); });
    function submit() {
      var p = ip.value.trim(), w = iw.value;
      if (!/^[A-Za-z0-9_-]{3,16}$/.test(p)) { err.textContent = 'Pseudo : 3 a 16 caracteres (lettres, chiffres, _ ou -).'; return; }
      if (w.length < 4) { err.textContent = 'Mot de passe : 4 caracteres minimum.'; return; }
      go.disabled = true; err.textContent = '';
      (mode === 'create' ? Acc.register(p, w) : Acc.login(p, w)).then(function () {
        accWrap.style.display = 'none'; iw.value = ''; updAccLine(); loadBoard();
      }, function (e) { err.textContent = e.message || 'Erreur, reessaie.'; }).then(function () { go.disabled = false; });
    }
    go.addEventListener('click', submit);
    [ip, iw].forEach(function (i) { i.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); }); });
    setTimeout(function () { ip.focus(); }, 50);
  }

  /* ---------- Menu perso (remplace le lobby / l'ecran de fin) ---------- */
  var home, homeOpen = false, lastRun = null, skinPanel, recEl, lastEl, boardEl, accLine;
  var CHARS = [['slick', 'Jake'], ['tricky', 'Tricky'], ['fresh', 'Fresh'], ['spike', 'Spike'], ['yutani', 'Yutani'], ['lucy', 'Lucy'],
    ['ninja', 'Ninja'], ['frank', 'Frank'], ['king', 'King'], ['frizzy', 'Frizzy'], ['tag', 'Tagbot'], ['tasha', 'Tasha'],
    ['zoe', 'Zoe'], ['brody', 'Brody'], ['princek', 'Prince K']];
  function pressSpace() {
    var c = document.querySelector('#game canvas') || document.querySelector('canvas');
    ['keydown', 'keyup'].forEach(function (type, i) {
      setTimeout(function () {
        var ev = new KeyboardEvent(type, { key: ' ', code: 'Space', keyCode: 32, which: 32, bubbles: true, cancelable: true });
        try { Object.defineProperty(ev, 'keyCode', { value: 32 }); Object.defineProperty(ev, 'which', { value: 32 }); } catch (e) {}
        window.dispatchEvent(ev); if (c) c.dispatchEvent(ev);
      }, i * 60);
    });
  }
  function updAccLine() { if (accLine) accLine.innerHTML = Acc.session ? 'Connecte : <b>' + Acc.session.pseudo + '</b> &middot; <u style="cursor:pointer">changer</u>' : '<u style="cursor:pointer">se connecter</u>'; }
  function loadBoard() {
    if (!boardEl) return;
    boardEl.innerHTML = '<div class="hm-small">chargement...</div>';
    Acc.top().then(function (list) {
      if (!list.length) { boardEl.innerHTML = '<div class="hm-small">Personne encore. Sois le premier !</div>'; return; }
      boardEl.innerHTML = '';
      list.forEach(function (r, i) {
        var me = Acc.session && r.pseudo === Acc.session.pseudo;
        var row = el('div', 'display:flex;gap:8px;align-items:baseline;padding:4px 2px;border-bottom:2px dashed #d8cdb0;' + (me ? 'background:#ffe98a;' : ''), boardEl);
        el('span', 'width:22px;font-family:Impact,Arial Black,sans-serif;font-size:16px;color:' + (i === 0 ? '#d4a400' : i === 1 ? '#8a8a8a' : i === 2 ? '#b0673a' : '#1d1b16'), row, (i + 1) + '.');
        el('span', 'flex:1;font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', row, r.pseudo.replace(/</g, '&lt;'));
        el('span', 'font-family:Consolas,monospace;font-weight:bold', row, fmt(r.best_ms));
      });
    }, function () { boardEl.innerHTML = '<div class="hm-err">Classement indisponible (connexion ?)</div>'; });
  }
  function clickCanvas(fx, fy) {
    var c = document.querySelector('#game canvas') || document.querySelector('canvas'); if (!c) return;
    var r = c.getBoundingClientRect(), x = r.left + r.width * fx, y = r.top + r.height * fy;
    var o = { bubbles: true, cancelable: true, clientX: x, clientY: y, screenX: x, screenY: y, button: 0, buttons: 1, view: window };
    c.dispatchEvent(new MouseEvent('mousemove', o)); c.dispatchEvent(new MouseEvent('mousedown', o));
    setTimeout(function () { o.buttons = 0; c.dispatchEvent(new MouseEvent('mouseup', o)); window.dispatchEvent(new MouseEvent('mouseup', o)); c.dispatchEvent(new MouseEvent('click', o)); }, 60);
  }
  function startFromLobby() {
    pressSpace();
    setTimeout(function () { if (state !== 'running') clickCanvas(0.5, 0.42); }, 250);
  }
  var previewEls = [];
  function refreshPreviews() {
    previewEls.forEach(function (p) {
      var u = p.perso ? LS.get('img_skin', null) : LS.get('prev_' + p.c, null);
      p.el.style.backgroundImage = u ? 'url(' + u + ')' : '';
      p.el.textContent = u ? '' : '?';
    });
  }
  function buildHome() {
    el('style', '', document.head,
      '.ssh-w{position:fixed;inset:0;z-index:99990;display:none;align-items:center;justify-content:center;pointer-events:none}' +
      '.ssh-c{pointer-events:auto;width:min(700px,94vw);max-height:92vh;overflow:auto}' +
      '.ssh-top{display:flex;gap:16px;align-items:stretch}' +
      '.ssh-left{flex:1.15;background:#fff;border:3px solid #1d1b16;border-radius:5px;padding:12px 14px}' +
      '.ssh-right{flex:1;display:flex;flex-direction:column;gap:12px}' +
      '.ssh-play{flex:1;min-height:120px;font-size:38px;line-height:1}' +
      '.ssh-play small{display:block;font-size:15px;margin-top:6px;letter-spacing:3px}' +
      '.ssh-rec{margin-top:10px;padding-top:8px;border-top:3px solid #1d1b16;display:flex;justify-content:space-between;align-items:baseline}' +
      '.ssh-sk{display:none;margin-top:16px;border-top:3px dashed #1d1b16;padding-top:12px}' +
      '.ssh-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(122px,1fr));gap:10px}' +
      '.ssh-ch{background:#fff;border:3px solid #1d1b16;border-radius:5px;padding:6px;text-align:center}' +
      '.ssh-ch:nth-child(odd){transform:rotate(-.8deg)}.ssh-ch:nth-child(even){transform:rotate(.6deg)}' +
      '.ssh-ch b{display:block;font-family:Impact,Arial Black,sans-serif;letter-spacing:1px;font-size:15px;margin-bottom:4px}' +
      '.ssh-pvs{display:flex;gap:5px;justify-content:center}' +
      '.ssh-o{flex:1;cursor:pointer;border:2px solid #1d1b16;border-radius:4px;padding:3px;background:#f3ead0;font-size:11px;font-weight:bold}' +
      '.ssh-o:hover{background:#ffe98a}.ssh-o.on{background:#3ddc97}' +
      '.ssh-pv{height:62px;margin-bottom:3px;border-radius:3px;background:#2b2a26 center/cover no-repeat;display:flex;align-items:center;justify-content:center;color:#8d8775;font:bold 22px Impact,sans-serif}');
    home = el('div'); home.className = 'ssh-w hm';
    var card = el('div', '', home); card.className = 'ssh-c hm-card hm-tilt';
    ['mousedown', 'mouseup', 'click', 'pointerdown', 'touchstart', 'wheel'].forEach(function (t) { card.addEventListener(t, function (e) { e.stopPropagation(); }); });
    var top = el('div', '', card); top.className = 'ssh-top';
    var left = el('div', '', top); left.className = 'ssh-left';
    var tg = el('div', '', left, ONLINE ? 'classement mondial' : 'classement (local)'); tg.className = 'hm-tag';
    el('div', 'margin:8px 0 6px', left, 'Sans piece').className = 'hm-h';
    boardEl = el('div', 'font-size:14px', left);
    var rec = el('div', '', left); rec.className = 'ssh-rec';
    el('span', 'font-weight:bold;font-size:13px;text-transform:uppercase', rec, 'Ton record');
    recEl = el('span', 'font-family:Consolas,monospace;font-weight:bold;font-size:20px', rec, '00:00.00');
    lastEl = el('div', 'margin-top:4px', left); lastEl.className = 'hm-small';
    var right = el('div', '', top); right.className = 'ssh-right';
    var play = el('button', '', right, 'Jouer<small>(espace)</small>'); play.className = 'hm-btn hm-green ssh-play';
    play.addEventListener('click', function () { hideHome(); startFromLobby(); });
    var skb = el('button', 'font-size:22px;padding:10px', right, 'Skin'); skb.className = 'hm-btn hm-blue';
    accLine = el('div', 'text-align:center;font-size:13px', right); updAccLine();
    accLine.addEventListener('click', function () { Acc.logout(); updAccLine(); showAccount(); });
    skinPanel = el('div', '', card); skinPanel.className = 'ssh-sk';
    skb.addEventListener('click', function () { refreshPreviews(); skinPanel.style.display = skinPanel.style.display === 'block' ? 'none' : 'block'; });
    // barre d'outils skins
    var bar = el('div', 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px', skinPanel);
    var inp = el('input', 'display:none', bar); inp.type = 'file'; inp.accept = 'image/*';
    var imp = el('button', 'font-size:14px;padding:6px 10px', bar, 'Importer mon skin perso'); imp.className = 'hm-btn hm-pink';
    imp.addEventListener('click', function () { inp.click(); });
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      var rd = new FileReader(); rd.onload = function () {
        var im = new Image(); im.onload = function () {
          var sc = Math.min(1, 512 / Math.max(im.width, im.height)), c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(im.width * sc)); c.height = Math.max(1, Math.round(im.height * sc));
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          LS.set('img_skin', c.toDataURL('image/png')); loadCustom('skin'); refreshPreviews();
        }; im.src = rd.result;
      }; rd.readAsDataURL(f); inp.value = '';
    });
    var gen = el('button', 'font-size:14px;padding:6px 10px', bar, 'Prendre les apercus'); gen.className = 'hm-btn hm-white';
    gen.addEventListener('click', function () {
      var todo = CHARS.map(function (c) { return c[0]; });
      LS.set('prevQueue', todo); LS.set('prevRestore', LS.get('skin', { char: 'slick', perso: false }));
      LS.set('skin', { char: todo[0], perso: false }); location.reload();
    });
    el('span', '', bar, 'Variantes : Normale ou Perso (ton image).').className = 'hm-small';
    var g = el('div', '', skinPanel); g.className = 'ssh-g';
    var cur = LS.get('skin', { char: 'slick', perso: false });
    CHARS.forEach(function (c) {
      var bx = el('div', '', g); bx.className = 'ssh-ch';
      el('b', '', bx, c[1]);
      var row = el('div', '', bx); row.className = 'ssh-pvs';
      [false, true].forEach(function (perso) {
        var b = el('div', '', row); b.className = 'ssh-o' + (cur.char === c[0] && !!cur.perso === perso ? ' on' : '');
        var pv = el('div', '', b, '?'); pv.className = 'ssh-pv'; previewEls.push({ c: c[0], perso: perso, el: pv });
        el('div', '', b, perso ? 'Perso' : 'Normale');
        b.addEventListener('click', function () {
          if (perso && !LS.get('img_skin', null)) { inp.click(); return; }
          var was = LS.get('skin', { char: 'slick' });
          LS.set('skin', { char: c[0], outfit: 0, perso: perso });
          if (was.char === c[0]) { S.skinPerso = perso; saveS(); g.querySelectorAll('.ssh-o').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); return; }
          S.skinPerso = perso; saveS();
          b.lastChild.textContent = '...'; setTimeout(function () { location.reload(); }, 150);
        });
      });
    });
  }
  function capturePreview(done) {
    var c = document.querySelector('#game canvas'); if (!c) { done && done(); return; }
    var sk = LS.get('skin', { char: 'slick' }), key = 'prev_' + sk.char;
    noBlack = true; noSkin = true;
    setTimeout(function () {
      captureCb = function () {
        try {
          var W = c.width, H = c.height, sx = W * 0.47, sy = H * 0.40, sw = W * 0.20, sh = H * 0.36;
          var t = document.createElement('canvas'); t.width = 110; t.height = Math.round(110 * sh / sw);
          t.getContext('2d').drawImage(c, sx, sy, sw, sh, 0, 0, t.width, t.height);
          LS.set(key, t.toDataURL('image/jpeg', 0.8));
        } catch (e) {}
        noBlack = false; noSkin = false; refreshPreviews(); done && done();
      };
    }, 150);
  }
  // generation automatique des apercus (1 rechargement par perso)
  function previewQueueStep() {
    var q = LS.get('prevQueue', null); if (!q) return false;
    var cur = LS.get('skin', { char: 'slick' });
    var notice = el('div', 'position:fixed;left:50%;top:40%;transform:translate(-50%,-50%) rotate(-1deg);z-index:100020;padding:14px 20px;font-size:20px', null,
      'Photo des skins : ' + (CHARS.length - q.length + 1) + ' / ' + CHARS.length);
    notice.className = 'hm hm-card';
    capturePreview(function () {
      q = q.filter(function (c) { return c !== cur.char; });
      if (q.length) { LS.set('prevQueue', q); LS.set('skin', { char: q[0], perso: false }); }
      else { try { localStorage.removeItem('ssmod_prevQueue'); } catch (e) {} LS.set('skin', LS.get('prevRestore', { char: 'slick' })); }
      setTimeout(function () { location.reload(); }, 200);
    });
    return true;
  }
  function showHome() {
    if (!home || state === 'running') return;
    recEl.textContent = fmt(LS.get('best', 0));
    lastEl.textContent = lastRun ? ('Derniere manche : ' + fmt(lastRun.ms) + (lastRun.newBest ? '  -  nouveau record !' : '')) : 'Lance une manche pour faire un temps.';
    home.style.display = 'flex'; homeOpen = true; updHint(); loadBoard();
    if (!Acc.session) showAccount();
  }
  function hideHome() { if (home) home.style.display = 'none'; homeOpen = false; skinPanel && (skinPanel.style.display = 'none'); updHint(); }
  window.addEventListener('keydown', function (e) { if (homeOpen && (e.code === 'Space' || e.key === ' ') && e.isTrusted && !(accWrap && accWrap.style.display !== 'none')) hideHome(); }, true);

  /* ---------- Keyshow (WASD + fleches) ---------- */
  var ksBox;
  function buildKeyshow() {
    ksBox = el('div', 'position:fixed;z-index:99998;cursor:move;user-select:none;touch-action:none;background:rgba(0,0,0,.35);border-radius:10px;padding:8px;display:flex;gap:18px;' + FONT);
    function cluster(rows) {
      var c = el('div', 'display:flex;flex-direction:column;align-items:center;gap:4px', ksBox);
      rows.forEach(function (row) {
        var r = el('div', 'display:flex;gap:4px', c);
        row.forEach(function (k) {
          var b = el('div', 'min-width:30px;height:30px;padding:0 4px;box-sizing:border-box;border-radius:6px;background:rgba(40,40,40,.85);' +
            'border:1px solid rgba(255,255,255,.18);color:#ddd;font-size:11px;font-weight:bold;display:flex;align-items:center;justify-content:center;transition:background .05s', r, k[0]);
          ksKeys[k[1]] = b;
        });
      });
    }
    cluster([[['W', 'up1']], [['A', 'left1'], ['S', 'down1'], ['D', 'right1']]]);
    cluster([[['UP', 'up2']], [['LT', 'left2'], ['DN', 'down2'], ['RT', 'right2']]]);
    draggable(ksBox, 'keyshow', { x: 20, y: window.innerHeight - 110 });
    window.addEventListener('blur', function () { for (var k in ksKeys) { ksKeys[k].style.background = 'rgba(40,40,40,.85)'; ksKeys[k].style.color = '#ddd'; } });
  }

  /* ---------- Qualite de rendu (potato lisse, pas pixelise) + resolution etiree ---------- */
  var styleEl;
  function renderScale() { return S.potato ? Math.min(S.scale, 55) / 100 : S.scale / 100; }
  function applyDisplay() {
    if (!styleEl) styleEl = el('style', '', document.head);
    var css = '#game canvas{image-rendering:auto !important;}';
    var dpr = window.devicePixelRatio || 1;
    if (S.stretch) {
      var w = Math.max(160, S.resW | 0), h = Math.max(120, S.resH | 0), cw = w / dpr, ch = h / dpr;
      css += '#game-container{position:fixed !important;left:0 !important;top:0 !important;margin:0 !important;width:' + cw + 'px !important;height:' + ch + 'px !important;' +
        'transform-origin:0 0 !important;transform:scale(' + (window.innerWidth / cw) + ',' + (window.innerHeight / ch) + ') !important;}';
    }
    styleEl.textContent = css;
    try { if (window.unityGame && window.unityGame.Module) { var sc = renderScale(); window.unityGame.Module.devicePixelRatio = (sc === 1 && !S.stretch) ? undefined : dpr * sc; } } catch (e) {}
  }
  window.addEventListener('resize', function () { if (S.stretch) applyDisplay(); });

  /* ---------- Onglet Parametres ---------- */
  function buildSettings() {
    el('style', '', document.head,
      '.ssm-btn{position:fixed;right:14px;bottom:14px;z-index:100001;width:46px;height:46px;border-radius:14px;background:rgba(18,20,28,.85);color:#fff;font-size:24px;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;box-shadow:0 4px 14px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.12);transition:transform .15s}' +
      '.ssm-btn:hover{transform:rotate(45deg)}' +
      '.ssm-p{position:fixed;right:14px;bottom:70px;z-index:100001;width:300px;max-height:calc(100vh - 90px);overflow:auto;background:rgba(18,20,28,.96);backdrop-filter:blur(8px);color:#eee;border-radius:16px;border:1px solid rgba(255,255,255,.1);box-shadow:0 10px 30px rgba(0,0,0,.55);font-family:Arial,Helvetica,sans-serif;font-size:14px;display:none}' +
      '.ssm-h{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 10px;font-size:17px;font-weight:bold;border-bottom:1px solid rgba(255,255,255,.08)}' +
      '.ssm-x{cursor:pointer;opacity:.6;font-size:20px;line-height:1}.ssm-x:hover{opacity:1}' +
      '.ssm-s{padding:10px 16px 6px}.ssm-t{font-size:11px;font-weight:bold;letter-spacing:1.5px;color:#7fb4ff;text-transform:uppercase;margin:4px 0 6px}' +
      '.ssm-r{display:flex;align-items:center;justify-content:space-between;padding:7px 0;cursor:pointer}.ssm-r small{display:block;color:#888;font-size:11px;margin-top:2px}' +
      '.ssm-sw{position:relative;width:38px;height:22px;flex:none;border-radius:11px;background:#3a3d48;transition:background .15s}' +
      '.ssm-sw:after{content:"";position:absolute;left:3px;top:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s}' +
      '.ssm-on .ssm-sw{background:#3b82f6}.ssm-on .ssm-sw:after{left:19px}' +
      '.ssm-sl{width:100%;accent-color:#3b82f6}.ssm-in{width:64px;background:#252833;color:#fff;border:1px solid #3a3d48;border-radius:6px;padding:4px 6px}' +
      '.ssm-chip{background:#252833;color:#ccc;border:1px solid #3a3d48;border-radius:6px;padding:3px 7px;font-size:12px;cursor:pointer}.ssm-chip:hover{background:#3b82f6;color:#fff}' +
      '.ssm-ok{background:#3b82f6;color:#fff;border:0;border-radius:6px;padding:5px 10px;cursor:pointer}' +
      '.ssm-f{padding:8px 16px 14px;color:#777;font-size:11px;border-top:1px solid rgba(255,255,255,.08)}');
    el('style', '', document.head,
      '.ssm-btn{background:#ffd23f !important;color:#1d1b16 !important;border:3px solid #1d1b16 !important;border-radius:8px !important;box-shadow:4px 4px 0 #1d1b16 !important}' +
      '.ssm-p{background:#fff8e4 !important;color:#1d1b16 !important;border:3px solid #1d1b16 !important;border-radius:7px !important;box-shadow:7px 7px 0 #1d1b16 !important;backdrop-filter:none !important;font-family:"Trebuchet MS",Verdana,Arial,sans-serif !important;transform:rotate(.5deg)}' +
      '.ssm-h{border-bottom:3px solid #1d1b16 !important;font-family:Impact,"Arial Black",sans-serif !important;font-weight:normal !important;font-size:22px !important;letter-spacing:1px;text-transform:uppercase}' +
      '.ssm-t{display:inline-block;background:#1d1b16;color:#fff8e4 !important;padding:3px 7px;transform:rotate(-2deg)}' +
      '.ssm-r small{color:#6b6454 !important}.ssm-sw{background:#d8cdb0 !important;border:2px solid #1d1b16}.ssm-sw:after{top:1px !important;left:1px !important;border:2px solid #1d1b16;box-sizing:border-box}' +
      '.ssm-on .ssm-sw{background:#3ddc97 !important}.ssm-on .ssm-sw:after{left:17px !important}' +
      '.ssm-in{background:#fff !important;color:#1d1b16 !important;border:2px solid #1d1b16 !important}' +
      '.ssm-chip,.ssm-ok{background:#fff !important;color:#1d1b16 !important;border:2px solid #1d1b16 !important;box-shadow:2px 2px 0 #1d1b16;font-weight:bold}' +
      '.ssm-chip:hover{background:#ffe98a !important}.ssm-ok{background:#3ddc97 !important}' +
      '.ssm-sl{accent-color:#1d1b16 !important}.ssm-f{border-top:3px dashed #1d1b16 !important;color:#6b6454 !important}.ssm-x{opacity:1 !important}');
    var btn = el('div', '', null, '&#9881;'); btn.className = 'ssm-btn'; btn.title = 'Parametres';
    var panel = el('div'); panel.className = 'ssm-p';
    function stop(e) { e.stopPropagation(); }
    ['mousedown', 'mouseup', 'click', 'keydown', 'keyup', 'touchstart', 'pointerdown', 'wheel'].forEach(function (t) { panel.addEventListener(t, stop); btn.addEventListener(t, stop); });
    function toggle() { panel.style.display = panel.style.display === 'block' ? 'none' : 'block'; }
    btn.addEventListener('click', toggle);
    var head = el('div', '', panel, '<span>Parametres</span>'); head.className = 'ssm-h';
    var x = el('span', '', head, '&times;'); x.className = 'ssm-x'; x.addEventListener('click', toggle);
    function section(title) { var sct = el('div', '', panel); sct.className = 'ssm-s'; var t = el('div', '', sct, title); t.className = 'ssm-t'; return sct; }
    function sw(parent, label, sub, key, onchange) {
      var row = el('div', '', parent, '<div>' + label + (sub ? '<small>' + sub + '</small>' : '') + '</div>'); row.className = 'ssm-r' + (S[key] ? ' ssm-on' : '');
      var k = el('div', '', row); k.className = 'ssm-sw';
      row.addEventListener('click', function () { S[key] = !S[key]; row.classList.toggle('ssm-on', S[key]); saveS(); onchange && onchange(); });
      return row;
    }
    var g = section('Graphismes');
    var scLbl;
    sw(g, 'Potato graphics', 'Rendu allege et lisse (moins de lag)', 'potato', function () { applyDisplay(); upd(); });
    var sr = el('div', 'padding:6px 0 4px', g);
    scLbl = el('div', 'display:flex;justify-content:space-between;margin-bottom:4px', sr, '<span>Resolution de rendu</span><b></b>');
    var sl = el('input', '', sr); sl.type = 'range'; sl.min = 30; sl.max = 100; sl.step = 5; sl.value = S.scale; sl.className = 'ssm-sl';
    function upd() { scLbl.lastChild.textContent = Math.round(renderScale() * 100) + '%' + (S.potato ? ' (potato)' : ''); }
    sl.addEventListener('input', function () { S.scale = +sl.value; saveS(); applyDisplay(); upd(); }); upd();
    sw(g, 'FPS illimites', 'Retire la limite de l\'ecran (vsync)', 'fpsUnlock');
    sw(g, 'Resolution perso etiree', 'Rend en W x H puis etire sur tout l\'ecran', 'stretch', applyDisplay);
    var rr = el('div', 'display:flex;align-items:center;gap:6px;margin:4px 0 6px', g);
    var iw = el('input', '', rr); iw.type = 'number'; iw.value = S.resW; iw.className = 'ssm-in';
    el('span', '', rr, 'x');
    var ih = el('input', '', rr); ih.type = 'number'; ih.value = S.resH; ih.className = 'ssm-in';
    var ok = el('button', '', rr, 'OK'); ok.className = 'ssm-ok';
    ok.addEventListener('click', function () { S.resW = +iw.value || 1440; S.resH = +ih.value || 1080; saveS(); applyDisplay(); });
    var pres = el('div', 'display:flex;flex-wrap:wrap;gap:5px;margin-bottom:4px', g);
    [[1440, 1080], [1280, 960], [1280, 1024], [1080, 1080], [1680, 1050]].forEach(function (r) {
      var b = el('button', '', pres, r[0] + 'x' + r[1]); b.className = 'ssm-chip';
      b.addEventListener('click', function () { iw.value = r[0]; ih.value = r[1]; S.resW = r[0]; S.resH = r[1]; saveS(); applyDisplay(); });
    });
    var cu = section('Personnalise');
    function imgRow(label, kind, maxSide, mime) {
      var row = el('div', 'display:flex;align-items:center;gap:8px;padding:7px 0', cu);
      var prev = el('div', 'width:34px;height:34px;flex:none;border-radius:8px;background:#252833 center/cover no-repeat;border:1px solid #3a3d48', row);
      el('div', 'flex:1', row, label);
      var inp = el('input', 'display:none', row); inp.type = 'file'; inp.accept = 'image/*';
      var b = el('button', '', row, 'Importer une image'); b.className = 'ssm-chip';
      var x = el('button', '', row, '&times;'); x.className = 'ssm-chip'; x.title = 'Retirer';
      function show() { var u = LS.get('img_' + kind, null); prev.style.backgroundImage = u ? 'url(' + u + ')' : ''; x.style.display = u ? '' : 'none'; }
      b.addEventListener('click', function () { inp.click(); });
      x.addEventListener('click', function () { try { localStorage.removeItem('ssmod_img_' + kind); } catch (e) {} loadCustom(kind); show(); });
      inp.addEventListener('change', function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        var rd = new FileReader();
        rd.onload = function () {
          var im = new Image();
          im.onload = function () {   // on reduit l'image pour la garder en memoire du navigateur
            var sc = Math.min(1, maxSide / Math.max(im.width, im.height)), c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(im.width * sc)); c.height = Math.max(1, Math.round(im.height * sc));
            c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
            LS.set('img_' + kind, c.toDataURL(mime, 0.9)); loadCustom(kind); show();
          };
          im.src = rd.result;
        };
        rd.readAsDataURL(f); inp.value = '';
      });
      show();
    }
    imgRow('Piece', 'coin', 512, 'image/png');
    imgRow('Metro', 'train', 1024, 'image/jpeg');

    var a2 = section('Affichage');
    sw(a2, 'Afficher les FPS', 'Tout en haut de l\'ecran', 'fps', function () { fpsEl.style.display = S.fps ? 'block' : 'none'; });
    sw(a2, 'Keyshow', 'WASD + fleches a l\'ecran', 'keyshow', function () { ksBox.style.display = S.keyshow ? 'flex' : 'none'; });
    sw(a2, 'Texte "Espace = lancer"', 'En bas de l\'ecran, hors manche', 'spaceHint', updHint);
    sw(a2, 'Pieces + perso en noir', '', 'black');
    var f = el('div', '', panel, 'Le chrono et le keyshow se deplacent a la souris.'); f.className = 'ssm-f';
  }

  function init() {
    buildTimer(); buildKeyshow(); buildSettings(); buildHome();
    if (!Acc.session && !LS.get('prevQueue', null)) showAccount();
    var hw = setInterval(function () {
      var ld = document.getElementById('loader');
      if (window.unityGame && ld && ld.style.display === 'none') { clearInterval(hw); setTimeout(function () { if (!previewQueueStep()) capturePreview(showHome); }, 2500); }
    }, 300);
    fpsEl = el('div', 'position:fixed;left:50%;top:0;transform:translateX(-50%);z-index:100002;background:rgba(0,0,0,.7);color:#4ade80;padding:2px 10px;border-radius:0 0 8px 8px;font-size:13px;font-weight:bold;font-variant-numeric:tabular-nums;pointer-events:none;' + FONT, null, '-- FPS');
    fpsEl.style.display = S.fps ? 'block' : 'none';
    hintEl = el('div', 'position:fixed;left:50%;bottom:4px;transform:translateX(-50%);z-index:99997;color:#fff;font-size:17px;font-weight:bold;letter-spacing:1px;' +
      'text-shadow:0 2px 6px rgba(0,0,0,.9),0 0 2px #000;background:rgba(0,0,0,.35);padding:3px 14px;border-radius:8px;pointer-events:none;' + FONT, null, 'ESPACE = LANCER');
    updHint();
    ksBox.style.display = S.keyshow ? 'flex' : 'none';
    origRAF(fpsLoop);
    applyDisplay();
    var n = 0, iv = setInterval(function () { n++; if (window.unityGame && window.unityGame.Module) { applyDisplay(); clearInterval(iv); } if (n > 120) clearInterval(iv); }, 500);
  }
  if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);
})();
