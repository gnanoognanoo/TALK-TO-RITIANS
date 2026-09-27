/**
 * ============================================================================
 * TALK TO RITIANS - Curated Predefined Short Alias Pool
 * ============================================================================
 * Verified users select from curated short random aliases (3–8 chars, max 10).
 * Free-text username entry is strictly prohibited to guarantee:
 * 1. Zero exposure of student names, initials, or social handles
 * 2. Zero exposure of department, batch, section, or registration numbers
 * 3. Prevention of offensive, derogatory, or suggestive names
 * 4. Prevention of HTML, script, or SQL injection vectors
 * 5. Compact, clean chat headers: [Avatar] Nova ● Online
 */

export const SAFE_ALIAS_POOL: readonly string[] = Object.freeze([
  // Primary Requested Short Names (3–8 chars, strictly <= 10)
  'Nova',
  'Kiro',
  'Echo',
  'Zeno',
  'Ryu',
  'Kai',
  'Luna',
  'Neo',
  'Vex',
  'Axel',
  'Kaze',
  'Milo',
  'Nox',
  'Aero',
  'Zen',
  'Rune',
  'Flux',
  'Jett',
  'Yuki',
  'Mika',
  'Sora',
  'Rex',
  'Ivy',
  'Nyx',

  // Curated Short Tech & Cosmic Personas (3–8 chars)
  'Apex',
  'Atlas',
  'Blaze',
  'Bolt',
  'Cid',
  'Dash',
  'Drift',
  'Faye',
  'Finn',
  'Frost',
  'Gale',
  'Ghost',
  'Halo',
  'Hawk',
  'Iris',
  'Jade',
  'Jazz',
  'Kona',
  'Lark',
  'Link',
  'Lynx',
  'Mars',
  'Mav',
  'Mist',
  'Onyx',
  'Orion',
  'Pax',
  'Pip',
  'Pixel',
  'Pluto',
  'Quinn',
  'Raven',
  'Rico',
  'Rogue',
  'Sage',
  'Scout',
  'Shade',
  'Skye',
  'Spark',
  'Storm',
  'Swift',
  'Talon',
  'Titan',
  'Vega',
  'Vibe',
  'Volt',
  'Wren',
  'Zero',
  'Ziggy',
  'Zion',
  'Ash',
  'Fox',
  'Leo',
  'Max',
  'Ray',
  'Sam',
  'Breeze',
  'Canyon',
  'Orbit',
  'Pulse',
  'Solar',
  'Zephyr',
  'Boreal',
  'Cipher',
  'Matrix',
  'Nexus',
  'Prism',
  'Rift',
  'Sonic',
  'Vortex',
]);

/**
 * Validates alias format, length, and injection safety.
 * Hard maximum: 10 characters.
 */
export function isValidAliasFormat(alias: string): { valid: boolean; error?: string } {
  if (!alias || typeof alias !== 'string') {
    return { valid: false, error: 'Alias is required.' };
  }

  const trimmed = alias.trim();

  if (trimmed.length < 3) {
    return { valid: false, error: 'Alias must be at least 3 characters long.' };
  }

  if (trimmed.length > 10) {
    return { valid: false, error: 'Alias cannot exceed 10 characters.' };
  }

  // Strict character set: Letters, numbers, underscores only (no spaces, no symbols)
  if (!/^[A-Za-z0-9_]+$/.test(trimmed)) {
    return {
      valid: false,
      error: 'Alias may only contain letters, numbers, and underscores (no HTML, spaces, or symbols).',
    };
  }

  // Reject obvious HTML tags, scripts, or event handler patterns
  const lower = trimmed.toLowerCase();
  if (
    lower.includes('<') ||
    lower.includes('>') ||
    lower.includes('script') ||
    lower.includes('javascript') ||
    lower.includes('onerror') ||
    lower.includes('onload')
  ) {
    return { valid: false, error: 'Alias contains forbidden markup or script characters.' };
  }

  return { valid: true };
}

/**
 * Generates ONE random short alias from the curated pool.
 * Guarantees that the new alias differs from `currentAlias` when alternatives exist.
 * Does NOT write to the database (pure client-side draw).
 */
export function getRandomShortAlias(currentAlias?: string): string {
  const eligible = currentAlias
    ? SAFE_ALIAS_POOL.filter((a) => a.toLowerCase() !== currentAlias.toLowerCase())
    : [...SAFE_ALIAS_POOL];

  const source = eligible.length > 0 ? eligible : [...SAFE_ALIAS_POOL];
  const randomIndex = Math.floor(Math.random() * source.length);
  return source[randomIndex];
}

/**
 * Returns `count` randomly sampled distinct aliases from the pool.
 * Attempts to avoid repeating aliases currently presented in `exclude`.
 */
export function getRandomAliasBatch(count = 3, exclude: string[] = []): string[] {
  const excludeSet = new Set(exclude.map((e) => e.toLowerCase()));
  const eligible = SAFE_ALIAS_POOL.filter((alias) => !excludeSet.has(alias.toLowerCase()));

  // If eligible pool is too small, fallback to entire pool
  const source = eligible.length >= count ? eligible : [...SAFE_ALIAS_POOL];

  // Fisher-Yates shuffle on a copy
  const shuffled = [...source];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, count);
}

export default SAFE_ALIAS_POOL;
