import { host, type Settings, type AppReaction, type ReactionAction } from './host';

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

function render() {
  $('title').textContent = `${S.name} settings`;
  document.title = `${S.name} settings`;
  seg('sizeSeg', String(S.size), v => save({ size: Number(v) }));
  seg('themeSeg', S.theme, v => save({ theme: v as Settings['theme'] }));
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

async function init() {
  const st = await host.getState();
  S = st.settings;
  if (st.platform === 'darwin') {
    $('appsSection').hidden = true; // window visits / app reactions: Windows only for now
    $('autostartLabel').textContent = 'Open at login';
  }
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
  const upd = $<HTMLInputElement>('autoUpdate'); upd.checked = S.autoUpdate;
  upd.onchange = () => save({ autoUpdate: upd.checked });
  render();
}
init();
