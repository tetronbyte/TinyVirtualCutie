import { host, type Settings, type AppReaction, type ReactionAction } from './host';
import { ACTION_GROUPS, ALL_ACTIONS, KNOBS, actionOn, type ActionId, type ActionInfo, type Tune } from './actions';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let S: Settings;
let savedTimer = 0;

function save(patch: Partial<Settings>) {
  S = { ...S, ...patch };
  host.setSettings(patch);
  render();
  const el = $('saved');
  el.textContent = 'Saved';
  clearTimeout(savedTimer);
  savedTimer = window.setTimeout(() => (el.textContent = ''), 1200);
}

function seg(id: string, value: string, onPick: (v: string) => void) {
  $(id).querySelectorAll('button').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.v === value));
    b.onclick = () => onPick(b.dataset.v!);
  });
}

const PERF_HINTS: Record<Settings['perfMode'], string> = {
  normal: 'Everything on, at his usual pace.',
  battery: 'Calmer and sleepier: does less, naps more, simpler animation. Saves battery.',
  memory: 'Uses less memory. Visiting windows and app reactions turn off. He restarts to switch.',
};

function render() {
  $('title').textContent = `${S.name} settings`;
  document.title = `${S.name} settings`;
  seg('sizeSeg', String(S.size), v => save({ size: Number(v) }));
  seg('themeSeg', S.theme, v => save({ theme: v as Settings['theme'] }));
  seg('perfSeg', S.perfMode || 'normal', v => save({ perfMode: v as Settings['perfMode'] }));
  $('perfHint').textContent = PERF_HINTS[S.perfMode || 'normal'];
  $('sizeOut').textContent = `${Math.round(S.size * 100)}%`;
  $('sleepOut').textContent = `${Math.round(S.sleepiness * 100)}%`;
  $('lowOut').textContent = `${S.batteryLow}%`;
  $('highOut').textContent = `${S.batteryHigh}%`;
  $('stretchOut').textContent = S.stretchEvery ? `${S.stretchEvery} min` : 'off';
}

const ACTIONS: Array<[ReactionAction, string]> = [['coding', 'Codes with you'], ['dance', 'Dances'], ['wave', 'Waves'], ['exercise', 'Works out'], ['run', 'Runs around'], ['none', 'Nothing']];
function renderReactions() {
  const box = $('reactions');
  box.innerHTML = '';
  S.appReactions.forEach((r, i) => {
    const row = document.createElement('div'); row.className = 'react';
    const app = document.createElement('input'); app.type = 'text'; app.value = r.app; app.placeholder = 'app name'; app.setAttribute('aria-label', 'App process name');
    const act = document.createElement('select'); act.setAttribute('aria-label', 'Reaction');
    for (const [v, label] of ACTIONS) { const o = document.createElement('option'); o.value = v; o.textContent = label; o.selected = v === r.action; act.append(o); }
    const del = document.createElement('button'); del.textContent = '✕'; del.setAttribute('aria-label', `Remove ${r.app}`);
    const commit = () => saveReactions(S.appReactions.map((x, j) => (j === i ? { app: app.value.trim().replace(/\.exe$/i, ''), action: act.value as ReactionAction } : x)));
    app.onchange = commit; act.onchange = commit;
    del.onclick = () => saveReactions(S.appReactions.filter((_, j) => j !== i));
    row.append(app, act, del); box.append(row);
  });
}
function saveReactions(list: AppReaction[]) { save({ appReactions: list }); renderReactions(); }

// ---------- actions: tick list with drag-to-paint + ▶ try ----------
let actions: Partial<Record<ActionId, boolean>> = {};
let paint: boolean | null = null;
const rowOf = (id: ActionId) => document.querySelector<HTMLElement>(`.arow[data-id="${id}"]`);
function showTick(id: ActionId) {
  const on = actions[id] !== false, row = rowOf(id);
  row?.classList.toggle('off', !on);
  row?.querySelector('.tick')?.setAttribute('aria-checked', String(on));
}
function setTick(id: ActionId, on: boolean) {
  if (on) delete actions[id]; else actions[id] = false;
  showTick(id);
}
const saveActions = () => save({ actions: { ...actions } });

// ⚙ knobs: each a row of choices; Auto (0) is stored as "no value".
let tune: Tune = {};
const isCustom = (id: ActionId) => Object.values(tune[id] || {}).some(v => v);
function tunePanel(a: ActionInfo, gear: HTMLButtonElement) {
  const box = document.createElement('div'); box.className = 'tunebox'; box.hidden = true;
  for (const key of a.knobs || []) {
    const knob = KNOBS[key];
    const row = document.createElement('div'); row.className = 'knob';
    const label = document.createElement('span'); label.textContent = knob.label;
    const seg = document.createElement('div'); seg.className = 'seg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', `${a.label}: ${knob.label}`);
    const paintSeg = () => seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === (tune[a.id]?.[key] || 0))));
    for (const [v, text] of knob.options) {
      const b = document.createElement('button'); b.dataset.v = String(v); b.textContent = text;
      b.onclick = () => {
        const t = { ...(tune[a.id] || {}) };
        if (v) t[key] = v; else delete t[key];
        if (Object.keys(t).length) tune[a.id] = t; else delete tune[a.id];
        paintSeg(); gear.classList.toggle('custom', isCustom(a.id));
        save({ tune: { ...tune } });
      };
      seg.append(b);
    }
    paintSeg();
    row.append(label, seg); box.append(row);
  }
  return box;
}

let wired = false;
function renderActions(mac: boolean) {
  const box = $('actionList');
  box.innerHTML = '';
  for (const g of ACTION_GROUPS) {
    const sec = document.createElement('div'); sec.className = 'agroup';
    const h = document.createElement('h3'); h.textContent = g.title; sec.append(h);
    const noteText = g.title === 'On your windows' && mac ? 'Mac: only with ▶ Try for now (uses this settings window).' : g.note;
    if (noteText) { const n = document.createElement('p'); n.className = 'note'; n.textContent = noteText; sec.append(n); }
    for (const a of g.items) {
      const row = document.createElement('div'); row.className = 'arow'; row.dataset.id = a.id;
      const tick = document.createElement('button'); tick.className = 'tick'; tick.setAttribute('role', 'checkbox'); tick.setAttribute('aria-label', a.label);
      tick.onclick = e => e.preventDefault(); // toggled on pointerdown (mouse) or keydown (keyboard)
      tick.onkeydown = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setTick(a.id, actions[a.id] === false); saveActions(); } };
      const text = document.createElement('div');
      const name = document.createElement('span'); name.className = 'aname'; name.textContent = a.label;
      const hint = document.createElement('small'); hint.textContent = a.hint;
      text.append(name, hint);
      const tryBtn = document.createElement('button'); tryBtn.className = 'try'; tryBtn.textContent = '▶ Try'; tryBtn.setAttribute('aria-label', `Try: ${a.label}`);
      tryBtn.onclick = () => host.tryAction(a.id);
      const gear = document.createElement('button'); gear.className = 'gear'; gear.textContent = '⚙';
      if (a.knobs?.length) {
        gear.title = 'Tune'; gear.setAttribute('aria-label', `Tune: ${a.label}`); gear.setAttribute('aria-expanded', 'false');
        gear.classList.toggle('custom', isCustom(a.id));
        const panel = tunePanel(a, gear);
        gear.onclick = () => { panel.hidden = !panel.hidden; gear.setAttribute('aria-expanded', String(!panel.hidden)); };
        row.append(tick, text, gear, tryBtn, panel);
      } else {
        gear.style.visibility = 'hidden'; gear.tabIndex = -1; gear.setAttribute('aria-hidden', 'true');
        row.append(tick, text, gear, tryBtn);
      }
      sec.append(row);
    }
    box.append(sec);
  }
  ALL_ACTIONS.forEach(a => showTick(a.id));
  if (wired) return; // listeners below are added once (Reset re-renders the list)
  wired = true;
  // Press on a box, then drag over other rows: they all take the new value. Saved once, on release.
  box.addEventListener('pointerdown', e => {
    const tick = (e.target as HTMLElement).closest<HTMLElement>('.tick');
    if (!tick || e.button !== 0) return;
    e.preventDefault();
    const id = tick.closest<HTMLElement>('.arow')!.dataset.id as ActionId;
    paint = actions[id] === false; // off → paint on, on → paint off
    setTick(id, paint);
    document.body.classList.add('painting');
  });
  // pointermove + elementFromPoint (not just pointerover): keeps painting even if the pressed button
  // captured the pointer.
  window.addEventListener('pointermove', e => {
    if (paint === null) return;
    const row = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.arow');
    if (row) setTick(row.dataset.id as ActionId, paint);
  });
  window.addEventListener('pointerup', () => {
    if (paint === null) return;
    paint = null;
    document.body.classList.remove('painting');
    saveActions();
  });
  $('allOn').onclick = () => { ALL_ACTIONS.forEach(a => setTick(a.id, true)); saveActions(); };
  $('allOff').onclick = () => { ALL_ACTIONS.forEach(a => setTick(a.id, false)); saveActions(); };
  $('resetTune').onclick = () => { tune = {}; save({ tune: {} }); renderActions(mac); };
}

async function init() {
  const st = await host.getState();
  S = st.settings;
  if (st.platform === 'darwin') {
    $('appsSection').hidden = true; // window visits / app reactions: Windows only for now
    $('autostartLabel').textContent = 'Open at login';
  }
  actions = { ...(S.actions || {}) };
  tune = JSON.parse(JSON.stringify(S.tune || {}));
  ALL_ACTIONS.forEach(a => { if (!actionOn(S, a.id)) actions[a.id] = false; });
  renderActions(st.platform === 'darwin');
  const name = $<HTMLInputElement>('name'); name.value = S.name;
  name.onchange = () => save({ name: name.value.trim() || 'Dumbo' });
  const range = (id: string, key: keyof Settings, num = Number) => {
    const el = $<HTMLInputElement>(id); el.value = String(S[key]);
    el.oninput = () => { (S as any)[key] = num(el.value); render(); };
    el.onchange = () => save({ [key]: num(el.value) } as Partial<Settings>);
  };
  range('size', 'size'); range('sleepiness', 'sleepiness'); range('batteryLow', 'batteryLow'); range('batteryHigh', 'batteryHigh'); range('stretchEvery', 'stretchEvery');
  const visit = $<HTMLInputElement>('visitWindows'); visit.checked = S.visitWindows;
  visit.onchange = () => save({ visitWindows: visit.checked });
  $('addReaction').onclick = () => { saveReactions([...S.appReactions, { app: '', action: 'coding' }]); ($('reactions').lastElementChild?.querySelector('input') as HTMLInputElement | null)?.focus(); };
  renderReactions();
  for (const id of ['sleepStart', 'sleepEnd'] as const) {
    const el = $<HTMLInputElement>(id); el.value = S[id];
    el.onchange = () => save({ [id]: el.value } as Partial<Settings>);
  }
  const auto = $<HTMLInputElement>('startWithWindows'); auto.checked = S.startWithWindows;
  auto.onchange = () => save({ startWithWindows: auto.checked });
  const unplugged = $<HTMLInputElement>('saverUnplugged'); unplugged.checked = !!S.saverUnplugged;
  unplugged.onchange = () => save({ saverUnplugged: unplugged.checked });
  $('unpluggedRow').hidden = !st.hasBattery;
  const upd = $<HTMLInputElement>('autoUpdate'); upd.checked = S.autoUpdate;
  upd.onchange = () => save({ autoUpdate: upd.checked });
  render();
}
init();
