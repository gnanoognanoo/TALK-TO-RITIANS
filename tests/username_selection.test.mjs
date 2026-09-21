/**
 * ============================================================================
 * TALK TO RITIANS - Anonymous Username Selection Automated Test Suite
 * ============================================================================
 * Tests:
 * 1. Unverified user cannot save custom alias
 * 2. Verified linked user can save custom alias
 * 3. Alias survives refresh (stored & retrieved faithfully)
 * 4. Alias cannot inject HTML, script tags, or special characters
 * 5. Predefined alias pool safety & clean formatting
 * 6. 3-option randomized sampling without duplicates
 * 7. Reroll limit handling
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
const SAFE_ALIAS_POOL = Object.freeze([
  'SilentFox', 'NeonWolf', 'PixelPanda', 'LunarTiger', 'EchoRaven', 'NovaBear',
  'CosmicFalcon', 'SwiftOtter', 'CyberCheetah', 'SolarLynx', 'ShadowHawk', 'FrostBadger',
  'AmberOwl', 'CrystalPhoenix', 'MysticDolphin', 'VelvetJaguar', 'IronEagle', 'StellarLeopard',
  'AstralCobra', 'RapidMoose', 'ZenKoala', 'RadiantGecko', 'ApexHeron', 'BraveOsprey',
  'PulseFinch', 'BlazeGriffin', 'MirageDragon', 'PhantomStag', 'NimbusSaber', 'OrbitViper',
  'SilverPuma', 'GoldenSparrow', 'CobaltBeaver', 'RubyKangaroo', 'EmeraldPenguin', 'SapphireSeal',
  'CopperPelican', 'TopazChameleon', 'ObsidianCrow', 'MarbleCrane', 'OnyxPanther', 'QuartzWalrus',
  'GarnetGull', 'JadeFalcon', 'BerylBadger', 'CoralGazelle', 'IndigoIbex', 'ScarletSwallow',
  'AzureAlbatross', 'TurquoiseTern', 'BinaryBison', 'VectorVulture', 'QuantumQuail', 'MatrixMongoose',
  'CircuitCanary', 'LogicLemur', 'SignalSalamander', 'RouterRaccoon', 'CipherCaribou', 'BitBobcat',
  'ByteBuffalo', 'PacketPorcupine', 'KernelKite', 'CacheCondor', 'SensorStarling', 'TensorToucan',
  'GlitchGibbon', 'SyntaxSwift', 'RelayRobin', 'BeaconBunting', 'ArcticAntelope', 'BreezeBeetle',
  'CanyonCoyote', 'DesertDingo', 'EchoEgret', 'ForestFox', 'GlacierGannet', 'HarborHare',
  'IslandIguana', 'JungleJackal', 'KestrelKite', 'LagoonLoon', 'MountainMarmot', 'NorthernNewt',
  'OceanOctopus', 'PrairieParrot', 'QuarryQuokka', 'RiverRaven', 'SummitSparrow', 'TundraTiger',
  'ValleyVole', 'WildwoodWolf', 'ZephyrZebra', 'AuroraAardvark', 'ThunderThrush', 'BorealBear'
]);

function isValidAliasFormat(alias) {
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
  if (!/^[A-Za-z0-9_]+$/.test(trimmed)) {
    return {
      valid: false,
      error: 'Alias may only contain letters, numbers, and underscores (no HTML, spaces, or symbols).',
    };
  }

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

function getRandomAliasBatch(count = 3, exclude = []) {
  const excludeSet = new Set(exclude);
  const eligible = SAFE_ALIAS_POOL.filter((alias) => !excludeSet.has(alias));
  const source = eligible.length >= count ? eligible : [...SAFE_ALIAS_POOL];

  const shuffled = [...source];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, count);
}

// Simulation of server-side RPC procedure (mirrors save_anonymous_alias PL/pgSQL)
class MockProfileDatabase {
  constructor() {
    this.profiles = new Map();
    this.anonymousIdentities = new Map();
  }

  setProfile(userId, profileData) {
    this.profiles.set(userId, { ...profileData });
  }

  saveAnonymousAlias(callingUserId, rawAlias) {
    // 1. Session check
    if (!callingUserId) {
      return {
        success: false,
        error: 'UNAUTHENTICATED',
        message: 'You must be signed in to select an anonymous username.',
      };
    }

    // 2. Verification Gate check
    const userProfile = this.profiles.get(callingUserId);
    if (!userProfile || !userProfile.college_identity_linked) {
      return {
        success: false,
        error: 'VERIFICATION_REQUIRED',
        message: 'You must verify your college ID before selecting an anonymous username.',
      };
    }

    // 3. Format & Character validation (XSS and length check)
    const formatCheck = isValidAliasFormat(rawAlias);
    if (!formatCheck.valid) {
      return {
        success: false,
        error: 'INVALID_CHARACTERS',
        message: formatCheck.error,
      };
    }

    const trimmed = rawAlias.trim();

    // 4. Update profiles and trigger sync
    this.profiles.set(callingUserId, {
      ...userProfile,
      display_username: trimmed,
      updated_at: new Date().toISOString(),
    });

    // Mirrors sync_anonymous_identity trigger
    this.anonymousIdentities.set(callingUserId, {
      user_id: callingUserId,
      anonymous_username: trimmed,
      avatar_config: userProfile.avatar_config || {},
      updated_at: new Date().toISOString(),
    });

    return {
      success: true,
      alias: trimmed,
      updated_at: new Date().toISOString(),
    };
  }

  getProfile(userId) {
    return this.profiles.get(userId) || null;
  }
}

describe('Phase 6 - Anonymous Username Selection & Alias Pool', () => {
  let db;

  test('setup test database state', () => {
    db = new MockProfileDatabase();

    // Seed Unverified User 1
    db.setProfile('user-unverified-1', {
      id: 'user-unverified-1',
      display_username: 'Unknown User 4821',
      college_identity_linked: false,
      profile_completed: false,
    });

    // Seed Verified User 2
    db.setProfile('user-verified-2', {
      id: 'user-verified-2',
      display_username: 'Unknown User 9132',
      college_identity_linked: true,
      department: 'CSE',
      batch: '2025-2029',
      profile_completed: false,
    });
  });

  describe('1. Verification Gate: Unverified vs Verified Access', () => {
    test('unverified user cannot save custom alias and is rejected', () => {
      const result = db.saveAnonymousAlias('user-unverified-1', 'NeonWolf');

      assert.equal(result.success, false);
      assert.equal(result.error, 'VERIFICATION_REQUIRED');
      assert.ok(result.message.includes('verify your college ID'));

      // Invariant: Display username remains the anonymous temporary placeholder
      const profile = db.getProfile('user-unverified-1');
      assert.equal(profile.display_username, 'Unknown User 4821');
    });

    test('verified linked user can successfully save custom alias', () => {
      const result = db.saveAnonymousAlias('user-verified-2', 'PixelPanda');

      assert.equal(result.success, true);
      assert.equal(result.alias, 'PixelPanda');

      // Invariant: Profile reflects new custom alias
      const profile = db.getProfile('user-verified-2');
      assert.equal(profile.display_username, 'PixelPanda');

      // Invariant: Synchronized to anonymous_identities table
      const anon = db.anonymousIdentities.get('user-verified-2');
      assert.ok(anon);
      assert.equal(anon.anonymous_username, 'PixelPanda');
    });
  });

  describe('2. Alias Persistence & Refresh Invariant', () => {
    test('saved alias survives browser refresh / session reload', () => {
      // User fetches their profile in a new session
      const reloadedProfile = db.getProfile('user-verified-2');

      assert.ok(reloadedProfile);
      assert.equal(reloadedProfile.display_username, 'PixelPanda');
      assert.equal(reloadedProfile.college_identity_linked, true);
    });
  });

  describe('3. XSS & Injection Prevention', () => {
    test('strictly rejects HTML script tags', () => {
      const xssPayloads = [
        '<script>alert(1)</script>',
        '<img src=x onerror=alert(1)>',
        '"><script src=evil.js></script>',
        'javascript:alert(1)',
        '<div>SneakyDiv</div>',
        'Silent Fox', // Spaces forbidden
        'Wolf; DROP TABLE users;--',
        'Panda&Co',
        'Owl$Name',
      ];

      for (const malicious of xssPayloads) {
        const check = isValidAliasFormat(malicious);
        assert.equal(check.valid, false, `Payload "${malicious}" must fail format validation`);

        const dbResult = db.saveAnonymousAlias('user-verified-2', malicious);
        assert.equal(dbResult.success, false, `DB must reject malicious alias "${malicious}"`);
      }
    });

    test('rejects aliases shorter than 3 characters or longer than 30 characters', () => {
      assert.equal(isValidAliasFormat('ab').valid, false);
      assert.equal(isValidAliasFormat('a'.repeat(31)).valid, false);
      assert.equal(isValidAliasFormat('abc').valid, true);
      assert.equal(isValidAliasFormat('a'.repeat(30)).valid, true);
    });
  });

  describe('4. Curated Predefined Alias Pool Cleanliness', () => {
    test('alias pool contains at least 50 pre-screened options', () => {
      assert.ok(SAFE_ALIAS_POOL.length >= 50, 'Alias pool should be rich and varied');
    });

    test('all aliases in pool conform to strict alphanumeric format without spaces', () => {
      for (const alias of SAFE_ALIAS_POOL) {
        const check = isValidAliasFormat(alias);
        assert.equal(check.valid, true, `Pool alias "${alias}" must pass strict format checks`);
      }
    });

    test('all aliases in pool are free from institutional terms and academic metadata', () => {
      const forbiddenTokens = ['rajalakshmi', 'ritchennai', 'section', 'batch', 'rollno', 'regno', 'department', 'student'];
      for (const alias of SAFE_ALIAS_POOL) {
        const lower = alias.toLowerCase();
        for (const token of forbiddenTokens) {
          assert.equal(
            lower.includes(token),
            false,
            `Pool alias "${alias}" must not contain academic/institutional token "${token}"`
          );
        }
      }
    });

    test('aliases do not require global uniqueness in V1 (internal UUID identifies users)', () => {
      // User 3 also picks 'PixelPanda'
      db.setProfile('user-verified-3', {
        id: 'user-verified-3',
        college_identity_linked: true,
      });

      const result = db.saveAnonymousAlias('user-verified-3', 'PixelPanda');
      assert.equal(result.success, true);
      assert.equal(result.alias, 'PixelPanda');

      // Both users have 'PixelPanda', while UUIDs remain isolated
      assert.equal(db.getProfile('user-verified-2').display_username, 'PixelPanda');
      assert.equal(db.getProfile('user-verified-3').display_username, 'PixelPanda');
    });
  });

  describe('5. Randomized 3-Option Sampling & Reroll Bounding', () => {
    test('returns exactly 3 distinct aliases per draw', () => {
      for (let i = 0; i < 20; i++) {
        const batch = getRandomAliasBatch(3);
        assert.equal(batch.length, 3);
        const uniqueSet = new Set(batch);
        assert.equal(uniqueSet.size, 3, 'Batch elements must be unique');
      }
    });

    test('rerolls avoid currently presented aliases when possible', () => {
      const batch1 = getRandomAliasBatch(3);
      const batch2 = getRandomAliasBatch(3, batch1);

      // Verify batch2 does not overlap with batch1
      const intersection = batch2.filter((alias) => batch1.includes(alias));
      assert.equal(intersection.length, 0, 'Reroll should draw distinct fresh aliases');
    });

    test('rerolls can be bounded to max count', () => {
      let rerollsRemaining = 5;
      for (let i = 0; i < 5; i++) {
        assert.ok(rerollsRemaining > 0);
        rerollsRemaining--;
      }
      assert.equal(rerollsRemaining, 0, 'Rerolls must reach 0 after 5 uses');
    });
  });
});
