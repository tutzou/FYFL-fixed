/* Charge les fichiers du jeu depuis Build/embed/*.js (double-clic sur index.html ET site).
   + prechargement immediat + cache IndexedDB des fichiers decodes (lancements suivants tres rapides) */
(function () {
  var MANIFEST = {"SanFrancisco.json": {"size": 709, "chunks": 1}, "SanFrancisco.data.unityweb": {"size": 27979216, "chunks": 9}, "SanFrancisco.wasm.code.unityweb": {"size": 25765501, "chunks": 9}, "SanFrancisco.wasm.framework.unityweb": {"size": 521663, "chunks": 1}};
  var CHUNK = 3 * 1024 * 1024;
  var VERSION = 'v' + JSON.stringify(MANIFEST).length + '_' + Object.keys(MANIFEST).map(function (k) { return MANIFEST[k].size; }).join('_');
  var me = document.currentScript && document.currentScript.src;
  var BASE = (me ? me.slice(0, me.lastIndexOf('/') + 1) : '') + 'Build/embed/';
  var Real = window.XMLHttpRequest;
  var files = {};

  function b64ToBytes(b64) {
    if (Uint8Array.fromBase64) return Uint8Array.fromBase64(b64);
    var bin = atob(b64), n = bin.length, a = new Uint8Array(n);
    for (var i = 0; i < n; i++) a[i] = bin.charCodeAt(i);
    return a;
  }

  /* --- cache IndexedDB --- */
  var dbP = new Promise(function (res) {
    try {
      var r = indexedDB.open('ss-embed-cache', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('f'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = r.onblocked = function () { res(null); };
    } catch (e) { res(null); }
  });
  function cacheGet(name) {
    return dbP.then(function (db) {
      if (!db) return null;
      return new Promise(function (res) {
        try { var q = db.transaction('f').objectStore('f').get(VERSION + '/' + name); q.onsuccess = function () { res(q.result || null); }; q.onerror = function () { res(null); }; }
        catch (e) { res(null); }
      });
    });
  }
  function cachePut(name, buf) {
    dbP.then(function (db) {
      if (!db) return;
      try {
        var tx = db.transaction('f', 'readwrite'), st = tx.objectStore('f');
        var cl = st.openCursor();   // on vire les anciennes versions
        cl.onsuccess = function () { var c = cl.result; if (!c) { st.put(buf, VERSION + '/' + name); return; } if (String(c.key).indexOf(VERSION + '/') !== 0) c.delete(); c.continue(); };
      } catch (e) {}
    });
  }

  window.__SSEMBED = function (name, idx, b64) {
    var f = files[name]; if (!f || f.have[idx]) return;
    var bytes = b64ToBytes(b64);
    f.buf.set(bytes, idx * CHUNK); f.have[idx] = true; f.got++; f.loaded += bytes.length;
    f.listeners.forEach(function (l) { l.progress(f.loaded, f.buf.length); });
  };

  function loadChunks(name, f) {
    var info = MANIFEST[name], next = 0, running = 0, PAR = 4;
    function pump() {
      if (f.failed) return;
      if (f.got >= info.chunks) { cachePut(name, f.buf.buffer.slice(0)); finish(f, null); return; }
      while (running < PAR && next < info.chunks) (function (i) {
        running++;
        var sc = document.createElement('script');
        sc.src = BASE + encodeURIComponent(name) + '.' + i + '.js';
        sc.onload = function () { running--; sc.remove(); pump(); };
        sc.onerror = function () { f.failed = true; finish(f, new Error('morceau ' + i + ' manquant')); };
        document.head.appendChild(sc);
      })(next++);
    }
    pump();
  }
  function finish(f, err) { f.done = true; f.err = err; var ls = f.listeners; f.listeners = []; ls.forEach(function (l) { l.done(err, f.buf); }); }

  function start(name) {
    if (files[name]) return files[name];
    var info = MANIFEST[name];
    var f = files[name] = { buf: null, have: [], got: 0, loaded: 0, listeners: [], done: false, err: null, failed: false };
    cacheGet(name).then(function (cached) {
      if (cached && cached.byteLength === info.size) { f.buf = new Uint8Array(cached); f.loaded = info.size; finish(f, null); return; }
      f.buf = new Uint8Array(info.size); loadChunks(name, f);
    });
    return f;
  }
  // prechargement de tout de suite (pendant que le reste de la page demarre)
  Object.keys(MANIFEST).forEach(start);

  function fetchFile(name, onProgress, onDone) {
    var f = start(name);
    if (f.done && f.buf && f.buf.byteLength === 0) { delete files[name]; f = start(name); }   // tampon deja transfere : on recharge
    if (f.done) { setTimeout(function () { onProgress(MANIFEST[name].size); onDone(f.err, f.buf); }, 0); return; }
    f.listeners.push({ progress: onProgress, done: onDone });
    if (f.loaded) onProgress(f.loaded);
  }

  function embeddedName(url) {
    var n = String(url).split('#')[0].split('?')[0];
    n = decodeURIComponent(n.slice(n.lastIndexOf('/') + 1));
    return Object.prototype.hasOwnProperty.call(MANIFEST, n) ? n : null;
  }

  function def(o, k, v) { Object.defineProperty(o, k, { value: v, configurable: true, writable: true }); }

  class EmbedXHR extends Real {
    open(method, url) {
      var n = embeddedName(url);
      if (String(method).toUpperCase() === 'GET' && n) { this.__emb = n; def(this, 'readyState', 1); return; }
      return super.open.apply(this, arguments);
    }
    send(body) {
      if (!this.__emb) return super.send.apply(this, arguments);
      var self = this, name = this.__emb, total = MANIFEST[name].size;
      fetchFile(name, function (loaded) {
        self.dispatchEvent(new ProgressEvent('progress', { lengthComputable: true, loaded: loaded, total: total }));
      }, function (err, buf) {
        if (err) {
          console.error('[embed] ' + name + ' : ' + err.message);
          def(self, 'readyState', 4); def(self, 'status', 0);
          self.dispatchEvent(new ProgressEvent('error'));
          self.dispatchEvent(new ProgressEvent('loadend'));
          return;
        }
        def(self, 'readyState', 4); def(self, 'status', 200); def(self, 'statusText', 'OK');
        if (self.responseType === 'arraybuffer') def(self, 'response', buf.buffer);
        else if (self.responseType === 'blob') def(self, 'response', new Blob([buf]));
        else {
          var txt = new TextDecoder().decode(buf);
          def(self, 'responseText', txt);
          def(self, 'response', self.responseType === 'json' ? JSON.parse(txt) : txt);
        }
        self.dispatchEvent(new Event('readystatechange'));
        self.dispatchEvent(new ProgressEvent('load', { lengthComputable: true, loaded: total, total: total }));
        self.dispatchEvent(new ProgressEvent('loadend', { lengthComputable: true, loaded: total, total: total }));
      });
    }
    setRequestHeader() { if (!this.__emb) return super.setRequestHeader.apply(this, arguments); }
    getResponseHeader(h) { return this.__emb ? null : super.getResponseHeader.apply(this, arguments); }
    getAllResponseHeaders() { return this.__emb ? '' : super.getAllResponseHeaders.apply(this, arguments); }
    abort() { if (!this.__emb) return super.abort.apply(this, arguments); }
  }
  window.XMLHttpRequest = EmbedXHR;
})();
