/** Everything Dumbo can do, for the settings page (tick on/off + ▶ try) and the brain (src/main.ts). */
export type ActionId =
  | 'walk' | 'trip' | 'earflap' | 'wave' | 'coding' | 'pushups' | 'rope' | 'hideSeek'
  | 'perch' | 'peek' | 'nibble' | 'push'
  | 'petted' | 'tickled' | 'click' | 'welcome'
  | 'stretch' | 'dance' | 'run' | 'flex' | 'tired' | 'charged'
  | 'doze' | 'curl';

/** Tuning knobs (settings ⚙). Value 0 = Auto: the recommended mix, with a little randomness. */
export type KnobKey = 'often' | 'distance' | 'speed' | 'length' | 'hide';
export interface Knob { label: string; options: Array<[number, string]> }
export const KNOBS: Record<KnobKey, Knob> = {
  often: { label: 'How often', options: [[0, 'Auto'], [0.35, 'Rarely'], [2, 'Often'], [4, 'A lot']] },
  distance: { label: 'How far', options: [[0, 'Auto'], [0.2, 'Short'], [0.5, 'Half the screen'], [1, 'Edge to edge']] },
  speed: { label: 'Speed', options: [[0, 'Auto'], [0.6, 'Slow'], [1, 'Normal'], [1.6, 'Fast']] },
  length: { label: 'How long', options: [[0, 'Auto'], [0.6, 'Short'], [1.8, 'Long']] },
  hide: { label: 'Hiding time', options: [[0, 'Auto'], [0.25, 'Quick'], [2, 'Long']] },
};
export type Tune = Partial<Record<ActionId, Partial<Record<KnobKey, number>>>>;
/** 0 = Auto. */
export const tuneOf = (s: { tune?: Tune } | undefined, id: ActionId, key: KnobKey) => s?.tune?.[id]?.[key] || 0;

export interface ActionInfo { id: ActionId; label: string; hint: string; knobs?: KnobKey[] }
export interface ActionGroup { title: string; note?: string; items: ActionInfo[] }

export const ACTION_GROUPS: ActionGroup[] = [
  {
    title: 'On his own',
    items: [
      { id: 'walk', label: 'Walks around', hint: 'Strolls along the bottom of the screen', knobs: ['often', 'distance', 'speed'] },
      { id: 'trip', label: 'Trips over his trunk', hint: 'Sometimes, after a walk', knobs: ['often'] },
      { id: 'earflap', label: 'Flaps his ears', hint: 'A happy little ear flap', knobs: ['often'] },
      { id: 'wave', label: 'Waves at you', hint: 'Waves with his trunk', knobs: ['often'] },
      { id: 'coding', label: 'Codes in his hoodie', hint: 'Hood up, tap tap tap', knobs: ['often', 'length'] },
      { id: 'pushups', label: 'Push-ups', hint: 'Gets strong', knobs: ['often', 'length'] },
      { id: 'rope', label: 'Skipping rope', hint: 'Hop hop hop', knobs: ['often', 'length'] },
      { id: 'hideSeek', label: 'Hide and seek', hint: 'Vanishes, then peeks upside down from the top of the screen. Click him to find him!', knobs: ['often', 'hide'] },
    ],
  },
  {
    title: 'On your windows',
    note: 'Uses the window in front. ▶ uses this settings window.',
    items: [
      { id: 'perch', label: 'Hops onto your window', hint: 'Sits on its top edge; falls off if it moves', knobs: ['often'] },
      { id: 'peek', label: 'Peeks over the edge', hint: 'While sitting on a window', knobs: ['often'] },
      { id: 'nibble', label: 'Nibbles the corner', hint: 'While sitting on a window', knobs: ['often'] },
      { id: 'push', label: 'Tries to push your window', hint: "It never actually moves", knobs: ['often'] },
    ],
  },
  {
    title: 'When you play with him',
    items: [
      { id: 'click', label: 'Laughs when clicked', hint: 'Boop!' },
      { id: 'petted', label: 'Loves being petted', hint: 'Hold the mouse still over him' },
      { id: 'tickled', label: 'Giggles when tickled', hint: 'Rub the mouse back and forth over him' },
      { id: 'welcome', label: 'Welcomes you back', hint: 'When you come back to the computer' },
    ],
  },
  {
    title: 'Moods & reminders',
    items: [
      { id: 'stretch', label: 'Stretch reminder', hint: 'After a long active stretch (time is set above)' },
      { id: 'dance', label: 'Dances', hint: 'App reactions ("Dances")', knobs: ['length'] },
      { id: 'run', label: 'Runs around', hint: 'App reactions ("Runs around") and charger joy', knobs: ['distance', 'speed'] },
      { id: 'charged', label: 'Excited when you plug in', hint: 'Bounces and runs when charging starts' },
      { id: 'flex', label: 'Flexes when fully charged', hint: 'Asks you to unplug' },
      { id: 'tired', label: 'Tired on low battery', hint: 'Asks you to charge' },
    ],
  },
  {
    title: 'Sleeping',
    note: 'He always naps (see Sleep). These pick how.',
    items: [
      { id: 'doze', label: 'Dozes off sitting', hint: 'Head nods, eyes close' },
      { id: 'curl', label: 'Curls up to sleep', hint: 'Lies down in a little ball' },
    ],
  },
];

export const ALL_ACTIONS: ActionInfo[] = ACTION_GROUPS.flatMap(g => g.items);

/** Every action is on unless switched off in settings. */
export const actionOn = (s: { actions?: Partial<Record<string, boolean>> } | undefined, id: ActionId) => s?.actions?.[id] !== false;
