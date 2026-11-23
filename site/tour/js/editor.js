/* =========================================================
   Режим редактора тура (открывается по адресу ...?edit=1)
   - клик по панораме → координаты pitch/yaw
   - добавление / перестановка / удаление меток
   - начальный вид сцены, геометрия (haov / vaov / vOffset)
   - скачивание готового tour-config.json
   Изменения автоматически сохраняются как черновик в браузере.
   ========================================================= */
(function () {
  'use strict';

  var DRAFT_KEY = 'apollo-tour-editor-draft';

  function r1(x) { return Math.round(Number(x) * 10) / 10; }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function btn(text, cls, onClick) {
    var b = el('button', 'ed-btn' + (cls ? ' ' + cls : ''), text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function create(api) {
    var t = api.t, tx = api.tx;
    var lastClick = null;   // {pitch, yaw}
    var moving = null;      // метка, которую переставляем
    var selected = null;    // выбранная метка
    var pinScene = null;

    // ---------- разметка панели ----------
    var root = el('section', 'ed');
    root.setAttribute('aria-label', t('ed.title'));
    var head = el('div', 'ed-head');
    head.appendChild(el('strong', null, '✎ ' + t('ed.title')));
    var collapseBtn = btn(t('ed.hide'), 'small', function () {
      var c = root.classList.toggle('is-collapsed');
      collapseBtn.textContent = c ? t('ed.show') : t('ed.hide');
    });
    head.appendChild(collapseBtn);
    var body = el('div', 'ed-body');
    root.appendChild(head);
    root.appendChild(body);
    document.getElementById('app').appendChild(root);

    function section(title) {
      var s = el('div', 'ed-sec');
      if (title) s.appendChild(el('h4', null, title));
      body.appendChild(s);
      return s;
    }

    // Черновик
    var bannerSec = el('div');
    body.appendChild(bannerSec);

    // Сцена и текущий вид
    var secScene = section(t('ed.scene'));
    var sceneLine = el('div', 'ed-row');
    var sceneIdCode = el('code');
    sceneLine.appendChild(sceneIdCode);
    secScene.appendChild(sceneLine);
    var viewLine = el('div', 'ed-row');
    var viewCode = el('code');
    viewLine.appendChild(el('span', 'muted', t('ed.view') + ':'));
    viewLine.appendChild(viewCode);
    secScene.appendChild(viewLine);
    var startRow = el('div', 'ed-row');
    startRow.appendChild(btn(t('ed.setStart'), '', function () {
      var s = curScene(), v = api.getView();
      s.pitch = r1(v.pitch); s.yaw = r1(v.yaw); s.hfov = r1(v.hfov);
      save(); api.toast(t('ed.setStart') + ' ✓');
    }));
    secScene.appendChild(startRow);

    // Точка клика
    var secClick = section(t('ed.click'));
    var clickCoords = el('div', 'ed-coords', '—');
    var clickRow = el('div', 'ed-row');
    clickRow.appendChild(clickCoords);
    clickRow.appendChild(btn(t('ed.copy'), 'small', function () {
      if (!lastClick) return api.toast(t('ed.needClick'));
      copy('"pitch": ' + lastClick.pitch + ', "yaw": ' + lastClick.yaw);
    }));
    secClick.appendChild(clickRow);
    var clickHint = el('p', 'ed-hint', t('ed.clickHint'));
    secClick.appendChild(clickHint);

    // Новая метка
    var secAdd = section(t('ed.add'));
    var typeSel = el('select');
    [['scene', t('ed.typeScene')], ['info', t('ed.typeInfo')]].forEach(function (o) {
      var op = el('option', null, o[1]); op.value = o[0]; typeSel.appendChild(op);
    });
    var targetSel = el('select');
    var textIn = el('input'); textIn.type = 'text';
    var descIn = el('textarea');
    var lType = labeled(t('ed.type'), typeSel);
    var lTarget = labeled(t('ed.target'), targetSel);
    var lText = labeled(t('ed.text'), textIn);
    var lDesc = labeled(t('ed.desc'), descIn);
    [lType, lTarget, lText, lDesc].forEach(function (l) { var r = el('div', 'ed-row'); r.appendChild(l); secAdd.appendChild(r); });
    var addRow = el('div', 'ed-row');
    addRow.appendChild(btn(t('ed.addBtn'), 'primary', addHotspot));
    secAdd.appendChild(addRow);
    function syncAddForm() {
      var isScene = typeSel.value === 'scene';
      lTarget.hidden = !isScene;
      lDesc.hidden = isScene;
      var target = api.sceneById(targetSel.value);
      textIn.placeholder = isScene && target ? tx(target.title) : '';
    }
    typeSel.addEventListener('change', syncAddForm);
    targetSel.addEventListener('change', syncAddForm);

    // Список меток
    var secList = section(t('ed.hotspots'));
    var list = el('ul', 'ed-list');
    secList.appendChild(list);

    // Геометрия
    var secGeo = section(t('ed.geometry'));
    var geo = {};
    var geoRow = el('div', 'ed-row');
    ['haov', 'vaov', 'vOffset'].forEach(function (k) {
      var i = el('input'); i.type = 'number'; i.step = '0.5';
      geo[k] = i;
      var l = labeled(k, i); l.className = 'inline';
      geoRow.appendChild(l);
    });
    secGeo.appendChild(geoRow);
    var geoBtnRow = el('div', 'ed-row');
    geoBtnRow.appendChild(btn(t('ed.apply'), '', function () {
      var s = curScene();
      s.haov = Math.min(360, Math.max(10, r1(geo.haov.value)));
      s.vaov = Math.min(180, Math.max(10, r1(geo.vaov.value)));
      s.vOffset = r1(geo.vOffset.value) || 0;
      save();
      api.rebuild(api.getView());
    }));
    secGeo.appendChild(geoBtnRow);
    secGeo.appendChild(el('p', 'ed-hint', t('ed.geometryHint')));

    // Экспорт
    var secExp = section(t('ed.export'));
    var expRow = el('div', 'ed-row');
    expRow.appendChild(btn(t('ed.download'), 'primary', download));
    expRow.appendChild(btn(t('ed.copyJson'), '', function () { copy(json()); }));
    secExp.appendChild(expRow);
    secExp.appendChild(el('p', 'ed-hint', t('ed.exportHint')));

    function labeled(text, input) {
      var l = el('label');
      l.appendChild(document.createTextNode(text));
      l.appendChild(input);
      return l;
    }

    // ---------- данные ----------
    function curScene() { return api.sceneById(api.sceneId); }
    function json() { return JSON.stringify(api.cfg, null, 2); }
    function save() {
      try { localStorage.setItem(DRAFT_KEY, json()); } catch (e) { /* ignore */ }
    }
    function setText(h, key, value) {
      value = value.trim();
      if (!value) { delete h[key]; return; }
      if (h[key] && typeof h[key] === 'object') h[key][api.lang] = value;
      else { var o = {}; o[api.lang] = value; h[key] = o; }
    }

    function copy(text) {
      var done = function () { api.toast(t('ed.copied')); };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else fallback();
      function fallback() {
        var ta = el('textarea'); ta.value = text; document.body.appendChild(ta);
        ta.select(); try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
        ta.remove();
      }
    }

    function download() {
      var blob = new Blob([json() + '\n'], { type: 'application/json' });
      var a = el('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'tour-config.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }

    // ---------- метки на панораме ----------
    function refreshHotspot(h) {
      var v = api.viewer, id = api.sceneId;
      try { v.removeHotSpot(h._id, id); } catch (e) { /* ignore */ }
      v.addHotSpot(api.makeHotspot(h, id), id);
      markSelected();
    }

    function markSelected() {
      document.querySelectorAll('.hs.is-selected').forEach(function (d) { d.classList.remove('is-selected'); });
      if (selected && selected._id) {
        var d = document.querySelector('.hs[data-hs-id="' + selected._id + '"]');
        if (d) d.classList.add('is-selected');
      }
      list.querySelectorAll('.ed-item').forEach(function (li) {
        li.classList.toggle('is-selected', !!selected && li.dataset.id === selected._id);
      });
    }

    function placePin(p) {
      var v = api.viewer;
      if (pinScene) { try { v.removeHotSpot('__pin', pinScene); } catch (e) { /* ignore */ } }
      pinScene = null;
      if (!p) return;
      v.addHotSpot({ id: '__pin', pitch: p.pitch, yaw: p.yaw, type: 'info', cssClass: 'hs-pin' }, api.sceneId);
      pinScene = api.sceneId;
    }

    function addHotspot() {
      if (!lastClick) return api.toast(t('ed.needClick'));
      var s = curScene();
      var h = { type: typeSel.value, pitch: lastClick.pitch, yaw: lastClick.yaw };
      if (h.type === 'scene') h.target = targetSel.value;
      setText(h, 'text', textIn.value);
      if (h.type === 'info') {
        if (!h.text) return api.toast(t('ed.text') + '?');
        setText(h, 'description', descIn.value);
      }
      s.hotSpots = s.hotSpots || [];
      s.hotSpots.push(h);
      api.viewer.addHotSpot(api.makeHotspot(h, s.id), s.id);
      textIn.value = ''; descIn.value = '';
      selected = h;
      placePin(null);
      save(); renderList();
    }

    // ---------- список меток ----------
    function renderList() {
      list.textContent = '';
      var s = curScene();
      var hs = (s && s.hotSpots) || [];
      if (!hs.length) { list.appendChild(el('li', 'ed-hint', t('ed.none'))); return; }
      hs.forEach(function (h, idx) {
        if (!h._id) api.makeHotspot(h, s.id); // присвоить id
        var li = el('li', 'ed-item');
        li.dataset.id = h._id;
        var top = el('div', 'ed-item-top');
        top.appendChild(el('span', 'ed-dot ' + (h.type === 'scene' ? 'scene' : 'info')));
        var info = h.type === 'scene' ? '→ ' + h.target : 'i';
        top.appendChild(el('code', null, info));
        top.appendChild(el('span', 'muted', 'p ' + r1(h.pitch) + ' · y ' + r1(h.yaw)));
        li.appendChild(top);

        var input = el('input');
        input.type = 'text';
        input.value = tx(h.text);
        if (h.type === 'scene') {
          var tg = api.sceneById(h.target);
          input.placeholder = tg ? tx(tg.title) : '';
        }
        input.setAttribute('aria-label', t('ed.text'));
        input.addEventListener('change', function () { setText(h, 'text', input.value); refreshHotspot(h); save(); });
        li.appendChild(input);

        var row = el('div', 'ed-row');
        row.style.marginTop = '6px';
        var mv = btn(t('ed.move'), 'small' + (moving === h ? ' active' : ''), function () {
          moving = moving === h ? null : h;
          selected = h;
          document.getElementById('pano').classList.toggle('ed-moving', !!moving);
          if (moving) api.toast(t('ed.moveHint'));
          renderList();
        });
        row.appendChild(mv);
        if (h.type === 'scene') row.appendChild(btn(t('ed.open'), 'small', function () { api.goTo(h.target, h); }));
        row.appendChild(btn(t('ed.delete'), 'small danger', function () {
          s.hotSpots.splice(idx, 1);
          try { api.viewer.removeHotSpot(h._id, s.id); } catch (e) { /* ignore */ }
          if (moving === h) moving = null;
          save(); renderList();
        }));
        li.appendChild(row);
        li.addEventListener('click', function (e) {
          if (e.target.closest('button, input')) return;
          selected = h; markSelected();
        });
        list.appendChild(li);
      });
      markSelected();
    }

    // ---------- клик по панораме ----------
    var pano = document.getElementById('pano');
    var down = null;
    pano.addEventListener('pointerdown', function (e) {
      down = { x: e.clientX, y: e.clientY, onHs: !!(e.target.closest && e.target.closest('.hs')) };
    }, true);
    pano.addEventListener('pointerup', function (e) {
      if (!down) return;
      var d = down; down = null;
      if (d.onHs || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
      var c = api.viewer && api.viewer.mouseEventToCoords(e);
      if (!c || isNaN(c[0])) return;
      var p = { pitch: r1(c[0]), yaw: r1(c[1]) };
      if (moving) {
        moving.pitch = p.pitch; moving.yaw = p.yaw;
        var h = moving; moving = null;
        pano.classList.remove('ed-moving');
        refreshHotspot(h);
        save(); renderList();
        return;
      }
      lastClick = p;
      clickCoords.textContent = 'pitch ' + p.pitch + '   yaw ' + p.yaw;
      placePin(p);
    }, true);

    // ---------- живые координаты вида ----------
    setInterval(function () {
      var v = api.getView();
      if (v) viewCode.textContent = 'pitch ' + r1(v.pitch) + ' · yaw ' + r1(v.yaw) + ' · hfov ' + r1(v.hfov);
    }, 250);

    // ---------- черновик ----------
    var draft = null;
    try { draft = localStorage.getItem(DRAFT_KEY); } catch (e) { /* ignore */ }
    if (draft && draft !== json()) {
      var b = el('div', 'ed-banner');
      b.appendChild(el('div', null, t('ed.draftFound')));
      var br = el('div', 'ed-row'); br.style.marginTop = '8px';
      br.appendChild(btn(t('ed.restore'), 'primary small', function () {
        try { api.cfg = JSON.parse(draft); } catch (e) { return api.toast('JSON error', { error: true }); }
        b.remove();
        api.rebuild(null);
      }));
      br.appendChild(btn(t('ed.discard'), 'small', function () {
        try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
        b.remove();
      }));
      b.appendChild(br);
      bannerSec.appendChild(b);
    }

    // ---------- API для app.js ----------
    return {
      onScene: function (id) {
        var s = api.sceneById(id);
        if (!s) return;
        placePin(null);
        moving = null; selected = null; lastClick = null;
        pano.classList.remove('ed-moving');
        clickCoords.textContent = '—';
        sceneIdCode.textContent = id;
        geo.haov.value = s.haov; geo.vaov.value = s.vaov; geo.vOffset.value = s.vOffset || 0;

        targetSel.textContent = '';
        var idx = api.cfg.scenes.indexOf(s);
        api.cfg.scenes.forEach(function (sc, i) {
          var op = el('option', null, (i + 1) + ' · ' + tx(sc.title));
          op.value = sc.id;
          targetSel.appendChild(op);
        });
        var next = api.cfg.scenes[idx + 1] || api.cfg.scenes[idx - 1];
        if (next) targetSel.value = next.id;
        syncAddForm();
        renderList();
      },
      // клик по метке в режиме редактора — выбрать её, а не переходить
      onHotspotClick: function (h) {
        selected = h;
        markSelected();
        var li = list.querySelector('.ed-item[data-id="' + h._id + '"]');
        if (li) li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return true;
      }
    };
  }

  window.TourEditor = { create: create };
})();
