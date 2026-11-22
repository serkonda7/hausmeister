// Icons for item types: a stable English key is stored (item_types.icon) and
// rendered as an emoji, so no icon font or image set is needed.
export const TYPE_ICONS = {
  box: "📦",
  book: "📚",
  tool: "🔧",
  power_tool: "🔌",
  hammer: "🔨",
  saw: "🪚",
  screw: "🔩",
  gear: "⚙️",
  battery: "🔋",
  bottle: "🧴",
  broom: "🧹",
  shirt: "👕",
  shoe: "👟",
  laptop: "💻",
  phone: "📱",
  camera: "📷",
  tv: "📺",
  game: "🎮",
  toy: "🧸",
  bike: "🚲",
  car: "🚗",
  kitchen: "🍳",
  plant: "🪴",
  music: "🎸",
  sport: "⚽",
  document: "📄",
  medicine: "💊",
  key: "🔑",
} as const;

export type TypeIcon = keyof typeof TYPE_ICONS;
export const TYPE_ICON_KEYS = Object.keys(TYPE_ICONS) as TypeIcon[];

export const isTypeIcon = (v: unknown): v is TypeIcon =>
  typeof v === "string" && Object.hasOwn(TYPE_ICONS, v);

/** Emoji for an icon key; a neutral box for unknown or missing keys. */
export const typeIconGlyph = (icon: string | null | undefined): string =>
  isTypeIcon(icon) ? TYPE_ICONS[icon] : TYPE_ICONS.box;
