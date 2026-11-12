/** Typed access to the Electron preload bridge (electron/preload.cjs). */
import type { ActionId, Tune } from './actions';
export interface Settings {
  name: string;
  theme: 'auto' | 'light' | 'dark';
  size: number;
  startWithWindows: boolean;
  batteryLow: number;
  batteryHigh: number;
  sleepStart: string; // "HH:MM"
  sleepEnd: string;
  sleepiness: number; // 0..1, how much of the time he naps
  visitWindows: boolean; // hop onto / peek at / push your windows
  stretchEvery: number; // minutes of continuous activity before a "let's stretch" nudge (0 = off)
  autoUpdate: boolean; // check the public release repo every few hours; applies on next start
  actions: Partial<Record<ActionId, boolean>>; // switched-off actions are false (missing = on)
  tune: Tune; // per-action knobs (missing / 0 = Auto)
  perfMode: PerfMode; // normal | battery saver | low memory (restart)
  saverUnplugged: boolean; // battery saver automatically while not charging
  appReactions: AppReaction[];
}
export type PerfMode = 'normal' | 'battery' | 'memory';
export type ReactionAction = 'coding' | 'dance' | 'wave' | 'exercise' | 'run' | 'none';
export interface AppReaction { app: string; action: ReactionAction }
/** Tray "Stay here" (pin) + "Keep him…" (kind), with an optional timer (until = epoch ms, 0 = none). */
export type HoldKind = 'free' | 'sleep' | 'awake' | 'coding' | 'exercise' | 'walk';
export interface Hold { pin: boolean; kind: HoldKind; until: number; reason?: 'user' | 'timer' | 'restore' }
export interface Foreground { name: string; x: number; y: number; w: number; h: number; max: boolean }
export interface Rect { x: number; y: number; width: number; height: number }
export interface Cursor { x: number; y: number; w: number; h: number }

interface Host {
  getState(): Promise<{ settings: Settings; hasBattery: boolean; platform?: string; hold?: Hold }>;
  getSettings(): Promise<Settings>;
  setSettings(s: Partial<Settings>): void;
  log(m: string): void;
  ignoreMouse(ignore: boolean): void;
  winInfo(): Promise<{ bounds: Rect; workArea: Rect }>;
  move(x: number, y: number): void;
  savePos(): void;
  dragStart(ox: number, oy: number): void;
  dragEnd(): void;
  track(on: boolean, ms?: number): void;
  openSettings(): void;
  foreground(): Promise<Foreground | null>;
  idleSeconds(): Promise<number>;
  onCursor(cb: (c: Cursor) => void): () => void;
  /** Cursor inside his window (window coords), or null when it just left. ~5 Hz, from the host. */
  onHover(cb: (p: { x: number; y: number } | null) => void): () => void;
  onAction(cb: (a: string) => void): () => void;
  onSettings(cb: (s: Settings) => void): () => void;
  onBatteryPresent(cb: (b: boolean) => void): () => void;
  onSay(cb: (text: string) => void): () => void;
  onHold(cb: (h: Hold) => void): () => void;
  tryAction(id: ActionId): void;
  onTry(cb: (id: ActionId) => void): () => void;
}

declare global { interface Window { host: Host } }

/** Falls back to a no-op host in a plain browser (preview page). */
const noop = () => {};
export const host: Host = window.host ?? {
  getState: async () => ({ settings: { name: 'Dumbo', theme: 'auto', size: 1, startWithWindows: false, batteryLow: 30, batteryHigh: 90, sleepStart: '23:00', sleepEnd: '07:00', sleepiness: 0.6, visitWindows: true, stretchEvery: 50, autoUpdate: true, actions: {}, tune: {}, perfMode: 'normal', saverUnplugged: false, appReactions: [] }, hasBattery: false }),
  getSettings: async () => (await (host as Host).getState()).settings,
  setSettings: noop, log: (m: string) => console.log(m), ignoreMouse: noop,
  winInfo: async () => ({ bounds: { x: 0, y: 0, width: 240, height: 220 }, workArea: { x: 0, y: 0, width: 1280, height: 720 } }),
  move: noop, savePos: noop, dragStart: noop, dragEnd: noop, track: noop, openSettings: noop,
  foreground: async () => null, idleSeconds: async () => 0,
  onCursor: () => noop, onHover: () => noop, onAction: () => noop, onSettings: () => noop, onBatteryPresent: () => noop, onSay: () => noop, onHold: () => noop, tryAction: noop, onTry: () => noop,
};
