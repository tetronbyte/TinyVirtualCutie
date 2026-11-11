import { host, type Settings } from './host';

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
}

async function init() {
  S = await host.getSettings();
  const name = $<HTMLInputElement>('name'); name.value = S.name;
  name.onchange = () => save({ name: name.value.trim() || 'Dumbo' });
  const range = (id: string, key: keyof Settings, num = Number) => {
    const el = $<HTMLInputElement>(id); el.value = String(S[key]);
    el.oninput = () => { (S as any)[key] = num(el.value); render(); };
    el.onchange = () => save({ [key]: num(el.value) } as Partial<Settings>);
  };
  range('size', 'size'); range('sleepiness', 'sleepiness'); range('batteryLow', 'batteryLow'); range('batteryHigh', 'batteryHigh');
  for (const id of ['sleepStart', 'sleepEnd'] as const) {
    const el = $<HTMLInputElement>(id); el.value = S[id];
    el.onchange = () => save({ [id]: el.value } as Partial<Settings>);
  }
  const auto = $<HTMLInputElement>('startWithWindows'); auto.checked = S.startWithWindows;
  auto.onchange = () => save({ startWithWindows: auto.checked });
  render();
}
init();
