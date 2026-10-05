(() => {
  'use strict';

  const KEY = 'abhaken.v1';
  const TAB_KEY = 'abhaken.tab';

  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const ICON_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const ICON_MORE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';

  // ---------- Speicher ----------

  function emptyState() { return { v: 1, daily: [], long: [] }; }

  function normalize(raw) {
    if (!raw || !Array.isArray(raw.daily) || !Array.isArray(raw.long)) return null;
    const str = (v) => (typeof v === 'string' && v ? v : null);
    const clean = (t) => t && typeof t.title === 'string' && t.title.trim();
    return {
      v: 1,
      daily: raw.daily.filter(clean).map((t) => ({
        id: str(t.id) || uid(), title: t.title.trim(), doneOn: str(t.doneOn), created: t.created || Date.now(),
      })),
      long: raw.long.filter(clean).map((t) => ({
        id: str(t.id) || uid(), title: t.title.trim(), due: str(t.due),
        doneAt: typeof t.doneAt === 'number' ? t.doneAt : null, created: t.created || Date.now(),
      })),
    };
  }

  function load() {
    try { return normalize(JSON.parse(localStorage.getItem(KEY))) || emptyState(); }
    catch { return emptyState(); }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch { showToast('Speichern fehlgeschlagen. Der Speicher ist voll oder gesperrt.'); }
  }

  let state = load();
  let today = iso();
  let tab = 'daily';
  try { if (localStorage.getItem(TAB_KEY) === 'long') tab = 'long'; } catch { /* egal */ }

  // ---------- Datum ----------

  const fmtWeekday = new Intl.DateTimeFormat('de-DE', { weekday: 'long' });
  const fmtDate = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' });
  const fmtShort = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' });
  const fmtShortYear = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });

  function shortDay(s) {
    const d = parseDay(s);
    return d.getFullYear() === new Date().getFullYear() ? fmtShort.format(d) : fmtShortYear.format(d);
  }

  function dueInfo(due) {
    if (!due) return null;
    const days = Math.round((parseDay(due) - parseDay(today)) / 86400000);
    if (days < 0) return { text: `Überfällig seit ${shortDay(due)}`, overdue: true };
    if (days === 0) return { text: 'Heute fällig', overdue: false };
    if (days === 1) return { text: 'Morgen fällig', overdue: false };
    return { text: `Bis ${shortDay(due)}`, overdue: false };
  }

  // ---------- Rendern ----------

  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    n.append(...kids.filter((c) => c !== null && c !== undefined));
    return n;
  }

  const isDone = (kind, t) => (kind === 'daily' ? t.doneOn === today : t.doneAt !== null);

  function sortedLong() {
    const open = state.long.filter((t) => t.doneAt === null).sort((a, b) => {
      if (a.due && b.due) return a.due.localeCompare(b.due) || a.created - b.created;
      if (a.due) return -1;
      if (b.due) return 1;
      return a.created - b.created;
    });
    const done = state.long.filter((t) => t.doneAt !== null).sort((a, b) => b.doneAt - a.doneAt);
    return { open, done };
  }

  function row(kind, t) {
    const done = isDone(kind, t);
    const info = kind === 'long' ? dueInfo(t.due) : null;
    return el('li', { class: 'row' },
      el('button', {
        class: 'check', type: 'button', role: 'checkbox', 'aria-checked': String(done),
        onclick: (e) => toggle(kind, t.id, e.currentTarget),
      },
        el('span', { class: 'box', html: ICON_CHECK }),
        el('span', { class: 'text' },
          el('span', { class: 'title' }, el('span', {}, t.title)),
          info ? el('span', { class: 'meta' + (info.overdue ? ' overdue' : '') }, info.text) : null),
      ),
      el('button', {
        class: 'more', type: 'button', 'aria-label': `„${t.title}“ bearbeiten`, html: ICON_MORE,
        onclick: () => openEdit(kind, t.id),
      }),
    );
  }

  function renderList() {
    const list = $('list');
    const empty = $('empty');
    list.replaceChildren();

    if (tab === 'daily') {
      state.daily.forEach((t) => list.append(row('daily', t)));
      empty.textContent = 'Noch keine täglichen Aufgaben. Trag unten ein, was du jeden Tag abhaken willst.';
      empty.hidden = state.daily.length > 0;
    } else {
      const { open, done } = sortedLong();
      open.forEach((t) => list.append(row('long', t)));
      if (done.length) {
        list.append(el('li', { class: 'section' },
          el('span', {}, `Erledigt (${done.length})`),
          el('button', { type: 'button', onclick: clearDone }, 'Erledigte löschen')));
        done.forEach((t) => list.append(row('long', t)));
      }
      empty.textContent = 'Nichts Langfristiges eingetragen. Unten kannst du etwas hinzufügen, mit oder ohne Datum.';
      empty.hidden = state.long.length > 0;
    }
  }

  function renderHead() {
    const now = new Date();
    $('weekday').textContent = fmtWeekday.format(now);
    $('date').textContent = fmtDate.format(now);

    const segs = $('segments');
    const label = $('progressLabel');
    const dailyDone = state.daily.filter((t) => t.doneOn === today).length;
    const longOpen = state.long.filter((t) => t.doneAt === null);

    if (tab === 'daily') {
      // Ein Segment pro täglicher Aufgabe, in Listenreihenfolge
      if (segs.children.length !== state.daily.length) {
        segs.replaceChildren(...state.daily.map(() => el('span', { class: 'seg' })));
      }
      state.daily.forEach((t, i) => segs.children[i].classList.toggle('on', t.doneOn === today));
      if (!state.daily.length) label.textContent = '';
      else if (dailyDone === state.daily.length) label.textContent = 'Alles erledigt für heute';
      else label.textContent = `${dailyDone} von ${state.daily.length} erledigt`;
    } else {
      segs.replaceChildren();
      const overdue = longOpen.filter((t) => t.due && t.due < today).length;
      if (!state.long.length) label.textContent = '';
      else if (!longOpen.length) label.textContent = 'Nichts mehr offen';
      else label.textContent = `${longOpen.length} offen` + (overdue ? `, davon ${overdue} überfällig` : '');
    }

    const dailyOpen = state.daily.length - dailyDone;
    $('count-daily').textContent = dailyOpen ? String(dailyOpen) : '';
    $('count-long').textContent = longOpen.length ? String(longOpen.length) : '';
  }

  function renderTabs() {
    for (const t of ['daily', 'long']) $(`tab-${t}`).setAttribute('aria-selected', String(tab === t));
    $('dateChip').hidden = tab !== 'long';
    $('newTitle').placeholder = tab === 'daily' ? 'Neue tägliche Aufgabe' : 'Neue langfristige Aufgabe';
  }

  function render() {
    today = iso();
    renderTabs();
    renderHead();
    renderList();
  }

  // ---------- Aktionen ----------

  let moveTimer = 0;

  function toggle(kind, id, btn) {
    const t = state[kind].find((x) => x.id === id);
    if (!t) return;
    if (kind === 'daily') t.doneOn = t.doneOn === today ? null : today;
    else t.doneAt = t.doneAt === null ? Date.now() : null;
    save();
    btn.setAttribute('aria-checked', String(isDone(kind, t)));
    renderHead();
    if (kind === 'long') {
      // kurz stehen lassen, damit man den Haken sieht, dann einsortieren
      clearTimeout(moveTimer);
      moveTimer = setTimeout(renderList, 450);
    }
  }

  function addTask(title) {
    if (tab === 'daily') {
      state.daily.push({ id: uid(), title, doneOn: null, created: Date.now() });
    } else {
      state.long.push({ id: uid(), title, due: $('newDue').value || null, doneAt: null, created: Date.now() });
      $('newDue').value = '';
      updateChip();
    }
    save();
    render();
    if (tab === 'daily') $('listWrap').scrollTop = $('listWrap').scrollHeight;
  }

  function clearDone() {
    const removed = state.long.filter((t) => t.doneAt !== null);
    if (!removed.length) return;
    state.long = state.long.filter((t) => t.doneAt === null);
    save();
    render();
    showToast(removed.length === 1 ? '1 Aufgabe gelöscht' : `${removed.length} Aufgaben gelöscht`, () => {
      state.long.push(...removed);
    });
  }

  function removeTask(kind, id) {
    const index = state[kind].findIndex((x) => x.id === id);
    if (index < 0) return;
    const [item] = state[kind].splice(index, 1);
    save();
    render();
    showToast('Aufgabe gelöscht', () => { state[kind].splice(index, 0, item); });
  }

  // ---------- Toast ----------

  let toastTimer = 0;
  let undo = null;

  function showToast(text, undoFn = null) {
    undo = undoFn;
    $('toastText').textContent = text;
    $('toastUndo').hidden = !undoFn;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 5000);
  }

  function hideToast() { $('toast').hidden = true; undo = null; }

  $('toastUndo').addEventListener('click', () => {
    if (undo) { undo(); save(); render(); }
    hideToast();
  });

  // ---------- Hinzufügen ----------

  function updateChip() {
    const v = $('newDue').value;
    $('dateChipText').textContent = v ? shortDay(v) : '';
    $('dateChip').classList.toggle('set', Boolean(v));
  }

  $('newDue').addEventListener('change', updateChip);
  $('newDue').addEventListener('input', updateChip);

  $('addForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('newTitle');
    const title = input.value.trim();
    if (!title) { input.focus(); return; }
    input.value = '';
    addTask(title);
    input.focus();
  });

  // ---------- Reiter ----------

  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
    if (tab === b.dataset.tab) return;
    tab = b.dataset.tab;
    try { localStorage.setItem(TAB_KEY, tab); } catch { /* egal */ }
    clearTimeout(moveTimer);
    render();
    $('listWrap').scrollTop = 0;
  }));

  // ---------- Bearbeiten ----------

  const editSheet = $('editSheet');
  let editing = null;

  function openEdit(kind, id) {
    const t = state[kind].find((x) => x.id === id);
    if (!t) return;
    editing = { kind, id };
    $('editTitle').value = t.title;
    $('editDueField').hidden = kind !== 'long';
    $('editDue').value = kind === 'long' && t.due ? t.due : '';
    editSheet.showModal();
  }

  $('editForm').addEventListener('submit', () => {
    if (!editing) return;
    const t = state[editing.kind].find((x) => x.id === editing.id);
    const title = $('editTitle').value.trim();
    if (t && title) {
      t.title = title;
      if (editing.kind === 'long') t.due = $('editDue').value || null;
      save();
      render();
    }
    editing = null;
  });

  $('editDelete').addEventListener('click', () => {
    const e = editing;
    editing = null;
    editSheet.close();
    if (e) removeTask(e.kind, e.id);
  });

  // ---------- Sicherung ----------

  const settingsSheet = $('settingsSheet');
  const status = (text) => { $('settingsStatus').textContent = text; };

  $('openSettings').addEventListener('click', () => { status(''); settingsSheet.showModal(); });
  $('closeSettings').addEventListener('click', () => settingsSheet.close());

  $('exportBtn').addEventListener('click', async () => {
    const name = `abhaken-sicherung-${iso()}.json`;
    const file = new File([JSON.stringify(state, null, 2)], name, { type: 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const url = URL.createObjectURL(file);
        el('a', { href: url, download: name }).click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
      status('Sicherung erstellt.');
    } catch (err) {
      if (err && err.name !== 'AbortError') status('Die Sicherung konnte nicht erstellt werden.');
    }
  });

  $('importBtn').addEventListener('click', () => $('importFile').click());

  $('importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let next = null;
    try { next = normalize(JSON.parse(await file.text())); } catch { /* unten gemeldet */ }
    if (!next) { status('Das ist keine gültige Sicherung von Abhaken.'); return; }
    const n = next.daily.length + next.long.length;
    if (!confirm(`Sicherung mit ${n} Aufgaben laden? Deine aktuellen Aufgaben werden ersetzt.`)) return;
    state = next;
    save();
    render();
    status(`Sicherung geladen: ${n} Aufgaben.`);
  });

  // Tipp neben das Sheet schließt es
  for (const d of [editSheet, settingsSheet]) {
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  }

  // ---------- Tastatur und Bildschirmhöhe (iOS) ----------

  const vv = window.visualViewport;
  function fit() {
    const root = document.documentElement;
    if (!vv) return;
    root.style.setProperty('--app-h', `${vv.height}px`);
    root.classList.toggle('kb', window.innerHeight - vv.height > 120);
    if (window.scrollY) window.scrollTo(0, 0);
  }
  if (vv) {
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    fit();
  }

  // ---------- Tageswechsel ----------

  function checkDay() { if (iso() !== today) render(); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });
  window.addEventListener('pageshow', checkDay);
  setInterval(checkDay, 60000);

  // ---------- Start ----------

  render();

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
