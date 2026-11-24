export type YarnPose =
  | 'idle'
  | 'wave'
  | 'run'
  | 'jump'
  | 'climb'
  | 'pull'
  | 'ride'
  | 'tpose';

export type CameraPresetId = 'hero' | 'face' | 'side' | 'back' | 'top';

export type YarnPresetId = 'crimson' | 'cerulean' | 'moss' | 'oat' | 'saffron';

export interface YarnPreset {
  id: YarnPresetId;
  label: string;
  color: string;
  sheenColor: string;
  eyeColor: string;
}

export const YARN_PRESETS: YarnPreset[] = [
  {
    id: 'crimson',
    label: 'Кармін (Класичний)',
    color: '#c93838',
    sheenColor: '#ff9b8f',
    eyeColor: '#161414',
  },
  {
    id: 'cerulean',
    label: 'Лазур (Unravel 2)',
    color: '#3474cc',
    sheenColor: '#9ac8ff',
    eyeColor: '#14171c',
  },
  {
    id: 'moss',
    label: 'Лісовий мох',
    color: '#4c7a52',
    sheenColor: '#a8d4a2',
    eyeColor: '#161814',
  },
  {
    id: 'oat',
    label: 'Тепла вовна',
    color: '#d4c2a8',
    sheenColor: '#fff5e6',
    eyeColor: '#261e18',
  },
  {
    id: 'saffron',
    label: 'Шафран',
    color: '#d18e2c',
    sheenColor: '#ffe099',
    eyeColor: '#1c1610',
  },
];

export interface BikePreset {
  id: string;
  label: string;
  color: string;
  sheenColor: string;
}

export const BIKE_PRESETS: BikePreset[] = [
  { id: 'teal', label: 'Вінтажний тіл', color: '#2b6a84', sheenColor: '#8ad0eb' },
  { id: 'ochre', label: 'Гірчиця', color: '#c97e24', sheenColor: '#ffd485' },
  { id: 'emerald', label: 'Британський зелений', color: '#2b5944', sheenColor: '#88c9a8' },
  { id: 'slate', label: 'Графіт', color: '#39414e', sheenColor: '#98a6bd' },
  { id: 'plum', label: 'Слива', color: '#6b3654', sheenColor: '#d48cb5' },
];

export const SEAT_PRESETS: { id: string; label: string; color: string }[] = [
  { id: 'cognac', label: 'Коньяк', color: '#8f522e' },
  { id: 'sand', label: 'Кремовий', color: '#d4c2a8' },
  { id: 'espresso', label: 'Еспресо', color: '#472c1e' },
  { id: 'charcoal', label: 'Темний', color: '#262930' },
];

export type HeldItemId = 'none' | 'lantern' | 'yarn_ball' | 'wrench' | 'flower';

export const HELD_ITEMS: { id: HeldItemId; label: string }[] = [
  { id: 'none', label: 'Без предмета' },
  { id: 'lantern', label: 'Ліхтарик' },
  { id: 'yarn_ball', label: 'Клубок' },
  { id: 'wrench', label: 'Ключ' },
  { id: 'flower', label: 'Квітка' },
];

export interface YarnCreatureConfig {
  color: string;
  sheenColor: string;
  eyeColor: string;
  yarnThickness: number; // 0.75 .. 1.35
  fuzzDensity: number; // 0 .. 1
  duoMode: boolean;
  secondaryColor: string;
  secondarySheenColor: string;
  bikeColor: string;
  bikeSheenColor: string;
  seatColor: string;
  showTail: boolean;
  heldItem: HeldItemId;
  heldHand: 'right' | 'left';
}

export const DEFAULT_CREATURE_CONFIG: YarnCreatureConfig = {
  color: '#c93838',
  sheenColor: '#ff9b8f',
  eyeColor: '#161414',
  yarnThickness: 1.0,
  fuzzDensity: 0.85,
  duoMode: false,
  secondaryColor: '#3474cc',
  secondarySheenColor: '#9ac8ff',
  bikeColor: '#2b6a84',
  bikeSheenColor: '#8ad0eb',
  seatColor: '#8f522e',
  showTail: false,
  heldItem: 'none',
  heldHand: 'right',
};

export type StageElementId =
  | 'scene'
  | 'creature'
  | 'motorcycle'
  | 'tree'
  | 'obstacle';

export const STAGE_ELEMENTS: { id: StageElementId; label: string }[] = [
  { id: 'scene', label: 'Вся сцена' },
  { id: 'creature', label: 'Герой' },
  { id: 'motorcycle', label: 'Мотоцикл' },
  { id: 'tree', label: 'Дерево' },
  { id: 'obstacle', label: 'Перешкода' },
];

export type TrackSurfaceId = 'moto_track' | 'gravel' | 'oak';

export const TRACK_SURFACES: { id: TrackSurfaceId; label: string }[] = [
  { id: 'moto_track', label: 'Мототрек' },
  { id: 'gravel', label: 'Гравій' },
  { id: 'oak', label: 'Дубовий стіл' },
];

export type TreeVariantId = 'spruce' | 'pine' | 'birch';

export const TREE_VARIANTS: { id: TreeVariantId; label: string }[] = [
  { id: 'spruce', label: 'Ялина' },
  { id: 'pine', label: 'Сосна' },
  { id: 'birch', label: 'Береза' },
];

export const FOLIAGE_PRESETS: {
  id: string;
  label: string;
  color: string;
  sheen: string;
}[] = [
  { id: 'deep', label: 'Хвоя', color: '#294f37', sheen: '#78b587' },
  { id: 'emerald', label: 'Смарагд', color: '#2f5d47', sheen: '#8ac7a3' },
  { id: 'birch', label: 'Весна', color: '#4c7844', sheen: '#b3df94' },
  { id: 'autumn', label: 'Осінь', color: '#8a5629', sheen: '#e0a96d' },
];

export type ObstacleType =
  | 'ramp'
  | 'log_jump'
  | 'tire_barrier'
  | 'spool_table'
  | 'slalom_gate';

export const OBSTACLE_TYPES: { id: ObstacleType; label: string }[] = [
  { id: 'ramp', label: 'Трамплін' },
  { id: 'log_jump', label: 'Колоди' },
  { id: 'tire_barrier', label: 'Шини' },
  { id: 'spool_table', label: 'Котушка' },
  { id: 'slalom_gate', label: 'Ворота' },
];

