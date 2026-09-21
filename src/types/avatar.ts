/**
 * ============================================================================
 * TALK TO RITIANS - Anonymous Avatar Customization Types & Palettes
 * ============================================================================
 * Modular avatar configuration schema for anonymous student identities.
 * Stores declarative style parameters in JSONB, never raster images.
 * All graphics are original MIT-licensed scalable SVG vectors.
 */

export type FaceShape = 'round' | 'oval' | 'square';

export type HairStyle =
  | 'short'
  | 'curls'
  | 'bob'
  | 'buzz'
  | 'wavy'
  | 'afro'
  | 'bald';

export type EyeExpression =
  | 'normal'
  | 'happy'
  | 'wink'
  | 'wide'
  | 'focused';

export type EyebrowStyle =
  | 'natural'
  | 'raised'
  | 'flat'
  | 'curved';

export type MouthExpression =
  | 'smile'
  | 'grin'
  | 'laugh'
  | 'neutral'
  | 'smirk';

export type ShirtStyle =
  | 'crew'
  | 'hoodie'
  | 'collar'
  | 'vneck';

export type AccessoryType =
  | 'none'
  | 'glasses'
  | 'sunglasses'
  | 'headphones'
  | 'beanie'
  | 'badge';

export type BackgroundTheme =
  | 'indigo'
  | 'emerald'
  | 'sunset'
  | 'midnight'
  | 'rose'
  | 'ocean'
  | 'amber';

/**
 * Strict JSON Schema for persisted avatar_config in database
 */
export interface AvatarConfig {
  face: FaceShape;
  skin: string;
  hair: HairStyle;
  hairColor: string;
  eyes: EyeExpression;
  eyebrows: EyebrowStyle;
  mouth: MouthExpression;
  shirt: ShirtStyle;
  shirtColor: string;
  accessory: AccessoryType;
  background: BackgroundTheme;
}

/**
 * Default initial avatar configuration
 */
export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  face: 'round',
  skin: '#FDDBB4',
  hair: 'short',
  hairColor: '#1A1A1A',
  eyes: 'normal',
  eyebrows: 'natural',
  mouth: 'smile',
  shirt: 'crew',
  shirtColor: '#4F46E5',
  accessory: 'none',
  background: 'indigo',
};

/**
 * Curated color swatches & choices for UI category selector
 */
export const SKIN_TONES = [
  { id: '#FDDBB4', name: 'Fair Peach', color: '#FDDBB4' },
  { id: '#F5C7A9', name: 'Warm Almond', color: '#F5C7A9' },
  { id: '#E0A37A', name: 'Light Tan', color: '#E0A37A' },
  { id: '#C68642', name: 'Golden Bronze', color: '#C68642' },
  { id: '#8D5524', name: 'Rich Mocha', color: '#8D5524' },
  { id: '#59381E', name: 'Deep Espresso', color: '#59381E' },
];

export const HAIR_COLORS = [
  { id: '#1A1A1A', name: 'Midnight Black', color: '#1A1A1A' },
  { id: '#4A2E18', name: 'Dark Brown', color: '#4A2E18' },
  { id: '#8D5B4C', name: 'Chestnut', color: '#8D5B4C' },
  { id: '#D4AF37', name: 'Honey Gold', color: '#D4AF37' },
  { id: '#A32626', name: 'Auburn Red', color: '#A32626' },
  { id: '#6366F1', name: 'Electric Indigo', color: '#6366F1' },
  { id: '#10B981', name: 'Campus Emerald', color: '#10B981' },
  { id: '#EC4899', name: 'Neon Pink', color: '#EC4899' },
];

export const SHIRT_COLORS = [
  { id: '#4F46E5', name: 'Brand Indigo', color: '#4F46E5' },
  { id: '#059669', name: 'Emerald Green', color: '#059669' },
  { id: '#DC2626', name: 'Crimson Red', color: '#DC2626' },
  { id: '#D97706', name: 'Solar Amber', color: '#D97706' },
  { id: '#0284C7', name: 'Glacier Cyan', color: '#0284C7' },
  { id: '#7C3AED', name: 'Deep Purple', color: '#7C3AED' },
  { id: '#1E293B', name: 'Dark Slate', color: '#1E293B' },
  { id: '#E2E8F0', name: 'Pure White', color: '#E2E8F0' },
];

export const BACKGROUND_THEMES: { id: BackgroundTheme; name: string; gradient: string }[] = [
  { id: 'indigo', name: 'Brand Indigo', gradient: 'from-brand-600 to-indigo-950' },
  { id: 'emerald', name: 'Campus Emerald', gradient: 'from-emerald-600 to-teal-950' },
  { id: 'sunset', name: 'Sunset Glow', gradient: 'from-amber-500 via-orange-600 to-rose-950' },
  { id: 'midnight', name: 'Midnight Dark', gradient: 'from-slate-800 to-slate-950' },
  { id: 'rose', name: 'Neon Rose', gradient: 'from-rose-500 to-pink-950' },
  { id: 'ocean', name: 'Ocean Depth', gradient: 'from-cyan-500 to-blue-950' },
  { id: 'amber', name: 'Solar Flare', gradient: 'from-amber-500 to-orange-950' },
];

export const FACE_OPTIONS: { id: FaceShape; label: string }[] = [
  { id: 'round', label: 'Round' },
  { id: 'oval', label: 'Oval' },
  { id: 'square', label: 'Square' },
];

export const HAIR_OPTIONS: { id: HairStyle; label: string }[] = [
  { id: 'short', label: 'Short Crop' },
  { id: 'curls', label: 'Curls' },
  { id: 'bob', label: 'Classic Bob' },
  { id: 'buzz', label: 'Buzz Cut' },
  { id: 'wavy', label: 'Wavy Flow' },
  { id: 'afro', label: 'Afro Puff' },
  { id: 'bald', label: 'Clean / None' },
];

export const EYE_OPTIONS: { id: EyeExpression; label: string }[] = [
  { id: 'normal', label: 'Attentive' },
  { id: 'happy', label: 'Joyful' },
  { id: 'wink', label: 'Playful Wink' },
  { id: 'wide', label: 'Curious Wide' },
  { id: 'focused', label: 'Focused' },
];

export const EYEBROW_OPTIONS: { id: EyebrowStyle; label: string }[] = [
  { id: 'natural', label: 'Natural' },
  { id: 'raised', label: 'Inquisitive' },
  { id: 'flat', label: 'Calm' },
  { id: 'curved', label: 'Arched' },
];

export const MOUTH_OPTIONS: { id: MouthExpression; label: string }[] = [
  { id: 'smile', label: 'Warm Smile' },
  { id: 'grin', label: 'Wide Grin' },
  { id: 'laugh', label: 'Laugh' },
  { id: 'neutral', label: 'Neutral' },
  { id: 'smirk', label: 'Subtle Smirk' },
];

export const SHIRT_OPTIONS: { id: ShirtStyle; label: string }[] = [
  { id: 'crew', label: 'Crewneck Tee' },
  { id: 'hoodie', label: 'Campus Hoodie' },
  { id: 'collar', label: 'Collared Polo' },
  { id: 'vneck', label: 'V-Neck Tee' },
];

export const ACCESSORY_OPTIONS: { id: AccessoryType; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'glasses', label: 'Modern Glasses' },
  { id: 'sunglasses', label: 'Dark Shades' },
  { id: 'headphones', label: 'Over-Ear Beats' },
  { id: 'beanie', label: 'Campus Beanie' },
  { id: 'badge', label: 'RIT Pin' },
];

/**
 * Validates whether an unknown object conforms to AvatarConfig schema
 */
export function isValidAvatarConfig(obj: unknown): obj is AvatarConfig {
  if (!obj || typeof obj !== 'object') return false;
  const cfg = obj as Record<string, unknown>;

  const validFaces: FaceShape[] = ['round', 'oval', 'square'];
  const validHairs: HairStyle[] = ['short', 'curls', 'bob', 'buzz', 'wavy', 'afro', 'bald'];
  const validEyes: EyeExpression[] = ['normal', 'happy', 'wink', 'wide', 'focused'];
  const validBrows: EyebrowStyle[] = ['natural', 'raised', 'flat', 'curved'];
  const validMouths: MouthExpression[] = ['smile', 'grin', 'laugh', 'neutral', 'smirk'];
  const validShirts: ShirtStyle[] = ['crew', 'hoodie', 'collar', 'vneck'];
  const validAcc: AccessoryType[] = ['none', 'glasses', 'sunglasses', 'headphones', 'beanie', 'badge'];
  const validBg: BackgroundTheme[] = ['indigo', 'emerald', 'sunset', 'midnight', 'rose', 'ocean', 'amber'];

  if (!validFaces.includes(cfg.face as FaceShape)) return false;
  if (typeof cfg.skin !== 'string' || !cfg.skin.startsWith('#')) return false;
  if (!validHairs.includes(cfg.hair as HairStyle)) return false;
  if (typeof cfg.hairColor !== 'string' || !cfg.hairColor.startsWith('#')) return false;
  if (!validEyes.includes(cfg.eyes as EyeExpression)) return false;
  if (!validBrows.includes(cfg.eyebrows as EyebrowStyle)) return false;
  if (!validMouths.includes(cfg.mouth as MouthExpression)) return false;
  if (!validShirts.includes(cfg.shirt as ShirtStyle)) return false;
  if (typeof cfg.shirtColor !== 'string' || !cfg.shirtColor.startsWith('#')) return false;
  if (!validAcc.includes(cfg.accessory as AccessoryType)) return false;
  if (!validBg.includes(cfg.background as BackgroundTheme)) return false;

  return true;
}

/**
 * Generates a completely randomized, 100% valid AvatarConfig
 */
export function generateRandomAvatarConfig(): AvatarConfig {
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

  return {
    face: pick(FACE_OPTIONS).id,
    skin: pick(SKIN_TONES).id,
    hair: pick(HAIR_OPTIONS).id,
    hairColor: pick(HAIR_COLORS).id,
    eyes: pick(EYE_OPTIONS).id,
    eyebrows: pick(EYEBROW_OPTIONS).id,
    mouth: pick(MOUTH_OPTIONS).id,
    shirt: pick(SHIRT_OPTIONS).id,
    shirtColor: pick(SHIRT_COLORS).id,
    accessory: pick(ACCESSORY_OPTIONS).id,
    background: pick(BACKGROUND_THEMES).id,
  };
}
