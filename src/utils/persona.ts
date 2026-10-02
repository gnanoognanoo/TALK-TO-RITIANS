/**
 * ============================================================================
 * TALK TO RITIANS - Anonymous Persona Utilities
 * ============================================================================
 * Centralized logic for deriving effective anonymous persona.
 *
 * EFFECTIVE PERSONA RULE:
 * A custom anonymous persona is allowed ONLY when:
 * profiles.college_identity_linked = true
 *
 * If false:
 * effective username: Unknown User ####
 * effective avatar: DEFAULT_AVATAR_CONFIG
 *
 * Saved personas remain stored privately, but are NEVER served or displayed
 * while unverified.
 */

export interface AvatarConfig {
  face: string;
  skin: string;
  hair: string;
  hairColor: string;
  eyes: string;
  eyebrows: string;
  mouth: string;
  shirt: string;
  shirtColor: string;
  accessory: string;
  background: string;
  [key: string]: unknown;
}

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

export function isValidAvatarConfig(config: unknown): config is AvatarConfig {
  if (!config || typeof config !== 'object') return false;
  const c = config as Record<string, unknown>;
  return Boolean(
    c.face &&
      c.skin &&
      c.hair &&
      c.hairColor &&
      c.eyes &&
      c.eyebrows &&
      c.mouth &&
      c.shirt &&
      c.shirtColor &&
      c.accessory !== undefined &&
      c.background
  );
}

export interface PersonaProfileInput {
  id?: string | null;
  display_username?: string | null;
  avatar_config?: unknown;
  college_identity_linked?: boolean | null;
  ever_verified_identity?: boolean | null;
  first_verified_at?: string | null;
  name?: string | null;
  full_name?: string | null;
}

export interface EffectivePersona {
  displayUsername: string;
  avatarConfig: AvatarConfig;
  isVerified: boolean;
  initials: string;
}

/**
 * Deterministically computes an "Unknown User ####" placeholder from a UUID.
 * Mirrors the server-side abs(hashtext(v_user_id::text)) % 9000 + 1000 calculation.
 */
export function computeDeterministicUnknownUser(userId?: string | null): string {
  if (!userId) return 'Unknown User 4821';
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  const suffix = (Math.abs(hash) % 9000 + 1000).toString().padStart(4, '0');
  return `Unknown User ${suffix}`;
}

/**
 * Resolves the effective public anonymous persona for a profile.
 * When college_identity_linked is false, strictly suppresses any saved alias
 * or custom avatar and returns the deterministic Unknown User and default avatar.
 */
export function getEffectivePersona(
  profile: PersonaProfileInput | null | undefined
): EffectivePersona {
  const isVerified = Boolean(profile?.college_identity_linked);
  const userId = profile?.id || '';

  if (isVerified) {
    const rawUsername = profile?.display_username?.trim();
    const displayUsername =
      rawUsername && !rawUsername.startsWith('Unknown User')
        ? rawUsername
        : rawUsername || computeDeterministicUnknownUser(userId);

    const avatarConfig =
      profile?.avatar_config && isValidAvatarConfig(profile.avatar_config)
        ? (profile.avatar_config as unknown as AvatarConfig)
        : DEFAULT_AVATAR_CONFIG;

    const initials = displayUsername
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    return {
      displayUsername,
      avatarConfig,
      isVerified: true,
      initials,
    };
  }

  // UNVERIFIED: Strictly enforce Unknown User #### and default avatar
  const displayUsername = computeDeterministicUnknownUser(userId);
  const initials = displayUsername
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return {
    displayUsername,
    avatarConfig: DEFAULT_AVATAR_CONFIG,
    isVerified: false,
    initials,
  };
}
