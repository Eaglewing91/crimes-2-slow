// ==UserScript==
// @name         Crimes 2.Slow
// @namespace    eaglewing.torn.smuggling
// @version      3.1.0
// @description  Just for a laugh: two unofficial crimes (Smuggling and Assassination) to mess about with until a new crime is released officially.
// @author       Eaglewing
// @match        https://www.torn.com/page.php?sid=crimes*
// @run-at       document-idle
// @grant        none
// @license      MIT
// @homepageURL  https://github.com/Eaglewing91/crimes-2-slow
// @downloadURL  https://raw.githubusercontent.com/Eaglewing91/crimes-2-slow/main/crimes-2-slow.user.js
// @updateURL    https://raw.githubusercontent.com/Eaglewing91/crimes-2-slow/main/crimes-2-slow.user.js
// ==/UserScript==

/*
 * Crimes 2.Slow
 * Made just for a laugh. Something to mess about with while we wait for Torn to
 * release a new crime officially. Nothing here is real: no nerve is spent, no money
 * or items are gained, and nothing touches your actual crime stats. Progress is
 * kept only in your own browser.
 *
 * Compliance: no network requests of any kind (no fetch/XHR, no images, no API
 * key), and no clicks on Torn elements. Only edits the DOM of the page being
 * viewed and uses localStorage. All artwork is inline SVG; level stars reuse
 * Torn's own already-loaded star styles. Hub tiles are plain links (same tab):
 * one user click = one normal page load. The 1s timer only updates countdown
 * text and the routine pin.
 */

(function () {
  'use strict';

  const URL_HUB = '/page.php?sid=crimes#/';
  const URL_ARSON = '/page.php?sid=crimes#/arson';
  const crimeUrl = (c) => '/page.php?sid=crimes&crime=' + c.slug + '#/';

  /* ================= shared helpers ================= */

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const shuffle = (a) => a.slice().sort(() => Math.random() - 0.5);
  const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const skillOf = (xp) => Math.min(100, 1 + Math.sqrt(xp / 6));
  const levelOf = (xp) => Math.floor(skillOf(xp));
  const progressOf = (xp) => (levelOf(xp) >= 100 ? 100 : Math.round((skillOf(xp) % 1) * 100));
  const fmt = (ms) => {
    const t = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  };

  function store(key, defaults, fix) {
    return {
      load() {
        let s;
        try { s = Object.assign(defaults(), JSON.parse(localStorage.getItem(key) || '{}')); }
        catch (e) { s = defaults(); }
        if (fix) fix(s);
        return s;
      },
      save(s) { try { localStorage.setItem(key, JSON.stringify(s)); } catch (e) { /* ignore */ } },
    };
  }

  const svgIcon = (inner, size) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16" fill="currentColor">${inner}</svg>`;

  const ICON_OK = '<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M4 7.2l2.1 2L10 5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
  const ICON_FAIL = '<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M4.5 4.5l5 5M9.5 4.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
  const ICON_CRIT = '<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M7 3.5v4.6M7 9.6v1.2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
  const ICON_ARROW = '<svg width="18" height="44" viewBox="0 0 18 44"><path d="M0,44,15,22h3L3,44ZM15,22,0,0H3L18,22Z" fill="currentColor"/></svg>';

  function commitBtn(label, nerve, attr, why) {
    return `<button type="button" class="torn-btn tcx-btn${why ? ' disabled' : ''}" ${attr}
      aria-disabled="${why ? 'true' : 'false'}" ${why ? `title="${why}"` : ''}>
      <span>${label}</span>${nerve == null ? '' : `<u></u><span>${nerve}</span>`}</button>`;
  }

  const outcomeHtml = (o) => (o ? `<div class="tcx-outcome ${o.type}"><b>${o.title}</b>${o.text}</div>` : '');

  /* ---------- Torn level stars (reuses Torn's loaded star sprite classes) ---------- */

  // Level -> [star group, row] as used by Torn's star sprite.
  function starParts(lvl) {
    if (lvl >= 100) return [5, 0];
    if (lvl >= 75) return [4, lvl - 75];
    if (lvl >= 50) return [3, lvl - 50];
    if (lvl >= 25) return [2, lvl - 25];
    if (lvl >= 2) return [1, lvl - 2];
    return [0, 0];
  }

  let starMap = null;
  function starClasses() {
    if (starMap && Object.keys(starMap).length > 30) return starMap;
    const map = {};
    const add = (cls) => {
      const k = cls.split('___')[0];
      if (/^(group\d|row\d+)$/.test(k)) map[k] = cls;
    };
    const walk = (rules) => {
      Array.from(rules || []).forEach((r) => {
        if (r.cssRules) walk(r.cssRules);
        const t = r.selectorText;
        if (t && t.indexOf('___') >= 0) (t.match(/\.(group\d|row\d+)___[\w-]+/g) || []).forEach((c) => add(c.slice(1)));
      });
    };
    Array.from(document.styleSheets).forEach((sh) => {
      try { walk(sh.cssRules); } catch (e) { /* cross-origin sheet, skip */ }
    });
    document.querySelectorAll('[class*="levelStar___"], [class*="number___"]').forEach((el) => el.classList.forEach(add));
    starMap = map;
    return map;
  }

  // Sets a cloned Torn star element to a level. Returns false if the classes aren't available.
  function applyStar(star, lvl) {
    const [g, r] = starParts(lvl);
    const map = starClasses();
    const num = star.querySelector('[class*="number___"]');
    if (!num || !map['group' + g] || !map['row' + r]) return false;
    const key = g + ':' + r;
    if (star.dataset.tcx === key) return true;
    Array.from(star.classList).filter((c) => /^group\d___/.test(c)).forEach((c) => star.classList.remove(c));
    star.classList.add(map['group' + g]);
    Array.from(num.classList).filter((c) => /^row\d+___/.test(c)).forEach((c) => num.classList.remove(c));
    num.classList.add(map['row' + r]);
    star.dataset.tcx = key;
    return true;
  }

  /* ================= crime: Smuggling ================= */

  const SMUGGLING = (() => {
    const BOARD_SIZE = 8;
    const MAX_TRANSIT = 5;
    const ROUTE_ORDER = ['road', 'rail', 'sea', 'air', 'mule'];
    const ROUTES = {
      road: { name: 'Road', nerve: 4, secs: 45, base: 0.86, mult: 1.0,
        go: 'A shipment of {c} leaves town behind a false panel in a delivery van.',
        icon: '<path d="M1 4h8v6H1zM10 6h3l2 2v2h-5zM3.5 12.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM12 12.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/>' },
      rail: { name: 'Rail', nerve: 5, secs: 90, base: 0.88, mult: 1.1,
        go: 'A shipment of {c} is sealed inside a grain car on the night freight.',
        icon: '<path fill-rule="evenodd" d="M4 1h8a2 2 0 012 2v7a2 2 0 01-2 2l1.5 3h-1.7l-1-2H5.2l-1 2H2.5L4 12a2 2 0 01-2-2V3a2 2 0 012-2zm0 2v3h8V3zM5 10a1 1 0 100-2 1 1 0 000 2zm6 0a1 1 0 100-2 1 1 0 000 2z"/>' },
      sea: { name: 'Sea', nerve: 6, secs: 180, base: 0.92, mult: 1.3,
        go: 'A shipment of {c} is buried at the bottom of a container bound for the docks.',
        icon: '<path fill-rule="evenodd" d="M7 1h2v3h3v3l2 1-1.5 5h-9L2 8l2-1V4h3zM5.5 5.5v1l2.5-1 2.5 1v-1zM1 14.5c1.2 0 1.2-.8 2.3-.8s1.2.8 2.4.8 1.2-.8 2.3-.8 1.2.8 2.3.8 1.2-.8 2.4-.8 1.1.8 2.3.8V16H1z"/>' },
      air: { name: 'Air', nerve: 8, secs: 30, base: 0.80, mult: 1.2,
        go: 'A shipment of {c} is loaded into the hold of a cargo plane.',
        icon: '<path d="M8 0c.8 0 1.2.9 1.2 2v3.5L15 9v1.6L9.2 8.8V13l1.8 1.3V16L8 15l-3 1v-1.7L6.8 13V8.8L1 10.6V9l5.8-3.5V2C6.8.9 7.2 0 8 0z"/>' },
      mule: { name: 'Courier', nerve: 3, secs: 60, base: 0.78, mult: 0.8,
        go: 'A nervous courier boards a bus with a shipment of {c} taped under their coat.',
        icon: '<path d="M8 4a2 2 0 100-4 2 2 0 000 4zM5.5 5h5A1.5 1.5 0 0112 6.5V11h-1.3v5H8.6v-4.5H7.4V16H5.3v-5H4V6.5A1.5 1.5 0 015.5 5z"/>' },
    };

    const CARGO = [
      { name: 'Cigarettes',           lvl: 1,  routes: ['road', 'rail', 'sea', 'mule'], pay: [600, 1800],       xp: 5,  col: '#b5482f' },
      { name: 'Counterfeit Handbags', lvl: 1,  routes: ['road', 'rail', 'sea', 'air'],  pay: [900, 2600],       xp: 6,  col: '#a8559b' },
      { name: 'Bootleg DVDs',         lvl: 5,  routes: ['road', 'rail', 'mule'],        pay: [1500, 4000],      xp: 7,  col: '#2f6f8f' },
      { name: 'Fireworks',            lvl: 10, routes: ['road', 'rail', 'sea'],         pay: [3000, 9000],      xp: 9,  col: '#c98a2b' },
      { name: 'Plushies',             lvl: 15, routes: ['air', 'mule'],                 pay: [6000, 15000],     xp: 11, col: '#d98fb0' },
      { name: 'Exotic Pets',          lvl: 25, routes: ['road', 'sea', 'air'],          pay: [12000, 40000],    xp: 14, col: '#3d7a4a' },
      { name: 'Stolen Cars',          lvl: 40, routes: ['rail', 'sea'],                 pay: [45000, 120000],   xp: 18, col: '#6b7480' },
      { name: 'Antiquities',          lvl: 55, routes: ['sea', 'air', 'mule'],          pay: [90000, 260000],   xp: 23, col: '#b59a55' },
      { name: 'Xanax',                lvl: 75, routes: ['sea', 'air', 'mule'],          pay: [400000, 1200000], xp: 30, col: '#5a8fd0' },
    ];

    const TEXT = {
      win: [
        'The shipment of {c} clears inspection under a pile of bananas. Your buyer pays {cash}.',
        'A customs officer waves the {c} through without looking up. You pocket {cash}.',
        'You swap the manifest at the last second and the {c} change hands for {cash}.',
        'The drop goes exactly to plan. The {c} are gone and {cash} lands in your hand.',
        'Your contact counts the {c} twice, shrugs, and hands over {cash}.',
      ],
      fail: [
        'Your contact never shows. You dump the {c} and go home.',
        'A sniffer dog takes an interest in the {c}, so the run is abandoned.',
        'The paperwork does not add up and the {c} are turned back at the border.',
        'The buyer gets cold feet and refuses to take the {c}.',
      ],
      crit: [
        'Customs tear the shipment apart and seize the {c}. They are watching that route now.',
        'An informant tipped off the port authority. The {c} are gone and the route is burned.',
      ],
    };

    const zero = () => ({ road: 0, rail: 0, sea: 0, air: 0, mule: 0 });
    const DEFAULTS = () => ({
      xp: 0, ok: 0, fail: 0, crit: 0, cash: 0, sent: 0, seized: 0, seq: 1,
      used: zero(), heat: zero(), heatT: Date.now(), board: [], transit: [],
    });

    function fillBoard(s) {
      const lvl = levelOf(s.xp);
      const open = CARGO.map((c, i) => i).filter((i) => CARGO[i].lvl <= lvl);
      while (s.board.length < BOARD_SIZE) {
        const c = pick(open);
        const p = CARGO[c].pay;
        s.board.push({ id: s.seq++, c, pay: Math.round(p[0] + Math.random() * (p[1] - p[0])) });
      }
    }

    const db = store('tcs_smuggling_v2', DEFAULTS, (s) => {
      s.used = Object.assign(zero(), s.used);
      s.heat = Object.assign(zero(), s.heat);
      const mins = Math.floor((Date.now() - s.heatT) / 60000);
      if (mins > 0) {
        ROUTE_ORDER.forEach((r) => { s.heat[r] = Math.max(0, s.heat[r] - mins * 4); });
        s.heatT += mins * 60000;
      }
      fillBoard(s);
    });

    const crate = (col) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">
        <rect x="3" y="6" width="28" height="23" rx="2" fill="${col}"/>
        <rect x="3" y="6" width="28" height="5" fill="rgba(0,0,0,.28)"/>
        <path d="M9 11v18M15 11v18M21 11v18M27 11v18" stroke="rgba(0,0,0,.22)" stroke-width="1.5"/>
        <rect x="3" y="6" width="28" height="23" rx="2" fill="none" stroke="rgba(0,0,0,.45)"/>
      </svg>`;

    const BANNER = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 784 125" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="tcs-sky" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#08111d"/><stop offset="1" stop-color="#1c3a4f"/></linearGradient>
          <linearGradient id="tcs-sea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#12303f"/><stop offset="1" stop-color="#07141c"/></linearGradient>
        </defs>
        <rect width="784" height="125" fill="url(#tcs-sky)"/>
        <circle cx="660" cy="26" r="11" fill="#f3e9c6" opacity=".9"/>
        <path d="M0 74V58h18v-8h14v14h20V44h16v22h24V54h12v16h30V48h10v-8h12v30h26V60h18v10h40V50h14v20h30V56h20v14h44V46h12v24h28V58h16v12h36V52h14v18h30V62h22v8h40V48h16v22h30V56h14v18z" fill="#0d1f2e"/>
        <rect y="74" width="784" height="51" fill="url(#tcs-sea)"/>
        <g class="tcx-shimmer" fill="#7fb6cf">
          <rect x="90" y="82" width="34" height="1"/><rect x="250" y="88" width="50" height="1"/><rect x="430" y="80" width="28" height="1"/>
          <rect x="540" y="90" width="44" height="1"/><rect x="640" y="84" width="60" height="1"/><rect x="690" y="94" width="30" height="1"/>
        </g>
        <g class="tcx-ship">
          <path d="M0 72h120l-10 14H12z" fill="#16222c"/>
          <rect x="18" y="62" width="18" height="10" fill="#b5482f"/><rect x="38" y="62" width="18" height="10" fill="#2f6f8f"/>
          <rect x="58" y="62" width="18" height="10" fill="#c98a2b"/><rect x="28" y="52" width="18" height="10" fill="#3d7a4a"/>
          <rect x="88" y="54" width="16" height="18" fill="#26343f"/><rect x="92" y="58" width="3" height="3" fill="#f6d77a"/><rect x="98" y="58" width="3" height="3" fill="#f6d77a"/>
        </g>
        <polygon class="tcx-beam" points="560,100 500,0 620,0" fill="#fff" opacity=".07"/>
        <rect y="98" width="784" height="27" fill="#0b1219"/>
        <rect y="98" width="784" height="2" fill="#27343f"/>
        <g transform="translate(40 68)">
          <rect x="0" y="16" width="46" height="16" fill="#b5482f"/><rect x="48" y="16" width="46" height="16" fill="#2f6f8f"/>
          <rect x="96" y="16" width="46" height="16" fill="#c98a2b"/><rect x="10" y="0" width="46" height="16" fill="#3d7a4a"/>
          <rect x="58" y="0" width="46" height="16" fill="#6b7480"/>
        </g>
        <g stroke="#1a2732" stroke-width="4" fill="none"><path d="M330 100V22M312 22h130M330 22l-24 26M430 22v28"/></g>
        <rect x="422" y="50" width="16" height="10" fill="#c98a2b"/>
        <g transform="translate(610 82)"><rect width="34" height="14" fill="#d8d8d8"/><rect x="34" y="5" width="12" height="9" fill="#9aa6ad"/><circle cx="9" cy="16" r="3.5" fill="#111"/><circle cx="37" cy="16" r="3.5" fill="#111"/></g>
      </svg>`;

    const TILE_BG = 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice">' +
      '<defs><linearGradient id="s" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#08111d"/><stop offset="1" stop-color="#1c3a4f"/></linearGradient></defs>' +
      '<rect width="200" height="120" fill="url(#s)"/><circle cx="160" cy="24" r="9" fill="#f3e9c6" opacity=".9"/>' +
      '<rect y="78" width="200" height="42" fill="#0c2331"/><rect y="96" width="200" height="24" fill="#0b1219"/>' +
      '<rect x="14" y="80" width="40" height="16" fill="#b5482f"/><rect x="56" y="80" width="40" height="16" fill="#2f6f8f"/>' +
      '<rect x="98" y="80" width="40" height="16" fill="#c98a2b"/><rect x="24" y="64" width="40" height="16" fill="#3d7a4a"/>' +
      '<rect x="66" y="64" width="40" height="16" fill="#6b7480"/>' +
      '<path d="M150 96V40M140 40h50M150 40l-14 16" stroke="#1a2732" stroke-width="4" fill="none"/></svg>');

    const sel = {};
    let outcomes = {};
    let done = [];

    const say = (tpl, cargo, cash) =>
      tpl.replace('{c}', cargo.name.toLowerCase()).replace('{cash}', '<b class="inl">' + money(cash || 0) + '</b>');

    function boardRow(s, job) {
      const cargo = CARGO[job.c];
      const chosen = sel[job.id];
      const route = chosen && ROUTES[chosen];
      const full = s.transit.length >= MAX_TRANSIT;

      const buttons = ROUTE_ORDER.map((r) => {
        if (!cargo.routes.includes(r)) return '<span class="tcx-round none"></span>';
        const h = s.heat[r];
        const cls = (chosen === r ? ' sel' : '') + (h >= 60 ? ' hot' : h >= 30 ? ' warm' : '');
        return `<button type="button" class="tcx-round${cls}" data-id="${job.id}" data-route="${r}" title="${ROUTES[r].name}" aria-label="${ROUTES[r].name}">${svgIcon(ROUTES[r].icon, 16)}</button>`;
      }).join('');

      const why = !route ? "You haven't selected a route" : full ? 'All of your crews are busy' : '';
      return `
        <div class="tcx-row">
          <div class="tcx-img">${crate(cargo.col)}</div>
          <div class="tcx-sec grow">${cargo.name}</div>
          <div class="tcx-sec">${buttons}</div>
          <div class="tcx-sec reqs">
            <div class="tcx-req">${route ? fmt(route.secs * 1000) : '?'}</div>
            <div class="tcx-req">${route ? 'x' + route.mult.toFixed(1) : '?'}</div>
          </div>
          <div class="tcx-sec commit">${commitBtn('Smuggle', route ? route.nerve : '?', `data-go="${job.id}"`, why)}</div>
        </div>${outcomeHtml(outcomes[job.id])}`;
    }

    function transitRow(ship, finished) {
      const cargo = CARGO[ship.c];
      const route = ROUTES[ship.r];
      const left = ship.eta - Date.now();
      const arrived = left <= 0;
      const time = finished ? 'Collected'
        : arrived ? 'Arrived' : `<span class="tcx-eta" data-eta="${ship.eta}">${fmt(left)}</span>`;
      const status = finished ? route.name
        : arrived ? 'At the drop' : 'In transit <span class="tcx-dots"><i></i><i></i><i></i></span>';
      const btn = finished ? ''
        : commitBtn('Collect', 2, `data-collect="${ship.id}"`, arrived ? '' : "This shipment hasn't arrived yet");
      return `
        <div class="tcx-row">
          <div class="tcx-img">${svgIcon(route.icon, 22)}</div>
          <div class="tcx-sec grow">${cargo.name}</div>
          <div class="tcx-sec time">${time}</div>
          <div class="tcx-sec status">${status}</div>
          <div class="tcx-sec commit">${btn}</div>
        </div>${outcomeHtml(outcomes[ship.id])}`;
    }

    function body(s) {
      const transit = done.map((t) => transitRow(t, true)).join('') + s.transit.map((t) => transitRow(t, false)).join('');
      return `<div class="tcx-group">${s.board.map((j) => boardRow(s, j)).join('')}</div>
        ${transit ? `<div class="tcx-group sep">${transit}</div>` : ''}`;
    }

    function dispatch(id) {
      const s = db.load();
      const i = s.board.findIndex((j) => j.id === id);
      const r = sel[id];
      if (i < 0 || !r || s.transit.length >= MAX_TRANSIT) return;
      done = [];
      outcomes = {};
      const job = s.board.splice(i, 1)[0];
      const route = ROUTES[r];
      s.transit.push({ id: job.id, c: job.c, pay: job.pay, r, eta: Date.now() + route.secs * 1000, h: s.heat[r] });
      s.heat[r] = clamp(s.heat[r] + 12, 0, 100);
      s.used[r] += 1;
      s.sent += 1;
      delete sel[id];
      outcomes[job.id] = { type: 'info', title: 'Shipment dispatched', text: say(route.go, CARGO[job.c]) };
      fillBoard(s);
      db.save(s);
    }

    function collect(id) {
      const s = db.load();
      const i = s.transit.findIndex((t) => t.id === id);
      if (i < 0 || s.transit[i].eta > Date.now()) return;
      done = [];
      outcomes = {};
      const ship = s.transit.splice(i, 1)[0];
      const cargo = CARGO[ship.c];
      const route = ROUTES[ship.r];
      const chance = clamp(route.base + levelOf(s.xp) * 0.001 - (ship.h || 0) * 0.004, 0.1, 0.97);
      const roll = Math.random();
      if (roll < chance) {
        const cash = ship.pay * route.mult;
        s.ok += 1; s.cash += cash; s.xp += cargo.xp;
        outcomes[id] = { type: 'ok', title: 'Success', text: say(pick(TEXT.win), cargo, cash) };
      } else if (roll < chance + (1 - chance) * 0.65) {
        s.fail += 1; s.xp += 1;
        outcomes[id] = { type: 'fail', title: 'Failure', text: say(pick(TEXT.fail), cargo) };
      } else {
        s.crit += 1; s.seized += 1;
        s.heat[ship.r] = clamp(s.heat[ship.r] + 30, 0, 100);
        outcomes[id] = { type: 'crit', title: 'Critical failure', text: say(pick(TEXT.crit), cargo) };
      }
      done.push(ship);
      db.save(s);
    }

    function click(e) {
      let b;
      if ((b = e.target.closest('[data-route]'))) {
        const id = Number(b.dataset.id);
        sel[id] = sel[id] === b.dataset.route ? undefined : b.dataset.route;
        return true;
      }
      if ((b = e.target.closest('[data-go]'))) {
        if (!b.classList.contains('disabled')) dispatch(Number(b.dataset.go));
        return true;
      }
      if ((b = e.target.closest('[data-collect]'))) {
        if (!b.classList.contains('disabled')) collect(Number(b.dataset.collect));
        return true;
      }
      return false;
    }

    return {
      slug: 'smuggling', name: 'Smuggling', type: 'Illicit services', db, banner: BANNER, tileBg: TILE_BG, body, click,
      stats: (s) => [
        ['Money earned', money(s.cash)], ['Shipments dispatched', s.sent], ['Shipments seized', s.seized],
        ['Road runs', s.used.road], ['Rail runs', s.used.rail], ['Sea runs', s.used.sea],
        ['Air runs', s.used.air], ['Courier runs', s.used.mule], ['Crews', s.transit.length + ' / ' + MAX_TRANSIT],
      ],
      tileStatus: (s) => (s.transit.length ? { n: s.transit.length, label: 'Shipments in transit' } : null),
    };
  })();

  /* ================= crime: Assassination ================= */

  const ASSASSINATION = (() => {
    const MAX_OPEN = 4;
    const PERIOD = 300000; // one full target routine, in ms

    const I_EYE = '<path fill-rule="evenodd" d="M8 3C4 3 1 8 1 8s3 5 7 5 7-5 7-5-3-5-7-5zm0 8a3 3 0 110-6 3 3 0 010 6zm0-1.6a1.4 1.4 0 100-2.8 1.4 1.4 0 000 2.8z"/>';
    const I_GUN = '<path d="M1 4h13v3h-2l-1 1H8.5l-.8 4H4.5l.9-4H1z"/>';
    const I_FEET = '<ellipse cx="5" cy="5" rx="2" ry="3.2"/><ellipse cx="11" cy="9" rx="2" ry="3.2"/><rect x="3.6" y="9" width="2.8" height="2.2" rx="1"/><rect x="9.6" y="13" width="2.8" height="2.2" rx="1"/>';
    const I_CROSS = '<path fill-rule="evenodd" d="M8 1.5a6.5 6.5 0 110 13 6.5 6.5 0 010-13zm0 1.6a4.9 4.9 0 100 9.8 4.9 4.9 0 000-9.8z"/><path d="M7.3 0h1.4v5H7.3zM7.3 11h1.4v5H7.3zM0 7.3h5v1.4H0zM11 7.3h5v1.4h-5z"/>';
    const I_FILE = '<path fill-rule="evenodd" d="M2 2h7l1.5 1.5H14V14H2zm2 4v1.3h8V6zm0 3v1.3h5V9z"/>';

    const STEPS = [
      { name: 'Surveillance', verb: 'Watch', nerve: 3, wait: 30, icon: I_EYE },
      { name: 'Arming', verb: 'Arm', nerve: 4, wait: 20, icon: I_GUN },
      { name: 'Approach', verb: 'Close In', nerve: 5, wait: 40, icon: I_FEET },
      { name: 'Hit', verb: 'Strike', nerve: 8, wait: 0, icon: I_CROSS },
    ];

    const WEAPONS = {
      pistol: { name: 'Silenced Pistol', icon: I_GUN },
      rifle: { name: 'Sniper Rifle', icon: '<path d="M0 7h9V6h7v2h-5l-1 1H7.5l-.8 3H4.6l.8-3H0zM3 4.6h4v1.2H3z"/>' },
      poison: { name: 'Poison', icon: '<path d="M6 1h4v1.6H9.2v3.2l4.2 7a1.5 1.5 0 01-1.3 2.2H3.9a1.5 1.5 0 01-1.3-2.2l4.2-7V2.6H6z"/>' },
      blade: { name: 'Blade', icon: '<path d="M2.2 14.6l1.6-1.6 1 1-1.6 1.6zM4.4 11.6L13.2 2.8 15 2l-.8 1.8-8.8 8.8z"/>' },
      accident: { name: 'Staged Accident', icon: '<path fill-rule="evenodd" d="M8 1l7.5 14H.5zM7.2 6v4.8h1.6V6zm0 6v1.6h1.6V12z"/>' },
    };
    const W_IDS = Object.keys(WEAPONS);

    const TIERS = [
      { name: 'Street Dealer',   lvl: 1,  base: 0.80, pay: [3000, 8000],       xp: 8,  col: '#6b7480' },
      { name: 'Debt Collector',  lvl: 1,  base: 0.78, pay: [5000, 12000],      xp: 9,  col: '#7a6a55' },
      { name: 'Loan Shark',      lvl: 1,  base: 0.76, pay: [8000, 18000],      xp: 10, col: '#2f6f8f' },
      { name: 'Bent Accountant', lvl: 25, base: 0.72, pay: [30000, 70000],     xp: 14, col: '#3d7a4a' },
      { name: 'Crooked Cop',     lvl: 25, base: 0.70, pay: [50000, 110000],    xp: 16, col: '#2b4c9a' },
      { name: 'Smuggling Fence', lvl: 25, base: 0.68, pay: [70000, 150000],    xp: 17, col: '#4a7a8a' },
      { name: 'Gang Lieutenant', lvl: 50, base: 0.64, pay: [200000, 450000],   xp: 23, col: '#8a2f2f' },
      { name: 'Union Boss',      lvl: 50, base: 0.61, pay: [400000, 900000],   xp: 26, col: '#c98a2b' },
      { name: 'Casino Owner',    lvl: 75, base: 0.57, pay: [900000, 2000000],  xp: 32, col: '#a83a6a' },
      { name: 'Corrupt Judge',   lvl: 75, base: 0.55, pay: [1200000, 2600000], xp: 35, col: '#4a4a4a' },
      { name: 'Rival Kingpin',   lvl: 75, base: 0.52, pay: [1500000, 3500000], xp: 38, col: '#6a3a9a' },
    ];

    const PLACES = [
      { n: 'Home', k: 'Home' }, { n: 'Commute', k: 'Road' }, { n: 'Office', k: 'Work' }, { n: 'Lunch', k: 'Food' },
      { n: 'Gym', k: 'Gym' }, { n: 'Bar', k: 'Bar' }, { n: 'Nightclub', k: 'Club' }, { n: 'Casino', k: 'Bets' },
      { n: 'Barber', k: 'Hair' }, { n: 'Park', k: 'Park' },
    ];
    const EXPOSURE = ['Guarded', 'Exposed', 'Wide open'];
    const EXP_MOD = [-0.25, 0, 0.15];

    const FIRST = ['Vinnie', 'Sal', 'Dmitri', 'Marco', 'Lenny', 'Frankie', 'Rocco', 'Ivan', 'Gus', 'Benny', 'Nico', 'Carla', 'Dolores', 'Rita', 'Mags', 'Teddy'];
    const NICK = ['The Weasel', 'Two-Times', 'Knuckles', 'Smiles', 'The Accountant', 'Big Ears', 'Slick', 'Cashbox', 'Whispers', 'Lucky'];
    const LAST = ['Morello', 'Kowalski', 'Vance', 'Petrov', 'Delgado', 'Falcone', 'Bianchi', 'Grieves', 'Lusk', 'Marchetti', 'Dunmore', 'Sokolov'];
    const randomName = () =>
      pick(FIRST) + (Math.random() < 0.6 ? ' "' + pick(NICK) + '" ' : ' ') + pick(LAST);

    const TEXT = {
      accept: [
        'A sealed envelope arrives with a photo of {t} and an address. The client is offering {cash}.',
        'A voice on a payphone gives you a name: {t}. The fee is {cash}, half up front.',
      ],
      ok: [
        ['You tail {t} for a day and map out their routine. They look most vulnerable to a {ideal}.'],
        ['You pick up a {w} from a contact who asks no questions.'],
        ['You slip into position near {t} without anyone noticing.', 'You blend into the crowd a few steps behind {t}.'],
        ['{t} never saw it coming. The client wires {cash}.', 'Clean work. By the time anyone looks, you are long gone. The client pays {cash}.'],
      ],
      fail: [
        ['{t} keeps to the shadows today. You learn nothing new.'],
        ['Your supplier is a no-show. Try again later.'],
        ['Too many witnesses around {t}. You back off for now.'],
        ['You hesitate and {t} slips away into a crowd. You will need to close in again.'],
      ],
      crit: [
        ['{t} clocks you across the street. Their guard is up.'],
        ['The {w} you were sold is a dud and the seller talks. {t} hears rumours.'],
        ['A bodyguard gets a good look at your face. {t} is on edge now.'],
        ['{t} survives and goes into hiding. The client cancels the contract.'],
      ],
      fled: '{t} has fled Torn City. The contract is void.',
    };

    const DEFAULTS = () => ({
      xp: 0, ok: 0, fail: 0, crit: 0, cash: 0, rep: 0, seq: 1,
      accepted: 0, completed: 0, voided: 0, clean: 0,
      kills: { pistol: 0, rifle: 0, poison: 0, blade: 0, accident: 0 },
      list: [],
    });

    const db = store('tcx_assassination_v1', DEFAULTS, (s) => {
      s.kills = Object.assign(DEFAULTS().kills, s.kills);
    });

    const BANNER = (() => {
      let seed = 11;
      const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
      const blds = [[0, 40, 60], [62, 25, 50], [115, 55, 70], [190, 30, 45], [238, 60, 80], [322, 20, 55],
        [380, 45, 65], [450, 35, 40], [495, 65, 75], [575, 30, 60], [640, 50, 70], [715, 40, 69]];
      let win = '';
      blds.forEach(([x, top, w]) => {
        for (let y = top + 6; y < 104; y += 9) {
          for (let xx = x + 5; xx < x + w - 5; xx += 9) if (rnd() < 0.22) win += `<rect x="${xx}" y="${y}" width="4" height="5"/>`;
        }
      });
      const bodies = blds.map(([x, top, w]) => `<rect x="${x}" y="${top}" width="${w}" height="${125 - top}"/>`).join('');
      return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 784 125" preserveAspectRatio="xMidYMid slice">
          <defs><linearGradient id="tca-sky" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#140b16"/><stop offset="1" stop-color="#43161f"/></linearGradient></defs>
          <rect width="784" height="125" fill="url(#tca-sky)"/>
          <circle cx="120" cy="24" r="12" fill="#efe3d0" opacity=".85"/>
          <g fill="#0b0f16">${bodies}</g>
          <g fill="#f6d77a" opacity=".7">${win}</g>
          <g class="tcx-scope">
            <circle r="30" fill="rgba(255,255,255,.05)" stroke="#d8d8d8" stroke-width="2"/>
            <path d="M-30 0h22M8 0h22M0 -30v22M0 8v22" stroke="#d8d8d8" stroke-width="1.2"/>
            <circle r="1.8" fill="#ff3b3b" class="tcx-laser"/>
          </g>
          <rect y="108" width="784" height="17" fill="#05070b"/>
          <rect y="106" width="784" height="3" fill="#1a1f27"/>
          <g transform="translate(650 72)" fill="#05070b"><rect x="4" y="0" width="34" height="22" rx="3"/><path d="M8 22v14M34 22v14M8 30h26" stroke="#05070b" stroke-width="3"/></g>
        </svg>`;
    })();

    const TILE_BG = 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice">' +
      '<defs><linearGradient id="s" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#140b16"/><stop offset="1" stop-color="#43161f"/></linearGradient></defs>' +
      '<rect width="200" height="120" fill="url(#s)"/><circle cx="38" cy="26" r="9" fill="#efe3d0" opacity=".85"/>' +
      '<g fill="#0b0f16"><rect x="0" y="60" width="30" height="60"/><rect x="32" y="45" width="26" height="75"/><rect x="60" y="70" width="34" height="50"/>' +
      '<rect x="96" y="40" width="24" height="80"/><rect x="122" y="62" width="40" height="58"/><rect x="164" y="50" width="36" height="70"/></g>' +
      '<g fill="#f6d77a" opacity=".7"><rect x="38" y="52" width="4" height="5"/><rect x="48" y="70" width="4" height="5"/><rect x="102" y="50" width="4" height="5"/>' +
      '<rect x="110" y="76" width="4" height="5"/><rect x="130" y="70" width="4" height="5"/><rect x="172" y="60" width="4" height="5"/></g>' +
      '<g transform="translate(130 58)"><circle r="24" fill="rgba(255,255,255,.05)" stroke="#d8d8d8" stroke-width="2"/>' +
      '<path d="M-24 0h17M7 0h17M0 -24v17M0 7v17" stroke="#d8d8d8" stroke-width="1.2"/><circle r="1.8" fill="#ff3b3b"/></g></svg>');

    const portrait = (col) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">
        <rect width="34" height="34" rx="4" fill="${col}" opacity=".35"/>
        <circle cx="17" cy="14" r="6" fill="${col}"/>
        <path d="M6 34c0-7 5-11 11-11s11 4 11 11z" fill="${col}"/>
        <path d="M9 10h16l-2-4h-12z" fill="#111" opacity=".75"/>
      </svg>`;

    const selW = {};
    let pickTier = null;
    let confirmId = null;
    let outcomes = {};
    let done = [];

    const posOf = (c, now) => (((now - c.t0) % PERIOD) + PERIOD) % PERIOD / PERIOD;
    const segOf = (c, now) => Math.min(c.routine.length - 1, Math.floor(posOf(c, now) * c.routine.length));

    function fill(tpl, v) {
      return tpl.replace(/\{t\}/g, '<b class="inl">' + esc(v.t) + '</b>')
        .replace('{w}', v.w || '').replace('{ideal}', v.ideal || '')
        .replace('{cash}', '<b class="inl">' + money(v.cash || 0) + '</b>');
    }

    function newContract(s, tier) {
      const t = TIERS[tier];
      const order = shuffle(W_IDS);
      const places = shuffle(PLACES).slice(0, 5);
      const exp = places.map(() => Math.floor(Math.random() * 3));
      if (!exp.includes(2)) exp[Math.floor(Math.random() * exp.length)] = 2;
      return {
        id: s.seq++, tier, name: randomName(),
        pay: Math.round(t.pay[0] + Math.random() * (t.pay[1] - t.pay[0])),
        step: 0, ready: 0, alert: 0, seen: false, weapon: null,
        ideal: order[0], allowed: W_IDS.filter((w) => order.slice(0, 3).includes(w)),
        routine: places.map((p, i) => ({ n: p.n, k: p.k, e: exp[i] })),
        t0: Date.now() - Math.floor(Math.random() * PERIOD),
      };
    }

    const repStars = (rep) => {
      const n = Math.floor(rep);
      return `<span class="tcx-rep" title="Reputation ${rep.toFixed(1)} out of 5">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>`;
    };

    function contractRow(s, c) {
      const t = TIERS[c.tier];
      if (confirmId === c.id) {
        return `<div class="tcx-row tcx-confirm">Are you sure you want to abandon this contract?
          <button type="button" class="torn-btn" data-yes="${c.id}">Yes</button>
          <button type="button" class="torn-btn" data-no="1">No</button></div>`;
      }
      const now = Date.now();
      const step = STEPS[c.step];
      const waiting = c.ready > now;
      const timer = waiting ? `<span class="tcx-eta" data-eta="${c.ready}">${fmt(c.ready - now)}</span>` : '<span>Ready</span>';
      const steps = STEPS.map((st, i) =>
        `<span class="tcx-step${i < c.step ? ' done' : i === c.step ? ' cur' : ''}" title="${st.name}${i < c.step ? ', completed' : i === c.step ? ', current step' : ''}">${svgIcon(st.icon, 11)}</span>`).join('');

      const seg = segOf(c, now);
      const routine = c.seen
        ? `<div class="tcx-routine" data-t0="${c.t0}">${c.routine.map((r, i) =>
            `<span class="tcx-seg e${r.e}${i === seg ? ' now' : ''}" title="${r.n}: ${EXPOSURE[r.e]}">${r.k}</span>`).join('')}
            <i class="tcx-pin" style="left:${(posOf(c, now) * 100).toFixed(2)}%"></i></div>`
        : '<div class="tcx-routine unknown">Routine unknown</div>';

      const w = c.weapon || selW[c.id];
      const canPick = c.step === 1;
      const wTitle = w ? WEAPONS[w].name + (canPick ? '. Click to change' : '') : 'Click to select a weapon';
      const weapon = `<button type="button" class="tcx-round tcx-weapon${w ? ' sel' : ''}${w && w === c.ideal ? ' ideal' : ''}"
        data-weapon="${c.id}" ${canPick ? '' : 'disabled'} title="${wTitle}" aria-label="${wTitle}">
        ${w ? svgIcon(WEAPONS[w].icon, 16) : '?'}</button>`;

      const why = waiting ? 'Not ready yet' : (c.step === 1 && !w) ? "You haven't selected a weapon" : '';
      return `
        <div class="tcx-row">
          <div class="tcx-img">${portrait(t.col)}</div>
          <div class="tcx-sec grow">
            <div class="tcx-name"><b>${esc(c.name)}</b><small>${t.name} · ${money(c.pay)}</small></div>
            <button type="button" class="tcx-x" data-abandon="${c.id}" title="Abandon contract" aria-label="Abandon contract">✕</button>
          </div>
          <div class="tcx-sec tcx-progress">
            <div class="tcx-steptitle"><span>Step #${c.step + 1}: ${step.name}</span>${timer}</div>
            <div class="tcx-steps">${steps}</div>
            <div class="tcx-alert" title="Target alert: ${Math.round(c.alert)}%"><i style="width:${c.alert}%"></i></div>
          </div>
          <div class="tcx-sec routine">${routine}</div>
          <div class="tcx-sec">${weapon}</div>
          <div class="tcx-sec commit">${commitBtn(step.verb, step.nerve, `data-act="${c.id}"`, why)}</div>
        </div>${outcomeHtml(outcomes[c.id])}`;
    }

    function doneRow(c) {
      const t = TIERS[c.tier];
      return `
        <div class="tcx-row">
          <div class="tcx-img">${portrait(t.col)}</div>
          <div class="tcx-sec grow"><div class="tcx-name"><b>${esc(c.name)}</b><small>${t.name} · ${money(c.pay)}</small></div></div>
          <div class="tcx-sec status">${c.result}</div>
        </div>${outcomeHtml(outcomes[c.id])}`;
    }

    function body(s) {
      const lvl = levelOf(s.xp);
      const open = TIERS.map((t, i) => i).filter((i) => TIERS[i].lvl <= lvl);
      if (pickTier == null || !open.includes(pickTier)) pickTier = open[open.length - 1];
      const full = s.list.length >= MAX_OPEN;
      const opts = TIERS.map((t, i) =>
        `<option value="${i}" ${t.lvl > lvl ? 'disabled' : ''} ${i === pickTier ? 'selected' : ''}>Level ${t.lvl} · ${t.name}</option>`).join('');

      const head = `
        <div class="tcx-group">
          <div class="tcx-row">
            <div class="tcx-img">${svgIcon(I_FILE, 22)}</div>
            <div class="tcx-sec grow">Accept a Contract ${repStars(s.rep)}</div>
            <div class="tcx-sec"><select class="tcx-select" data-tier="1" aria-label="Contract tier">${opts}</select></div>
            <div class="tcx-sec commit">${commitBtn('Accept', null, 'data-accept="1"', full ? 'You have too many open contracts' : '')}</div>
          </div>
        </div>`;

      const rows = done.map(doneRow).join('') + s.list.map((c) => contractRow(s, c)).join('');
      return head + (rows ? `<div class="tcx-group sep">${rows}</div>` : '');
    }

    function accept() {
      const s = db.load();
      if (s.list.length >= MAX_OPEN || TIERS[pickTier].lvl > levelOf(s.xp)) return;
      outcomes = {};
      done = [];
      const c = newContract(s, pickTier);
      s.list.push(c);
      s.accepted += 1;
      outcomes[c.id] = { type: 'info', title: 'Contract accepted', text: fill(pick(TEXT.accept), { t: c.name, cash: c.pay }) };
      db.save(s);
    }

    function cycle(id) {
      const s = db.load();
      const c = s.list.find((x) => x.id === id);
      if (!c || c.step !== 1) return;
      const i = c.allowed.indexOf(selW[id]);
      selW[id] = c.allowed[(i + 1) % c.allowed.length];
    }

    function finish(s, c, result) {
      s.list = s.list.filter((x) => x.id !== c.id);
      done.push(Object.assign({}, c, { result }));
      delete selW[c.id];
    }

    function act(id) {
      const s = db.load();
      const c = s.list.find((x) => x.id === id);
      const now = Date.now();
      if (!c || c.ready > now) return;
      const w = c.weapon || selW[id];
      if (c.step === 1 && !w) return;

      outcomes = {};
      done = [];
      const t = TIERS[c.tier];
      const bonus = levelOf(s.xp) * 0.002;
      const e = c.routine[segOf(c, now)].e;
      const v = { t: c.name, w: w ? WEAPONS[w].name.toLowerCase() : '', ideal: WEAPONS[c.ideal].name.toLowerCase(), cash: 0 };

      const chance = clamp([
        0.9 + bonus - c.alert * 0.003,
        0.95,
        0.82 + bonus - c.alert * 0.004,
        t.base + EXP_MOD[e] + (w === c.ideal ? 0.12 : 0) + bonus + s.rep * 0.01 - c.alert * 0.004,
      ][c.step], 0.05, 0.97);

      const roll = Math.random();
      const stepNo = c.step;

      if (roll < chance) {
        s.ok += 1;
        if (stepNo === 3) {
          const pay = c.pay * (1 + s.rep * 0.1);
          const clean = e === 2 && w === c.ideal;
          v.cash = pay;
          s.cash += pay;
          s.completed += 1;
          s.kills[w] += 1;
          s.xp += t.xp;
          if (clean) s.clean += 1;
          s.rep = clamp(s.rep + (clean ? 0.3 : 0.1), 0, 5);
          outcomes[id] = { type: 'ok', title: clean ? 'Clean hit' : 'Success', text: fill(pick(TEXT.ok[3]), v) };
          finish(s, c, clean ? 'Clean hit' : 'Complete');
        } else {
          if (stepNo === 0) c.seen = true;
          if (stepNo === 1) c.weapon = w;
          c.step += 1;
          c.ready = now + STEPS[stepNo].wait * 1000;
          s.xp += 2 + stepNo;
          outcomes[id] = { type: 'ok', title: 'Success', text: fill(pick(TEXT.ok[stepNo]), v) };
        }
      } else if (roll < chance + (1 - chance) * 0.7) {
        s.fail += 1;
        s.xp += 1;
        c.alert = clamp(c.alert + [8, 5, 12, 20][stepNo], 0, 100);
        if (stepNo === 3) { c.step = 2; c.ready = now + 20000; }
        outcomes[id] = { type: 'fail', title: 'Failure', text: fill(pick(TEXT.fail[stepNo]), v) };
      } else {
        s.crit += 1;
        if (stepNo === 3) {
          s.voided += 1;
          s.rep = clamp(s.rep - 0.5, 0, 5);
          outcomes[id] = { type: 'crit', title: 'Critical failure', text: fill(pick(TEXT.crit[3]), v) };
          finish(s, c, 'Void');
        } else {
          c.alert = clamp(c.alert + [30, 25, 35][stepNo], 0, 100);
          outcomes[id] = { type: 'crit', title: 'Critical failure', text: fill(pick(TEXT.crit[stepNo]), v) };
        }
      }

      if (c.alert >= 100 && s.list.includes(c)) {
        s.voided += 1;
        s.rep = clamp(s.rep - 0.25, 0, 5);
        outcomes[id] = { type: 'crit', title: 'Critical failure', text: fill(TEXT.fled, v) };
        finish(s, c, 'Void');
      }
      db.save(s);
    }

    function click(e) {
      let b;
      if ((b = e.target.closest('[data-accept]'))) {
        if (!b.classList.contains('disabled')) accept();
        return true;
      }
      if ((b = e.target.closest('[data-weapon]'))) { cycle(Number(b.dataset.weapon)); return true; }
      if ((b = e.target.closest('[data-act]'))) {
        if (!b.classList.contains('disabled')) act(Number(b.dataset.act));
        return true;
      }
      if ((b = e.target.closest('[data-abandon]'))) { confirmId = Number(b.dataset.abandon); return true; }
      if ((b = e.target.closest('[data-yes]'))) {
        const s = db.load();
        s.list = s.list.filter((x) => x.id !== Number(b.dataset.yes));
        db.save(s);
        confirmId = null;
        return true;
      }
      if (e.target.closest('[data-no]')) { confirmId = null; return true; }
      return false;
    }

    function change(e) {
      if (e.target.matches('[data-tier]')) pickTier = Number(e.target.value);
    }

    function tick(root, now) {
      const s = db.load();
      root.querySelectorAll('.tcx-routine[data-t0]').forEach((el) => {
        const c = { t0: Number(el.dataset.t0), routine: el.querySelectorAll('.tcx-seg') };
        const pin = el.querySelector('.tcx-pin');
        if (pin) pin.style.left = (posOf(c, now) * 100).toFixed(2) + '%';
        const i = segOf(c, now);
        c.routine.forEach((sg, j) => sg.classList.toggle('now', j === i));
      });
      return s;
    }

    return {
      slug: 'assassination', name: 'Assassination', type: 'Violent', db, banner: BANNER, tileBg: TILE_BG, body, click, change, tick,
      stats: (s) => [
        ['Money earned', money(s.cash)], ['Contracts accepted', s.accepted], ['Contracts completed', s.completed],
        ['Contracts voided', s.voided], ['Clean hits', s.clean], ['Reputation', s.rep.toFixed(1) + ' / 5'],
        ['Silenced Pistol', s.kills.pistol], ['Sniper Rifle', s.kills.rifle], ['Poison', s.kills.poison],
        ['Blade', s.kills.blade], ['Staged Accident', s.kills.accident], ['Open contracts', s.list.length + ' / ' + MAX_OPEN],
      ],
      tileStatus: (s) => (s.list.length ? { n: s.list.length, label: 'Open contracts' } : null),
    };
  })();

  const CRIMES = [SMUGGLING, ASSASSINATION];

  /* ================= styles ================= */

  function addStyles() {
    if (document.getElementById('tcx-style')) return;
    const st = document.createElement('style');
    st.id = 'tcx-style';
    st.textContent = `
      body.tcx-on .crimes-app > *:not(#tcx-header):not(hr):not(#tcx-root) { display: none !important; }
      ${CRIMES.map((c) => `#tcx-tile-${c.slug} [class*="crimeImage"] { background-image: url("${c.tileBg}") !important; background-size: cover !important; background-position: center !important; }`).join('\n')}

      #tcx-root { --t-row: var(--crimes-crimeOption-bgColor, #f2f2f2); --t-text: var(--default-color, #333); --t-line: rgba(0,0,0,.13); --t-sub: rgba(0,0,0,.05);
                  --t-ok: var(--crimes-stats-successes-color, #6a9a0c); --t-fail: var(--crimes-stats-fails-color, #d98a00); --t-crit: var(--crimes-stats-criticalFails-color, #d83500);
                  color: var(--t-text); font-size: 13px; line-height: 1.3; }
      body.dark-mode #tcx-root { --t-row: var(--crimes-crimeOption-bgColor, #333); --t-text: var(--default-color, #ddd); --t-line: rgba(0,0,0,.45); --t-sub: rgba(255,255,255,.05);
                  --t-ok: var(--crimes-stats-successes-color, #a9e34b); --t-fail: var(--crimes-stats-fails-color, #ffa94d); --t-crit: var(--crimes-stats-criticalFails-color, #ff8787); }

      #tcx-root .tcx-title { display: flex; align-items: center; height: 34px; padding: 0 10px; border-radius: 5px 5px 0 0; background: linear-gradient(180deg, #5a5a5a, #333); color: #fff; text-shadow: 0 1px 0 rgba(0,0,0,.6); }
      #tcx-root .tcx-title b { flex: 1; font-size: 15px; }
      #tcx-root .tcx-count { display: flex; align-items: center; gap: 4px; margin-left: 12px; }
      #tcx-root .tcx-count.ok { color: #a9e34b; } #tcx-root .tcx-count.fail { color: #ffa94d; } #tcx-root .tcx-count.crit { color: #ff8787; }

      #tcx-root .tcx-banner { position: relative; height: 125px; overflow: hidden; background: #08111d; cursor: pointer; }
      #tcx-root .tcx-banner > svg { display: block; width: 100%; height: 100%; }
      #tcx-root .tcx-ship { animation: tcx-ship 70s linear infinite; }
      #tcx-root .tcx-beam { transform-origin: 560px 100px; animation: tcx-beam 7s ease-in-out infinite alternate; }
      #tcx-root .tcx-shimmer { animation: tcx-shimmer 3s ease-in-out infinite alternate; }
      #tcx-root .tcx-scope { animation: tcx-scope 18s ease-in-out infinite; }
      #tcx-root .tcx-laser { animation: tcx-shimmer 0.8s ease-in-out infinite alternate; }
      @keyframes tcx-ship { from { transform: translateX(-140px); } to { transform: translateX(800px); } }
      @keyframes tcx-beam { from { transform: rotate(-28deg); } to { transform: rotate(28deg); } }
      @keyframes tcx-shimmer { from { opacity: .15; } to { opacity: .6; } }
      @keyframes tcx-scope { 0%, 100% { transform: translate(260px, 62px); } 22% { transform: translate(430px, 48px); } 45% { transform: translate(560px, 80px); }
                             70% { transform: translate(350px, 88px); } 85% { transform: translate(200px, 50px); } }
      #tcx-root .tcx-arrow { position: absolute; top: 50%; margin-top: -22px; color: rgba(255,255,255,.55); z-index: 2; }
      #tcx-root .tcx-arrow:hover { color: #fff; }
      #tcx-root .tcx-arrow.prev { left: 8px; transform: scaleX(-1); }
      #tcx-root .tcx-arrow.next { right: 8px; }

      #tcx-root .tcx-stats { display: none; position: absolute; inset: 0; z-index: 3; padding: 10px 40px; background: rgba(8,14,20,.92); color: #ddd; cursor: pointer;
                             grid-template-columns: repeat(3, 1fr); gap: 2px 20px; align-content: center; font-size: 12px; }
      #tcx-root .tcx-stats.open { display: grid; }
      #tcx-root .tcx-stats span { display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,.08); }
      #tcx-root .tcx-stats i { font-style: normal; opacity: .65; }

      #tcx-root .tcx-level { position: relative; display: flex; align-items: center; height: 16px; padding: 0 40px 0 10px; background: linear-gradient(180deg, #2b2b2b, #1c1c1c); }
      #tcx-root .tcx-track { flex: 1; height: 4px; border-radius: 2px; background: #474747; overflow: hidden; }
      #tcx-root .tcx-fill { height: 100%; background: linear-gradient(90deg, #5c940d, #a9e34b); transition: width .4s; }
      #tcx-root .tcx-star { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); }
      #tcx-root .tcx-star.fallback { width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
                            background: radial-gradient(circle at 35% 30%, #ffe680, #c98a2b); color: #3a2500; font-weight: 700; font-size: 11px; box-shadow: 0 1px 3px rgba(0,0,0,.6); }

      #tcx-root .tcx-group { margin-bottom: 10px; border-radius: 0 0 5px 5px; overflow: hidden; }
      #tcx-root .tcx-group.sep { border-radius: 5px; }
      #tcx-root .tcx-row { display: flex; align-items: stretch; min-height: 50px; background: var(--t-row); border-bottom: 1px solid var(--t-line); }
      #tcx-root .tcx-img { flex: none; width: 50px; display: flex; align-items: center; justify-content: center; background: var(--t-sub); }
      #tcx-root .tcx-sec { display: flex; align-items: center; gap: 6px; padding: 0 10px; border-left: 1px solid var(--t-line); white-space: nowrap; }
      #tcx-root .tcx-sec.grow { flex: 1; border-left: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
      #tcx-root .tcx-sec.time { width: 110px; justify-content: center; }
      #tcx-root .tcx-sec.status { width: 110px; justify-content: center; opacity: .85; }
      #tcx-root .tcx-sec.commit { width: 112px; padding: 0 8px; }

      #tcx-root .tcx-round { width: 30px; height: 30px; padding: 0; border-radius: 50%; border: 2px solid transparent; background: var(--t-sub); color: inherit; cursor: pointer;
                             display: flex; align-items: center; justify-content: center; font-weight: 700; }
      #tcx-root .tcx-round:hover:not(:disabled) { background: rgba(128,128,128,.25); }
      #tcx-root .tcx-round:disabled { cursor: default; opacity: .8; }
      #tcx-root .tcx-round.warm { box-shadow: inset 0 0 0 2px var(--t-fail); }
      #tcx-root .tcx-round.hot { box-shadow: inset 0 0 0 2px var(--t-crit); }
      #tcx-root .tcx-round.sel { border-color: var(--t-ok); background: rgba(130,201,30,.2); }
      #tcx-root .tcx-round.ideal { box-shadow: 0 0 0 2px #e8b730; }
      #tcx-root .tcx-round.none { background: none; border: 1px dashed var(--t-line); cursor: default; }

      #tcx-root .tcx-req { width: 34px; height: 34px; border-radius: 4px; border: 1px dashed var(--t-line); display: flex; align-items: center; justify-content: center; font-size: 11px; opacity: .8; }
      #tcx-root .tcx-btn { width: 100%; display: flex; align-items: center; justify-content: center; gap: 7px; padding-left: 0; padding-right: 0; }
      #tcx-root .tcx-btn.disabled { opacity: .5; cursor: default; }
      #tcx-root .tcx-btn u { width: 1px; height: 14px; background: currentColor; opacity: .3; }

      #tcx-root .tcx-dots { display: inline-flex; gap: 3px; }
      #tcx-root .tcx-dots i { width: 4px; height: 4px; border-radius: 50%; background: currentColor; animation: tcx-dot 1.2s infinite; }
      #tcx-root .tcx-dots i:nth-child(2) { animation-delay: .2s; } #tcx-root .tcx-dots i:nth-child(3) { animation-delay: .4s; }
      @keyframes tcx-dot { 0%, 100% { opacity: .2; } 50% { opacity: 1; } }

      #tcx-root .tcx-outcome { padding: 12px 16px; text-align: center; background: var(--t-row); border-bottom: 1px solid var(--t-line); box-shadow: inset 0 4px 6px -4px rgba(0,0,0,.5); white-space: normal; }
      #tcx-root .tcx-outcome > b { display: block; margin-bottom: 4px; font-size: 14px; }
      #tcx-root .tcx-outcome b.inl { display: inline; font-size: inherit; margin: 0; }
      #tcx-root .tcx-outcome.ok > b { color: var(--t-ok); } #tcx-root .tcx-outcome.fail > b { color: var(--t-fail); } #tcx-root .tcx-outcome.crit > b { color: var(--t-crit); }

      #tcx-root .tcx-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
      #tcx-root .tcx-name b { display: block; overflow: hidden; text-overflow: ellipsis; }
      #tcx-root .tcx-name small { opacity: .7; font-size: 11px; }
      #tcx-root .tcx-x { margin-left: auto; padding: 2px 4px; border: 0; background: none; color: inherit; opacity: .35; cursor: pointer; font-size: 12px; }
      #tcx-root .tcx-x:hover { opacity: 1; }
      #tcx-root .tcx-progress { width: 140px; flex-direction: column; align-items: stretch; justify-content: center; gap: 3px; }
      #tcx-root .tcx-steptitle { display: flex; justify-content: space-between; gap: 6px; font-size: 11px; }
      #tcx-root .tcx-steps { display: flex; gap: 2px; }
      #tcx-root .tcx-step { flex: 1; height: 14px; display: flex; align-items: center; justify-content: center; background: var(--t-sub); border-radius: 2px; opacity: .45; }
      #tcx-root .tcx-step.done { background: rgba(130,201,30,.35); opacity: 1; }
      #tcx-root .tcx-step.cur { box-shadow: inset 0 0 0 1px var(--t-ok); opacity: 1; }
      #tcx-root .tcx-alert { height: 3px; background: var(--t-sub); border-radius: 2px; overflow: hidden; }
      #tcx-root .tcx-alert i { display: block; height: 100%; background: var(--t-crit); }
      #tcx-root .tcx-routine { position: relative; display: flex; width: 170px; height: 18px; border-radius: 9px; overflow: hidden; border: 1px solid var(--t-line); font-size: 9px; }
      #tcx-root .tcx-routine.unknown { justify-content: center; align-items: center; opacity: .6; font-size: 11px; }
      #tcx-root .tcx-seg { flex: 1; display: flex; align-items: center; justify-content: center; border-left: 1px solid var(--t-line); opacity: .75; }
      #tcx-root .tcx-seg:first-child { border-left: 0; }
      #tcx-root .tcx-seg.e0 { background: rgba(250,82,82,.28); } #tcx-root .tcx-seg.e1 { background: rgba(255,169,77,.28); } #tcx-root .tcx-seg.e2 { background: rgba(169,227,75,.32); }
      #tcx-root .tcx-seg.now { font-weight: 700; opacity: 1; }
      #tcx-root .tcx-pin { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--t-text); box-shadow: 0 0 3px rgba(0,0,0,.6); }
      #tcx-root .tcx-select { height: 28px; max-width: 200px; background: var(--t-sub); color: inherit; border: 1px solid var(--t-line); border-radius: 4px; padding: 0 6px; }
      #tcx-root .tcx-select option { color: #222; background: #fff; }
      #tcx-root .tcx-rep { margin-left: 8px; color: #e8b730; letter-spacing: 1px; font-size: 12px; }
      #tcx-root .tcx-rep i { font-style: normal; opacity: .25; }
      #tcx-root .tcx-confirm { justify-content: center; align-items: center; gap: 10px; }

      @media (max-width: 784px) {
        #tcx-root .tcx-sec.reqs, #tcx-root .tcx-sec.status, #tcx-root .tcx-sec.routine { display: none; }
        #tcx-root .tcx-sec { padding: 0 6px; gap: 3px; }
        #tcx-root .tcx-round { width: 26px; height: 26px; }
        #tcx-root .tcx-sec.commit { width: 96px; }
        #tcx-root .tcx-sec.time { width: 80px; }
        #tcx-root .tcx-progress { width: 110px; }
        #tcx-root .tcx-stats { grid-template-columns: repeat(2, 1fr); padding: 6px 12px; font-size: 11px; }
      }
    `;
    document.head.appendChild(st);
  }

  /* ================= hub tiles ================= */

  function tileStatus(tile, st) {
    const groups = tile.querySelector('[class*="statusGroups"]');
    const key = st ? st.label + st.n : '';
    if (!groups || groups.dataset.k === key) return;
    groups.dataset.k = key;
    groups.innerHTML = '';
    if (!st) return;

    const tpl = Array.from(document.querySelectorAll('a.crimes-hub-crime:not([id^="tcx-"]) [class*="statusCirclePosition"]'))
      .find((e) => e.querySelector('[class*="text___"]') && e.closest('[class*="statusGroup___"]'));
    if (!tpl) return;

    const group = tpl.closest('[class*="statusGroup___"]').cloneNode(false);
    group.style.setProperty('--number-of-statuses', '1');
    const pad = tpl.parentNode.cloneNode(false);
    const circle = tpl.cloneNode(true);
    circle.setAttribute('aria-label', st.label + ': ' + st.n);
    circle.title = st.label + ': ' + st.n;
    circle.querySelectorAll('[class*="iconPosition"], [class*="IconWrapper"], svg').forEach((e) => e.remove());
    circle.querySelector('[class*="text___"]').textContent = st.n;
    pad.appendChild(circle);
    group.appendChild(pad);
    groups.appendChild(group);
  }

  function makeTile(crime) {
    const real = document.querySelectorAll('a.crimes-hub-crime:not([id^="tcx-"])');
    if (!real.length) return null;
    const tile = real[real.length - 1].cloneNode(true);
    tile.id = 'tcx-tile-' + crime.slug;
    tile.classList.remove('max-level');
    tile.removeAttribute('target');
    tile.removeAttribute('i-data');
    tile.href = crimeUrl(crime);
    const title = tile.querySelector('[class*="crimeTitle"]');
    if (title) title.textContent = crime.name;
    const groups = tile.querySelector('[class*="statusGroups"]');
    if (groups) groups.innerHTML = '';
    return tile;
  }

  function injectTiles() {
    const slots = Array.from(document.querySelectorAll('[class*="crimeTypeLocked"]'));
    CRIMES.forEach((crime, i) => {
      const slot = slots[i];
      if (!slot) return;
      let tile = document.getElementById('tcx-tile-' + crime.slug);
      if (!tile) {
        tile = makeTile(crime);
        if (!tile) return;
      }
      if (tile.nextElementSibling !== slot) slot.parentNode.insertBefore(tile, slot);
      if (slot.style.display !== 'none') slot.style.display = 'none';

      const s = crime.db.load();
      const fill = tile.querySelector('[class*="barFill"]');
      const w = progressOf(s.xp) + '%';
      if (fill && fill.style.width !== w) fill.style.width = w;

      const star = tile.querySelector('[class*="levelStarWrapper"] [class*="levelStar___"]');
      if (star) applyStar(star, levelOf(s.xp));

      tileStatus(tile, crime.tileStatus(s));
    });
  }

  /* ================= crime page ================= */

  let statsOpen = false;
  let expiredShown = 0;
  let starTpl = null;

  function levelStar(lvl) {
    if (!starTpl) {
      const src = document.querySelector('a.crimes-hub-crime:not([id^="tcx-"]) [class*="levelStarWrapper"] [class*="levelStar___"]');
      if (src) {
        const c = src.cloneNode(true);
        Array.from(c.classList).filter((x) => /^small___/.test(x)).forEach((x) => c.classList.remove(x));
        c.querySelectorAll('[class*="shadow___"]').forEach((el) => Array.from(el.classList).filter((x) => /^shadow___/.test(x)).forEach((x) => el.classList.remove(x)));
        starTpl = c;
      }
    }
    if (starTpl) {
      const star = starTpl.cloneNode(true);
      delete star.dataset.tcx;
      if (applyStar(star, lvl)) return star;
    }
    return null;
  }

  function render(root, crime) {
    const s = crime.db.load();
    crime.db.save(s);
    const lvl = levelOf(s.xp);
    const idx = CRIMES.indexOf(crime);
    const prev = idx === 0 ? URL_ARSON : crimeUrl(CRIMES[idx - 1]);
    const next = CRIMES[idx + 1] ? crimeUrl(CRIMES[idx + 1]) : null;
    const total = s.ok + s.fail + s.crit;

    const stats = [
      ['Skill', skillOf(s.xp).toFixed(2)], ['Crime type', crime.type], ['Total attempts', total.toLocaleString('en-US')],
      ['Successes', s.ok], ['Fails', s.fail], ['Critical fails', s.crit],
    ].concat(crime.stats(s)).map(([k, v]) => `<span><i>${k}:</i>${v}</span>`).join('');

    root.innerHTML = `
      <div class="tcx-title">
        <b>${crime.name}</b>
        <span class="tcx-count ok" title="${s.ok} Successes">${ICON_OK}${s.ok}</span>
        <span class="tcx-count fail" title="${s.fail} Fails">${ICON_FAIL}${s.fail}</span>
        <span class="tcx-count crit" title="${s.crit} Critical fails">${ICON_CRIT}${s.crit}</span>
      </div>
      <div class="tcx-banner" data-stats="1" role="button" aria-label="Crime banner">
        ${crime.banner}
        <a class="tcx-arrow prev" href="${prev}" aria-label="Previous crime">${ICON_ARROW}</a>
        ${next ? `<a class="tcx-arrow next" href="${next}" aria-label="Next crime">${ICON_ARROW}</a>` : ''}
        <div class="tcx-stats${statsOpen ? ' open' : ''}">${stats}</div>
      </div>
      <div class="tcx-level" title="Crime skill: ${lvl} (${progressOf(s.xp)}%)">
        <div class="tcx-track"><div class="tcx-fill" style="width:${progressOf(s.xp)}%"></div></div>
        <div class="tcx-star fallback">${lvl}</div>
      </div>
      ${crime.body(s)}`;

    const star = levelStar(lvl);
    if (star) {
      const holder = root.querySelector('.tcx-star');
      holder.className = 'tcx-star';
      holder.textContent = '';
      holder.appendChild(star);
    }

    const now = Date.now();
    expiredShown = Array.from(root.querySelectorAll('.tcx-eta')).filter((el) => Number(el.dataset.eta) <= now).length;
  }

  function mountHeader(app, crime) {
    if (document.getElementById('tcx-header')) return;
    const real = app.querySelector('.crimes-app-header');
    if (!real) return;
    const head = real.cloneNode(true);
    head.id = 'tcx-header';
    const h = head.querySelector('h4');
    if (h) h.textContent = crime.name;
    const morale = head.querySelector('#crime-morale-value');
    if (morale) morale.removeAttribute('id');
    const links = head.querySelectorAll('a');
    const back = links[0];
    links.forEach((a, i) => { if (i) a.remove(); });
    if (back) {
      back.href = URL_HUB;
      const svg = back.querySelector('svg');
      back.textContent = '';
      if (svg) back.appendChild(svg);
      back.appendChild(document.createTextNode('Back to Hub'));
      head.appendChild(back);
    }
    app.insertBefore(head, app.firstChild);
  }

  function mountCrime(crime) {
    const app = document.querySelector('.crimes-app');
    if (!app) return;
    mountHeader(app, crime);
    if (document.getElementById('tcx-root')) return;

    document.body.classList.add('tcx-on');
    const root = document.createElement('div');
    root.id = 'tcx-root';

    root.addEventListener('click', (e) => {
      if (e.target.closest('a')) return; // normal link navigation
      if (crime.click(e)) { render(root, crime); return; }
      if (e.target.closest('[data-stats]')) { statsOpen = !statsOpen; render(root, crime); }
    });
    root.addEventListener('change', (e) => { if (crime.change) crime.change(e); });

    app.appendChild(root);
    render(root, crime);

    // Display only: countdown text and routine pin. Re-renders once when a timer runs out.
    setInterval(() => {
      const now = Date.now();
      let expired = 0;
      root.querySelectorAll('.tcx-eta').forEach((el) => {
        const left = Number(el.dataset.eta) - now;
        if (left <= 0) expired += 1;
        else el.textContent = fmt(left);
      });
      if (crime.tick) crime.tick(root, now);
      if (expired !== expiredShown) render(root, crime);
    }, 1000);
  }

  /* ================= boot ================= */

  const slug = new URLSearchParams(location.search).get('crime');
  const current = CRIMES.find((c) => c.slug === slug);

  function sync() {
    if (current) mountCrime(current);
    else injectTiles();
  }

  addStyles();
  sync();

  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; sync(); });
  }).observe(document.body, { childList: true, subtree: true });

  window.addEventListener('storage', () => { if (!current) sync(); });
})();
