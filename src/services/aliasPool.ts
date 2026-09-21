/**
 * ============================================================================
 * TALK TO RITIANS - Curated Predefined Alias Pool
 * ============================================================================
 * In V1, students DO NOT type arbitrary free-form usernames.
 * The system presents randomized selections from this pre-screened pool
 * of clean, creative aliases to ensure:
 * 1. Zero exposure of student names, initials, or social handles
 * 2. Zero exposure of department, batch, or registration numbers
 * 3. Prevention of offensive, derogatory, or inappropriate names
 * 4. Prevention of HTML, script, or SQL injection vectors
 */

export const SAFE_ALIAS_POOL: readonly string[] = Object.freeze([
  // Core Animals & Tech Adjectives
  'SilentFox',
  'NeonWolf',
  'PixelPanda',
  'LunarTiger',
  'EchoRaven',
  'NovaBear',
  'CosmicFalcon',
  'SwiftOtter',
  'CyberCheetah',
  'SolarLynx',
  'ShadowHawk',
  'FrostBadger',
  'AmberOwl',
  'CrystalPhoenix',
  'MysticDolphin',
  'VelvetJaguar',
  'IronEagle',
  'StellarLeopard',
  'AstralCobra',
  'RapidMoose',
  'ZenKoala',
  'RadiantGecko',
  'ApexHeron',
  'BraveOsprey',
  'PulseFinch',
  'BlazeGriffin',
  'MirageDragon',
  'PhantomStag',
  'NimbusSaber',
  'OrbitViper',

  // Creative & Whimsical Personas
  'SilverPuma',
  'GoldenSparrow',
  'CobaltBeaver',
  'RubyKangaroo',
  'EmeraldPenguin',
  'SapphireSeal',
  'CopperPelican',
  'TopazChameleon',
  'ObsidianCrow',
  'MarbleCrane',
  'OnyxPanther',
  'QuartzWalrus',
  'GarnetGull',
  'JadeFalcon',
  'BerylBadger',
  'CoralGazelle',
  'IndigoIbex',
  'ScarletSwallow',
  'AzureAlbatross',
  'TurquoiseTern',

  // Digital & Celestial Entities
  'BinaryBison',
  'VectorVulture',
  'QuantumQuail',
  'MatrixMongoose',
  'CircuitCanary',
  'LogicLemur',
  'SignalSalamander',
  'RouterRaccoon',
  'CipherCaribou',
  'BitBobcat',
  'ByteBuffalo',
  'PacketPorcupine',
  'KernelKite',
  'CacheCondor',
  'SensorStarling',
  'TensorToucan',
  'GlitchGibbon',
  'SyntaxSwift',
  'RelayRobin',
  'BeaconBunting',

  // Elemental & Nature Archetypes
  'ArcticAntelope',
  'BreezeBeetle',
  'CanyonCoyote',
  'DesertDingo',
  'EchoEgret',
  'ForestFox',
  'GlacierGannet',
  'HarborHare',
  'IslandIguana',
  'JungleJackal',
  'KestrelKite',
  'LagoonLoon',
  'MountainMarmot',
  'NorthernNewt',
  'OceanOctopus',
  'PrairieParrot',
  'QuarryQuokka',
  'RiverRaven',
  'SummitSparrow',
  'TundraTiger',
  'ValleyVole',
  'WildwoodWolf',
  'ZephyrZebra',
  'AuroraAardvark',
  'ThunderThrush',
  'BorealBear',
  'SunburstSeal',
  'MoonlitLynx',
  'StarlightStag',
  'TwilightToad',
]);

/**
 * Validates alias format, length, and injection safety.
 */
export function isValidAliasFormat(alias: string): { valid: boolean; error?: string } {
  if (!alias || typeof alias !== 'string') {
    return { valid: false, error: 'Alias is required.' };
  }

  const trimmed = alias.trim();

  if (trimmed.length < 3) {
    return { valid: false, error: 'Alias must be at least 3 characters long.' };
  }

  if (trimmed.length > 30) {
    return { valid: false, error: 'Alias cannot exceed 30 characters.' };
  }

  // Strict character set: Letters, numbers, underscores only
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
 * Returns `count` randomly sampled distinct aliases from the pool.
 * Attempts to avoid repeating aliases currently presented in `exclude`.
 */
export function getRandomAliasBatch(count = 3, exclude: string[] = []): string[] {
  const excludeSet = new Set(exclude);
  const eligible = SAFE_ALIAS_POOL.filter((alias) => !excludeSet.has(alias));

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
