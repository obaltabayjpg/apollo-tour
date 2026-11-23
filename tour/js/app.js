/* =========================================================
   Apollo — виртуальный тур
   Все сцены и метки — в tour-config.json, тексты интерфейса — в locales/*.json.
   Режим редактора: откройте сайт с параметром ?edit=1
   ========================================================= */
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var EDIT = params.has('edit');
  var EMBED = params.has('embed') && !EDIT; // встраивание в главную страницу (iframe)
  if (EMBED) document.documentElement.classList.add('is-embed');

  var state = {
    cfg: null,
    lang: 'ru',
    dict: {},
    fallbackDict: {},
    viewer: null,
    sceneId: null,
    quality: '4k',
    started: false,
    editor: null,
    preloaded: {},
    lastTrigger: null
  };
  var hsSeq = 0;

  var ICON_ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 15l7-7 7 7"/></svg>';
  var ICON_INFO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 11v6M12 7v.01"/></svg>';

  // ---------- утилиты ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }

  function t(key, vars) {
    var s = state.dict[key] != null ? state.dict[key] : (state.fallbackDict[key] != null ? state.fallbackDict[key] : key);
    if (vars) s = s.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] != null ? vars[k] : ''; });
    return s;
  }

  // Текст из конфигурации: строка или {"ru": "...", "kk": "...", "en": "..."}
  function tx(v) {
    if (v == null) return '';
    if (typeof v !== 'object') return String(v);
    if (v[state.lang]) return v[state.lang];
    var def = state.cfg && state.cfg.defaultLanguage;
    if (def && v[def]) return v[def];
    for (var k in v) if (v[k]) return v[k];
    return '';
  }

  function store(key, val) {
    try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) { return null; }
  }

  function loadJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(url + ': HTTP ' + r.status);
      return r.json();
    });
  }

  function sceneById(id) {
    var list = state.cfg ? state.cfg.scenes : [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function sceneIndex(id) {
    return state.cfg.scenes.findIndex(function (s) { return s.id === id; });
  }

  // ---------- изображения ----------
  function pickQuality() {
    var q = params.get('q');
    if (q === '4k' || q === '8k') return q;
    var max = 4096;
    try {
      var gl = document.createElement('canvas').getContext('webgl');
      if (gl) max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    } catch (e) { /* нет WebGL — Pannellum сам покажет ошибку */ }
    var coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    var small = Math.min(screen.width, screen.height) < 700;
    return (!coarse && !small && max >= 8192) ? '8k' : '4k';
  }

  function imageUrl(s) {
    var base = (state.cfg.settings && state.cfg.settings.imagePath) || 'images/pano/';
    if (/\.\w{3,4}$/.test(s.image)) return base + s.image; // указан готовый файл
    return base + s.image + '-' + state.quality + '.jpg';
  }
  function thumbUrl(s) {
    if (s.thumb) return s.thumb;
    var base = (state.cfg.settings && state.cfg.settings.thumbPath) || 'images/thumbs/';
    return base + String(s.image).replace(/\.\w{3,4}$/, '') + '.jpg';
  }

  function preload(id) {
    var s = sceneById(id);
    if (!s || state.preloaded[id]) return;
    state.preloaded[id] = true;
    var img = new Image();
    img.src = imageUrl(s);
  }

  // ---------- метки ----------
  function hotspotLabel(h) {
    if (h.type === 'scene') {
      var label = tx(h.text);
      if (!label) { var target = sceneById(h.target); label = target ? tx(target.title) : ''; }
      return label;
    }
    return tx(h.text);
  }

  function makeHotspot(h, sceneId) {
    if (!h._id) Object.defineProperty(h, '_id', { value: 'hs' + (++hsSeq), writable: true, enumerable: false });
    return {
      id: h._id,
      pitch: Number(h.pitch) || 0,
      yaw: Number(h.yaw) || 0,
      type: 'info',
      cssClass: 'hs ' + (h.type === 'scene' ? 'hs-scene' : 'hs-info'),
      createTooltipFunc: renderHotspot,
      createTooltipArgs: { h: h, sceneId: sceneId }
    };
  }

  function renderHotspot(div, args) {
    var h = args.h;
    var label = hotspotLabel(h);
    div.setAttribute('role', 'button');
    div.tabIndex = 0;
    div.dataset.hsId = h._id;
    div.setAttribute('aria-label', h.type === 'scene' ? t('goTo', { name: label }) : label);

    var core = el('span', 'hs-core');
    core.innerHTML = h.type === 'scene' ? ICON_ARROW : ICON_INFO;
    if (h.type === 'scene' && h.rotate) core.firstChild.style.transform = 'rotate(' + Number(h.rotate) + 'deg)';
    div.appendChild(core);

    if (label) {
      var l = el('span', 'hs-label');
      l.textContent = label;
      div.appendChild(l);
    }

    function activate(e) {
      e.preventDefault();
      e.stopPropagation();
      onHotspot(h, args.sceneId, div);
    }
    var start = null;
    div.addEventListener('click', activate);
    div.addEventListener('touchstart', function (e) {
      var p = e.changedTouches[0]; start = [p.clientX, p.clientY];
    }, { passive: true });
    div.addEventListener('touchend', function (e) {
      if (!start) return;
      var p = e.changedTouches[0];
      if (Math.hypot(p.clientX - start[0], p.clientY - start[1]) < 10) activate(e);
      start = null;
    });
    div.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') activate(e);
    });
  }

  function onHotspot(h, sceneId, div) {
    if (state.editor && state.editor.onHotspotClick(h, sceneId, div)) return;
    if (h.type === 'scene') goTo(h.target, h);
    else openHsCard(h, div);
  }

  // ---------- Pannellum ----------
  function toPannellumScene(s) {
    var haov = Number(s.haov) || 360;
    var vaov = Number(s.vaov) || 180;
    var vOffset = Number(s.vOffset) || 0;
    var sc = {
      type: 'equirectangular',
      panorama: imageUrl(s),
      haov: haov,
      vaov: vaov,
      vOffset: vOffset,
      yaw: Number(s.yaw) || 0,
      pitch: Number(s.pitch) || 0,
      hfov: Number(s.hfov) || 100,
      minHfov: 30,
      maxHfov: 120,
      // частичная панорама: не показывать пустоту за краями снимка
      avoidShowingBackground: true,
      minPitch: vOffset - vaov / 2,
      maxPitch: vOffset + vaov / 2,
      hotSpots: (s.hotSpots || []).map(function (h) { return makeHotspot(h, s.id); })
    };
    if (haov < 360) {
      sc.minYaw = -haov / 2;
      sc.maxYaw = haov / 2;
    }
    return sc;
  }

  function getView() {
    var v = state.viewer;
    return v ? { pitch: v.getPitch(), yaw: v.getYaw(), hfov: v.getHfov() } : null;
  }

  function buildViewer(startScene, view) {
    if (state.viewer) {
      try { state.viewer.destroy(); } catch (e) { /* ignore */ }
      state.viewer = null;
    }
    var set = state.cfg.settings || {};
    var scenes = {};
    state.cfg.scenes.forEach(function (s) { scenes[s.id] = toPannellumScene(s); });
    if (view && scenes[startScene]) {
      scenes[startScene].pitch = view.pitch;
      scenes[startScene].yaw = view.yaw;
      scenes[startScene].hfov = view.hfov;
    }

    var v = pannellum.viewer('pano', {
      default: {
        firstScene: startScene,
        sceneFadeDuration: set.sceneFadeDuration != null ? set.sceneFadeDuration : 700,
        autoLoad: true,
        showControls: false,
        compass: false,
        mouseZoom: !EMBED, // во встроенном туре колесо мыши прокручивает страницу
        backgroundColor: [0.043, 0.031, 0.125],
        autoRotate: EDIT ? false : (set.autoRotate || false),
        autoRotateInactivityDelay: set.autoRotateInactivityDelay != null ? set.autoRotateInactivityDelay : -1,
        strings: { loadingLabel: t('loading') }
      },
      scenes: scenes
    });
    state.viewer = v;

    v.on('scenechange', onScene);
    v.on('load', function () {
      $('#welcomeStatus').textContent = '';
      preloadNeighbors();
    });
    v.on('error', function (msg) {
      console.error('Pannellum:', msg);
      toast(t('errorLoad'), { error: true, duration: 6000 });
    });
    onScene(startScene);
  }

  function preloadNeighbors() {
    var id = state.sceneId;
    var s = sceneById(id);
    if (!s) return;
    var i = sceneIndex(id);
    var next = state.cfg.scenes[i + 1];
    if (next) preload(next.id);
    (s.hotSpots || []).forEach(function (h) { if (h.type === 'scene') preload(h.target); });
  }

  function onScene(id) {
    state.sceneId = id;
    state.preloaded[id] = true;
    var s = sceneById(id);
    var i = sceneIndex(id);
    var total = state.cfg.scenes.length;
    $('#sceneTitle').textContent = s ? tx(s.title) : '';
    $('#counter').textContent = t('counter', { n: i + 1, total: total });
    $('#prevBtn').disabled = i <= 0;
    $('#nextBtn').disabled = i >= total - 1;
    $$('.scene-card').forEach(function (c) {
      c.setAttribute('aria-current', c.dataset.id === id ? 'true' : 'false');
    });
    try { history.replaceState(null, '', location.pathname + location.search + '#' + encodeURIComponent(id)); } catch (e) { /* file:// */ }
    $('#expandBtn').href = './#' + encodeURIComponent(id);
    if (state.editor) state.editor.onScene(id);
  }

  function goTo(id, h) {
    if (!sceneById(id)) { toast('Сцена «' + id + '» не найдена в tour-config.json', { error: true }); return; }
    closePanels(true);
    if (id === state.sceneId) return;
    state.viewer.loadScene(id, h ? h.targetPitch : undefined, h ? h.targetYaw : undefined, h ? h.targetHfov : undefined);
  }

  function step(delta) {
    var i = sceneIndex(state.sceneId) + delta;
    var s = state.cfg.scenes[i];
    if (s) goTo(s.id);
  }

  // ---------- тексты интерфейса ----------
  function applyTexts() {
    var venue = state.cfg.venue || {};
    document.documentElement.lang = state.lang;
    document.title = tx(venue.title) || document.title;

    $$('[data-i18n]').forEach(function (e) { e.textContent = t(e.dataset.i18n); });
    $$('[data-i18n-aria]').forEach(function (e) { e.setAttribute('aria-label', t(e.dataset.i18nAria)); });
    $$('[data-i18n-title]').forEach(function (e) { e.title = t(e.dataset.i18nTitle); });

    $$('[data-venue]').forEach(function (e) {
      var val = tx(venue[e.dataset.venue]);
      e.textContent = val;
      e.hidden = !val;
    });
    var phone = venue.phone || '';
    var tel = 'tel:' + phone.replace(/[^\d+]/g, '');
    $$('[data-venue-phone]').forEach(function (a) { a.textContent = phone; a.href = tel; a.hidden = !phone; });
    $$('[data-venue-call]').forEach(function (a) { a.href = tel; a.hidden = !phone; });
    $$('[data-venue-map]').forEach(function (a) { a.href = venue.mapUrl || '#'; a.hidden = !venue.mapUrl; });
    var wa = String(venue.whatsapp || '').replace(/\D/g, '');
    var waText = tx(venue.whatsappText);
    var waUrl = 'https://wa.me/' + wa + (waText ? '?text=' + encodeURIComponent(waText) : '');
    $$('[data-venue-whatsapp]').forEach(function (a) { a.href = waUrl; a.hidden = !wa; });
    $$('[data-venue-instagram]').forEach(function (a) { a.href = venue.instagram || '#'; a.hidden = !venue.instagram; });
    $$('.contact-row').forEach(function (row) {
      var dd = $('dd', row);
      row.hidden = !dd.textContent.trim();
    });

    var langs = state.cfg.languages || [state.lang];
    var lb = $('#langBtn');
    lb.hidden = langs.length < 2;
    lb.textContent = t('langShort');
    lb.title = t('language') + ': ' + t('langName');

    updateFsButton();
  }

  function renderSceneList() {
    var root = $('#sceneList');
    root.textContent = '';
    var groups = (state.cfg.groups || []).slice();
    var known = {};
    groups.forEach(function (g) { known[g.id] = true; });
    var rest = state.cfg.scenes.filter(function (s) { return !known[s.group]; });
    if (rest.length) groups.push({ id: '__rest', title: '' });

    groups.forEach(function (g) {
      var scenes = g.id === '__rest' ? rest : state.cfg.scenes.filter(function (s) { return s.group === g.id; });
      if (!scenes.length) return;
      var sec = el('section', 'scene-group');
      var title = tx(g.title);
      if (title) { var h3 = el('h3'); h3.textContent = title; sec.appendChild(h3); }
      var grid = el('div', 'scene-grid');
      scenes.forEach(function (s) {
        var b = el('button', 'scene-card');
        b.type = 'button';
        b.dataset.id = s.id;
        b.setAttribute('aria-current', s.id === state.sceneId ? 'true' : 'false');
        var th = el('span', 'scene-thumb');
        var img = el('img');
        img.src = thumbUrl(s); img.alt = ''; img.loading = 'lazy'; img.width = 480; img.height = 270;
        var num = el('span', 'scene-num');
        num.textContent = sceneIndex(s.id) + 1;
        th.appendChild(img); th.appendChild(num);
        var name = el('span', 'scene-name');
        name.textContent = tx(s.title);
        b.appendChild(th); b.appendChild(name);
        b.addEventListener('click', function () { goTo(s.id); });
        grid.appendChild(b);
      });
      sec.appendChild(grid);
      root.appendChild(sec);
    });
  }

  // ---------- панели ----------
  function openPanel(panel, trigger, withScrim) {
    closePanels(false);
    state.lastTrigger = trigger || document.activeElement;
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    if (withScrim) $('#scrim').hidden = false;
    if (panel.id === 'drawer') {
      $('#listBtn').setAttribute('aria-expanded', 'true');
      var cur = $('.scene-card[aria-current="true"]', panel);
      if (cur) cur.scrollIntoView({ block: 'nearest' });
    }
    var focusEl = $('[data-close]', panel);
    if (focusEl) setTimeout(function () { focusEl.focus({ preventScroll: true }); }, 50);
  }

  function closePanels(restoreFocus) {
    var wasOpen = false;
    $$('.drawer.is-open, .card.is-open').forEach(function (p) {
      wasOpen = true;
      p.classList.remove('is-open');
      p.setAttribute('aria-hidden', 'true');
    });
    $('#scrim').hidden = true;
    $('#listBtn').setAttribute('aria-expanded', 'false');
    if (wasOpen && restoreFocus !== false && state.lastTrigger && document.contains(state.lastTrigger)) {
      try { state.lastTrigger.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
  }

  function openHsCard(h, div) {
    $('#hsTitle').textContent = tx(h.text);
    var d = tx(h.description);
    $('#hsDesc').textContent = d;
    $('#hsDesc').hidden = !d;
    openPanel($('#hsCard'), div, false);
  }

  // ---------- toast ----------
  var toastTimer;
  function toast(msg, opts) {
    opts = opts || {};
    var tEl = $('#toast');
    tEl.textContent = msg;
    tEl.classList.toggle('is-error', !!opts.error);
    tEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { tEl.classList.remove('is-visible'); }, opts.duration || 3000);
  }

  // ---------- полноэкранный режим ----------
  function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement; }
  function updateFsButton() {
    var on = !!fsElement();
    $('#app').classList.toggle('is-fullscreen', on);
    var key = on ? 'exitFullscreen' : 'fullscreen';
    $('#fsBtn').setAttribute('aria-label', t(key));
    $('#fsBtn').title = t(key);
  }
  function toggleFullscreen() {
    var root = document.documentElement;
    if (fsElement()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else {
      var req = root.requestFullscreen || root.webkitRequestFullscreen;
      var p = req && req.call(root);
      if (p && p.catch) p.catch(function () { /* отказ браузера */ });
    }
  }

  // ---------- язык ----------
  function pickLang() {
    var langs = state.cfg.languages || ['ru'];
    var cands = [params.get('lang'), store('apollo-tour-lang'), state.cfg.defaultLanguage, langs[0]];
    for (var i = 0; i < cands.length; i++) if (cands[i] && langs.indexOf(cands[i]) !== -1) return cands[i];
    return langs[0];
  }

  function setLanguage(lang) {
    return loadJSON('locales/' + lang + '.json').catch(function () { return {}; }).then(function (dict) {
      state.lang = lang;
      state.dict = dict;
      store('apollo-tour-lang', lang);
      var view = getView();
      applyTexts();
      renderSceneList();
      buildViewer(state.sceneId, view);
    });
  }

  // ---------- старт ----------
  function startTour() {
    if (state.started) return;
    state.started = true;
    $('#welcome').classList.add('is-hidden');
    $('#welcome').setAttribute('aria-hidden', 'true');
    $('#pano').focus({ preventScroll: true });
    if (!EDIT && !EMBED) setTimeout(function () { toast(t('dragHint'), { duration: 3500 }); }, 700);
  }

  function bindUI() {
    $('#startBtn').addEventListener('click', startTour);
    $('#prevBtn').addEventListener('click', function () { step(-1); });
    $('#nextBtn').addEventListener('click', function () { step(1); });
    $('#listBtn').addEventListener('click', function (e) {
      if ($('#drawer').classList.contains('is-open')) closePanels(); else openPanel($('#drawer'), e.currentTarget, true);
    });
    $('#infoBtn').addEventListener('click', function (e) {
      if ($('#infoCard').classList.contains('is-open')) closePanels(); else openPanel($('#infoCard'), e.currentTarget, true);
    });
    $('#scrim').addEventListener('click', function () { closePanels(); });
    $$('[data-close]').forEach(function (b) { b.addEventListener('click', function () { closePanels(); }); });

    var fsOk = document.fullscreenEnabled || document.webkitFullscreenEnabled;
    $('#fsBtn').hidden = !fsOk;
    $('#fsBtn').addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', updateFsButton);
    document.addEventListener('webkitfullscreenchange', updateFsButton);

    $('#langBtn').addEventListener('click', function () {
      var langs = state.cfg.languages || [];
      setLanguage(langs[(langs.indexOf(state.lang) + 1) % langs.length]);
    });

    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'Escape') closePanels();
      if (!state.started) return;
      if (e.key === 'PageDown' || e.key === ']') step(1);
      if (e.key === 'PageUp' || e.key === '[') step(-1);
    });

    window.addEventListener('hashchange', function () {
      var id = decodeURIComponent(location.hash.slice(1));
      if (id && id !== state.sceneId && sceneById(id)) goTo(id);
    });
  }

  function loadEditor() {
    var s = document.createElement('script');
    s.src = 'js/editor.js';
    s.onload = function () {
      state.editor = window.TourEditor.create({
        get cfg() { return state.cfg; },
        set cfg(v) { state.cfg = v; },
        get viewer() { return state.viewer; },
        get sceneId() { return state.sceneId; },
        get lang() { return state.lang; },
        t: t, tx: tx, toast: toast, getView: getView, sceneById: sceneById,
        makeHotspot: makeHotspot, goTo: goTo,
        rebuild: function (view) { renderSceneList(); buildViewer(sceneById(state.sceneId) ? state.sceneId : state.cfg.scenes[0].id, view); }
      });
      state.editor.onScene(state.sceneId);
    };
    document.body.appendChild(s);
  }

  function fatal(msg) {
    $('#welcomeStatus').textContent = msg;
    $('#startBtn').disabled = true;
    $('#startBtn').style.opacity = '.5';
  }

  function init() {
    if (location.protocol === 'file:') {
      fatal('Откройте сайт через веб-сервер: запустите start-server.bat (подробнее — README.md).');
      return;
    }
    loadJSON('tour-config.json').then(function (cfg) {
      state.cfg = cfg;
      cfg.settings = cfg.settings || {};
      cfg.defaultLanguage = cfg.defaultLanguage || 'ru';
      state.lang = pickLang();
      state.quality = pickQuality();
      var def = cfg.defaultLanguage;
      return Promise.all([
        loadJSON('locales/' + def + '.json').catch(function () { return {}; }),
        state.lang === def ? null : loadJSON('locales/' + state.lang + '.json').catch(function () { return {}; })
      ]);
    }).then(function (dicts) {
      state.fallbackDict = dicts[0];
      state.dict = dicts[1] || dicts[0];
      applyTexts();
      bindUI();
      var hashId = decodeURIComponent(location.hash.slice(1));
      var first = sceneById(hashId) ? hashId : (sceneById(state.cfg.settings.firstScene) ? state.cfg.settings.firstScene : state.cfg.scenes[0].id);
      renderSceneList();
      $('#welcomeStatus').textContent = t('loading');
      buildViewer(first);
      if (EDIT) { startTour(); loadEditor(); }
      if (EMBED) startTour();
    }).catch(function (err) {
      console.error(err);
      fatal('Ошибка загрузки tour-config.json: ' + err.message +
        (err instanceof SyntaxError ? ' (проверьте запятые и кавычки в файле)' : ''));
    });
  }

  init();
})();
