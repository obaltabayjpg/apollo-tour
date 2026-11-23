/* =========================================================
   Apollo — главная страница
   Данные (цены, контакты, часы, отзывы): data/site.json
   Казахские тексты: locales/kk.json
   ========================================================= */
(function () {
  'use strict';
  document.documentElement.classList.add('js');

  var LANG_KEY = 'apollo-site-lang';
  var params = new URLSearchParams(location.search);
  var data = null;
  var lang = 'ru';
  var dict = {};       // казахский словарь
  var day = 0;         // 0 — будни, 1 — выходные
  var counts = {};

  // Русские строки, которые формирует скрипт (казахские — в locales/kk.json с теми же ключами)
  var RU = {
    'wa.hello': 'Здравствуйте! Пишу с сайта Apollo.',
    'open.now': 'Сейчас открыто · до {close}',
    'open.later': 'Сегодня откроемся в {open}',
    'open.tomorrow': 'Откроемся завтра в {open}',
    'per.child': 'за ребёнка',
    'per.adult': 'за взрослого',
    'free': 'бесплатно',
    'weekday': 'будний день',
    'weekend': 'выходной день',
    'calc.empty': 'Отметьте, кто идёт',
    'calc.msg': 'Здравствуйте! Хотим прийти в Apollo ({day}):\n{list}\nПо расчёту на сайте: {sum}. Подскажите, всё верно?',
    'book.msg': 'Здравствуйте! Хочу забронировать день рождения в Apollo.\nИменинник: {name}\nИсполняется: {age}\nДата: {date}\nДетей-гостей: {guests}\nКомната: {room}\nПожелания: {comment}',
    'dash': '—',
    'tour.iframe': 'Виртуальный 3D-тур по Apollo',
    'rev.source': 'Отзыв в 2ГИС'
  };

  // ---------- утилиты ----------
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function t(key, vars) {
    var s = (lang !== 'ru' && dict[key]) || RU[key] || key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] != null ? vars[k] : ''; });
    return s;
  }
  function tx(v) {
    if (v == null) return '';
    if (typeof v !== 'object') return String(v);
    return v[lang] || v.ru || '';
  }
  function money(n) { return n ? n.toLocaleString('ru-RU').replace(/[  ,]/g, ' ') + ' ₸' : t('free'); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function waUrl(text) { return 'https://wa.me/' + data.contacts.whatsapp + (text ? '?text=' + encodeURIComponent(text) : ''); }

  // Время в Актау (UTC+5, без перехода на летнее время)
  function aktauNow() {
    var off = (data && data.hours && data.hours.utcOffset != null) ? data.hours.utcOffset : 5;
    return new Date(Date.now() + off * 3600e3);
  }
  function toMin(hhmm) { var p = String(hhmm).split(':'); return (+p[0]) * 60 + (+p[1] || 0); }

  // ---------- язык ----------
  function applyI18n() {
    document.documentElement.lang = lang === 'kk' ? 'kk' : 'ru';
    $$('[data-i18n]').forEach(function (e) {
      if (e.dataset.ru == null) e.dataset.ru = e.textContent;
      var v = lang === 'ru' ? null : dict[e.dataset.i18n];
      e.textContent = v || e.dataset.ru;
    });
    $$('[data-i18n-html]').forEach(function (e) {
      if (e.dataset.ruHtml == null) e.dataset.ruHtml = e.innerHTML;
      var v = lang === 'ru' ? null : dict[e.dataset.i18nHtml];
      e.innerHTML = v || e.dataset.ruHtml;   // текст из нашего же файла перевода
    });
    $$('[data-i18n-attr]').forEach(function (e) {
      e.dataset.i18nAttr.split(';').forEach(function (pair) {
        var p = pair.split(':'), attr = p[0], key = p[1];
        var store = 'ru' + attr.replace(/[^a-z]/gi, '');
        if (e.dataset[store] == null) e.dataset[store] = e.getAttribute(attr) || '';
        var v = lang === 'ru' ? null : dict[key];
        e.setAttribute(attr, v || e.dataset[store]);
      });
    });
    $$('[data-lang]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.lang === lang)); });
  }

  function setLang(l) {
    var done = function () {
      lang = l;
      store(LANG_KEY, l);
      applyI18n();
      if (data) renderData();
    };
    if (l === 'ru' || Object.keys(dict).length) return done();
    fetch('locales/kk.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (d) { dict = d; done(); })
      .catch(function () { console.warn('Не удалось загрузить locales/kk.json'); });
  }

  // ---------- данные ----------
  function renderData() {
    var c = data.contacts;
    var tel = 'tel:+' + c.phone.replace(/\D/g, '');
    $$('[data-address]').forEach(function (e) { e.textContent = tx(c.address); });
    $$('[data-hours]').forEach(function (e) { e.textContent = tx(data.hours.text); });
    $$('[data-phone]').forEach(function (e) { e.textContent = c.phone; e.href = tel; });
    $$('[data-call]').forEach(function (e) { e.href = tel; });
    $$('[data-ig]').forEach(function (e) { e.href = c.instagram; if (e.closest('b')) e.textContent = c.instagramHandle; });
    $$('[data-2gis]').forEach(function (e) { e.href = c.map2gis; });
    $$('[data-2gis-reviews]').forEach(function (e) { e.href = c.map2gis.replace(/\/$/, '') + '/tab/reviews'; });
    $$('[data-wa]').forEach(function (e) { e.href = waUrl(t(e.dataset.waText || 'wa.hello')); });
    if (data.rating) {
      $$('[data-rating]').forEach(function (e) { e.textContent = data.rating.value; });
      $$('[data-rating-count]').forEach(function (e) { e.textContent = tx(data.rating.count); });
    }
    renderStatus();
    renderPrices();
    renderReviews();
  }

  function renderStatus() {
    var s = $('#status');
    if (!s || !data.hours) return;
    var now = aktauNow();
    var m = now.getUTCHours() * 60 + now.getUTCMinutes();
    var open = toMin(data.hours.open), close = toMin(data.hours.close);
    var isOpen = m >= open && m < close;
    s.classList.toggle('is-open', isOpen);
    $('span', s).textContent = isOpen ? t('open.now', { close: data.hours.close })
      : (m < open ? t('open.later', { open: data.hours.open }) : t('open.tomorrow', { open: data.hours.open }));
  }

  // ---------- калькулятор ----------
  function calcRow(g) {
    var li = el('li', 'calc-row');
    li.appendChild(el('span', 'calc-badge', g.badge));
    var name = el('span', 'calc-name');
    name.appendChild(el('b', null, tx(g.title)));
    var p = g.price[day];
    name.appendChild(el('small', null, p ? money(p) + ' ' + (g.id === 'ad' ? t('per.adult') : t('per.child')) : t('free')));
    li.appendChild(name);
    var st = el('span', 'stepper');
    var minus = el('button', null, '−'); minus.type = 'button'; minus.dataset.step = '-1'; minus.dataset.id = g.id;
    minus.setAttribute('aria-label', '− ' + tx(g.title));
    minus.disabled = !counts[g.id];
    var out = el('output', null, String(counts[g.id] || 0));
    out.setAttribute('aria-live', 'polite');
    var plus = el('button', null, '+'); plus.type = 'button'; plus.dataset.step = '1'; plus.dataset.id = g.id;
    plus.setAttribute('aria-label', '+ ' + tx(g.title));
    st.appendChild(minus); st.appendChild(out); st.appendChild(plus);
    li.appendChild(st);
    return li;
  }

  function allGroups() { return data.prices.tickets.concat(data.prices.perks || []); }

  function renderPrices() {
    var P = data.prices;
    if (!Object.keys(counts).length) allGroups().forEach(function (g) { counts[g.id] = g.count || 0; });

    $$('.seg [data-day]').forEach(function (b) { b.setAttribute('aria-checked', String(+b.dataset.day === day)); });
    var rows = $('#calcRows'), perks = $('#perkRows');
    rows.textContent = ''; perks.textContent = '';
    P.tickets.forEach(function (g) { rows.appendChild(calcRow(g)); });
    (P.perks || []).forEach(function (g) { perks.appendChild(calcRow(g)); });

    // чек
    var used = allGroups().filter(function (g) { return counts[g.id] > 0; });
    var sum = used.reduce(function (a, g) { return a + counts[g.id] * g.price[day]; }, 0);
    var list = $('#rList');
    list.textContent = '';
    if (!used.length) list.appendChild(el('li', 'empty', t('calc.empty')));
    used.forEach(function (g) {
      var li = el('li');
      li.appendChild(el('span', null, tx(g.title) + ' × ' + counts[g.id]));
      li.appendChild(el('i'));
      li.appendChild(el('b', null, money(counts[g.id] * g.price[day])));
      list.appendChild(li);
    });
    $('#rTotal').textContent = sum ? money(sum) : '0 ₸';
    $('#rDay').textContent = day ? t('weekend') : t('weekday');
    $$('[data-price-note]').forEach(function (e) { e.textContent = tx(P.note); });
    var msg = t('calc.msg', {
      day: day ? t('weekend') : t('weekday'),
      list: used.map(function (g) { return '• ' + tx(g.title) + ' — ' + counts[g.id]; }).join('\n'),
      sum: sum ? money(sum) : '0 ₸'
    });
    $('#rSend').href = waUrl(used.length ? msg : t('wa.hello'));

    // игровая карта и VR
    var gc = P.gameCard;
    $$('[data-game-title]').forEach(function (e) { e.textContent = tx(gc.title); });
    $$('[data-game-note]').forEach(function (e) { e.textContent = tx(gc.note); });
    var gr = $('#gameRows'); gr.textContent = '';
    gc.rows.forEach(function (r) {
      var li = el('li'); li.appendChild(el('span', null, tx(r.label))); li.appendChild(el('b', null, money(r.price))); gr.appendChild(li);
    });
    $$('[data-vr-title]').forEach(function (e) { e.textContent = tx(P.vr.title); });
    $$('[data-vr-price]').forEach(function (e) { e.textContent = money(P.vr.price); });
    $$('[data-vr-note]').forEach(function (e) { e.textContent = tx(P.vr.note); });
  }

  function bindCalc() {
    $('#prices').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.day != null) { day = +b.dataset.day; renderPrices(); return; }
      if (b.dataset.step) {
        var id = b.dataset.id;
        counts[id] = Math.max(0, Math.min(30, (counts[id] || 0) + (+b.dataset.step)));
        renderPrices();
        var again = $('#prices button[data-id="' + id + '"][data-step="' + b.dataset.step + '"]');
        if (again && !again.disabled) again.focus({ preventScroll: true });
      }
    });
  }

  // ---------- отзывы ----------
  function renderReviews() {
    var box = $('#reviewList');
    var list = data.reviews || [];
    $('#reviews').hidden = !list.length && !data.rating;
    box.textContent = '';
    list.forEach(function (r) {
      var a = el('article', 'review');
      a.appendChild(el('span', 'stars', '★★★★★')).setAttribute('aria-hidden', 'true');
      a.appendChild(el('p', null, tx(r.text)));
      var f = el('footer');
      f.appendChild(el('span', 'ava', (r.name || '?').charAt(0).toUpperCase()));
      var who = el('span', null, r.name);
      who.appendChild(el('small', null, t('rev.source')));
      f.appendChild(who);
      a.appendChild(f);
      box.appendChild(a);
    });
  }

  // ---------- 3D-тур на странице ----------
  var iframe = null;
  function loadTour(scene) {
    var frame = $('#tourFrame');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.title = t('tour.iframe');
      iframe.allow = 'fullscreen; accelerometer; gyroscope';
      iframe.src = 'tour/?embed=1#' + encodeURIComponent(scene);
      frame.appendChild(iframe);
      var poster = $('#tourPoster');
      if (poster) poster.remove();
    } else {
      try { iframe.contentWindow.location.hash = encodeURIComponent(scene); }
      catch (e) { iframe.src = 'tour/?embed=1#' + encodeURIComponent(scene); }
    }
    $$('.tour-chips [data-scene]').forEach(function (c) { c.setAttribute('aria-pressed', String(c.dataset.scene === scene)); });
  }

  function bindTour() {
    $('#tourPoster').addEventListener('click', function (e) { loadTour(e.currentTarget.dataset.scene); });
    $$('.tour-chips [data-scene]').forEach(function (c) {
      c.addEventListener('click', function () {
        loadTour(c.dataset.scene);
        var r = $('#tourFrame').getBoundingClientRect();
        if (r.top < 0 || r.bottom > innerHeight) $('#tourFrame').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }

  // ---------- бронь дня рождения ----------
  function bindBooking() {
    var f = $('#bookForm');
    var today = aktauNow().toISOString().slice(0, 10);
    f.date.min = today;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = [];
      if (!f.name.value.trim()) bad.push(f.name);
      if (!f.date.value) bad.push(f.date);
      [f.name, f.date].forEach(function (i) { i.setAttribute('aria-invalid', String(bad.indexOf(i) !== -1)); });
      $('#bookError').hidden = !bad.length;
      if (bad.length) { bad[0].focus(); return; }
      var d = f.date.value.split('-');
      var msg = t('book.msg', {
        name: f.name.value.trim(),
        age: f.age.value || t('dash'),
        date: d[2] + '.' + d[1] + '.' + d[0],
        guests: f.guests.value || t('dash'),
        room: f.room.options[f.room.selectedIndex].text,
        comment: f.comment.value.trim() || t('dash')
      });
      window.open(waUrl(msg), '_blank', 'noopener');
    });
  }

  // ---------- шапка, меню, анимации ----------
  function bindChrome() {
    var header = $('#header');
    var onScroll = function () { header.classList.toggle('is-scrolled', scrollY > 40); };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    var burger = $('#burger'), nav = $('#nav');
    function setMenu(open) {
      nav.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
      if (open) header.classList.add('is-scrolled'); else onScroll();
    }
    burger.addEventListener('click', function () { setMenu(!nav.classList.contains('is-open')); });
    $$('a', nav).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });

    $$('[data-lang]').forEach(function (b) { b.addEventListener('click', function () { setLang(b.dataset.lang); }); });

    $('#year').textContent = new Date().getFullYear();

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
      }, { rootMargin: '0px 0px -8% 0px' });
      $$('.section .sec-head, .tour-frame, .zone, .calc, .pcard, .vip, .book, .review, .step, .contact').forEach(function (e, i) {
        e.classList.add('reveal');
        e.style.transitionDelay = (e.classList.contains('zone') ? (i % 4) * 60 : 0) + 'ms';
        io.observe(e);
      });
    }
  }

  // ---------- старт ----------
  function init() {
    bindChrome();
    bindTour();
    bindCalc();
    bindBooking();

    var wanted = params.get('lang') || store(LANG_KEY);
    var now = aktauNow().getUTCDay();
    day = (now === 0 || now === 6) ? 1 : 0;

    fetch('data/site.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        data = d;
        if (wanted === 'kk') setLang('kk'); else { applyI18n(); renderData(); }
        setInterval(renderStatus, 60000);
      })
      .catch(function (err) {
        console.error('data/site.json:', err);
        applyI18n();
      });
  }

  init();
})();
