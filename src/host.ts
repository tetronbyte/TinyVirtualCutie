/** Typed access to the Electron preload bridge (electron/preload.cjs). */
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
  appReactions: AppReaction[];
}
export type ReactionAction = 'coding' | 'dance' | 'wave' | 'exercise' | 'run' | 'none';
export interface AppReaction { app: string; action: ReactionAction }
export interface Foreground { name: string; x: number; y: number; w: number; h: number; max: boolean }
export interface Rect { x: number; y: number; width: number; height: number }
export interface Cursor { x: number; y: number; w: number; h: number }

interface Host {
  getState(): Promise<{ settings: Settings; hasBattery: boolean; platform?: string }>;
  getSettings(): Promise<Settings>;
  setSettings(s: Partial<Settings>): void;
  log(m: string): void;
  ignoreMouse(ignore: boolean): void;
  winInfo(): Promise<{ bounds: Rect; workArea: Rect }>;
  move(x: number, y: number): void;
  savePos(): void;
  dragStart(ox: number, oy: number): void;
  dragEnd(): void;
  track(on: boolean): void;
  openSettings(): void;
  foreground(): Promise<Foreground | null>;
  idleSeconds(): Promise<number>;
  onCursor(cb: (c: Cursor) => void): () => void;
  onAction(cb: (a: string) => void): () => void;
  onSettings(cb: (s: Settings) => void): () => void;
  onBatteryPresent(cb: (b: boolean) => void): () => void;
  onSay(cb: (text: string) => void): () => void;
}

declare global { interface Window { host: Host } }

/** Falls back to a no-op host in a plain browser (preview page). */
const noop = () => {};
export const host: Host = window.host ?? {
  getState: async () => ({ settings: { name: 'Dumbo', theme: 'auto', size: 1, startWithWindows: false, batteryLow: 30, batteryHigh: 90, sleepStart: '23:00', sleepEnd: '07:00', sleepiness: 0.6, visitWindows: true, stretchEvery: 50, autoUpdate: true, appReactions: [] }, hasBattery: false }),
  getSettings: async () => (await (host as Host).getState()).settings,
  setSettings: noop, log: (m: string) => console.log(m), ignoreMouse: noop,
  winInfo: async () => ({ bounds: { x: 0, y: 0, width: 240, height: 220 }, workArea: { x: 0, y: 0, width: 1280, height: 720 } }),
  move: noop, savePos: noop, dragStart: noop, dragEnd: noop, track: noop, openSettings: noop,
  foreground: async () => null, idleSeconds: async () => 0,
  onCursor: () => noop, onAction: () => noop, onSettings: () => noop, onBatteryPresent: () => noop, onSay: () => noop,
};
