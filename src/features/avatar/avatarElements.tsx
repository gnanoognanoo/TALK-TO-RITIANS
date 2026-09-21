import React from 'react';
import {
  FaceShape,
  HairStyle,
  EyeExpression,
  EyebrowStyle,
  MouthExpression,
  ShirtStyle,
  AccessoryType,
  BackgroundTheme,
} from '../../types/avatar';

/**
 * ============================================================================
 * TALK TO RITIANS - Layered Avatar Vector Elements (100x100 viewBox)
 * ============================================================================
 * Original scalable vector graphics designed exclusively for Talk to RITians.
 * MIT Licensed. Free of proprietary or third-party assets.
 */

/* ----------------------------------------------------------------------------
 * 1. BACKGROUND GRADIENTS & SHAPES
 * ---------------------------------------------------------------------------- */
export const AvatarBackground: React.FC<{ theme: BackgroundTheme }> = ({ theme }) => {
  const gradientDefs: Record<BackgroundTheme, { from: string; to: string; mid?: string }> = {
    indigo: { from: '#4F46E5', to: '#1E1B4B' },
    emerald: { from: '#059669', to: '#064E3B' },
    sunset: { from: '#F59E0B', mid: '#DC2626', to: '#4C0519' },
    midnight: { from: '#334155', to: '#090D16' },
    rose: { from: '#F43F5E', to: '#4A044E' },
    ocean: { from: '#06B6D4', to: '#172554' },
    amber: { from: '#F59E0B', to: '#451A03' },
  };

  const g = gradientDefs[theme] || gradientDefs.indigo;
  const gradId = `bg-grad-${theme}`;

  return (
    <g id="layer-background">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={g.from} />
          {g.mid && <stop offset="50%" stopColor={g.mid} />}
          <stop offset="100%" stopColor={g.to} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="22" fill={`url(#${gradId})`} />
    </g>
  );
};

/* ----------------------------------------------------------------------------
 * 2. BODY, NECK & SHIRT
 * ---------------------------------------------------------------------------- */
export const AvatarBody: React.FC<{
  skin: string;
  shirt: ShirtStyle;
  shirtColor: string;
}> = ({ skin, shirt, shirtColor }) => {
  return (
    <g id="layer-body">
      {/* Neck */}
      <polygon points="42,56 58,56 61,77 39,77" fill={skin} />
      {/* Neck shadow under chin */}
      <path d="M 42 56 Q 50 63 58 56 L 59 62 Q 50 67 41 62 Z" fill="rgba(0,0,0,0.14)" />

      {/* Shirt / Shoulders based on style */}
      {shirt === 'crew' && (
        <g id="shirt-crew">
          {/* Main torso */}
          <path
            d="M 16 100 L 22 75 Q 36 71 50 71 Q 64 71 78 75 L 84 100 Z"
            fill={shirtColor}
          />
          {/* Crewneck collar rib */}
          <path
            d="M 39 72 Q 50 82 61 72"
            fill="none"
            stroke="rgba(255,255,255,0.3)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M 40 74 Q 50 83 60 74"
            fill="none"
            stroke="rgba(0,0,0,0.15)"
            strokeWidth="1.2"
          />
        </g>
      )}

      {shirt === 'hoodie' && (
        <g id="shirt-hoodie">
          <path
            d="M 14 100 L 20 73 Q 35 69 50 69 Q 65 69 80 73 L 86 100 Z"
            fill={shirtColor}
          />
          {/* Bulky hoodie collar ring */}
          <path
            d="M 35 70 Q 50 85 65 70 Q 50 80 35 70 Z"
            fill="rgba(0,0,0,0.18)"
          />
          <path
            d="M 34 71 Q 50 84 66 71"
            fill="none"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          {/* Drawstrings */}
          <line x1="46" y1="78" x2="46" y2="92" stroke="#E2E8F0" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="46" cy="93" r="1.2" fill="#94A3B8" />
          <line x1="54" y1="78" x2="54" y2="90" stroke="#E2E8F0" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="54" cy="91" r="1.2" fill="#94A3B8" />
        </g>
      )}

      {shirt === 'collar' && (
        <g id="shirt-collar">
          <path
            d="M 16 100 L 22 75 Q 36 71 50 71 Q 64 71 78 75 L 84 100 Z"
            fill={shirtColor}
          />
          {/* Collars */}
          <polygon points="40,71 50,81 48,84 36,74" fill="#FFFFFF" opacity="0.95" />
          <polygon points="60,71 50,81 52,84 64,74" fill="#E2E8F0" opacity="0.95" />
          {/* Placket & Button */}
          <line x1="50" y1="81" x2="50" y2="96" stroke="rgba(0,0,0,0.2)" strokeWidth="1.5" />
          <circle cx="50" cy="87" r="1.2" fill="#FFFFFF" />
          <circle cx="50" cy="93" r="1.2" fill="#FFFFFF" />
        </g>
      )}

      {shirt === 'vneck' && (
        <g id="shirt-vneck">
          <path
            d="M 16 100 L 22 75 Q 36 71 50 71 Q 64 71 78 75 L 84 100 Z"
            fill={shirtColor}
          />
          {/* V-Cutout showing skin */}
          <polygon points="42,72 50,84 58,72" fill={skin} />
          <path
            d="M 42 72 L 50 84 L 58 72"
            fill="none"
            stroke="rgba(0,0,0,0.18)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </g>
      )}
    </g>
  );
};

/* ----------------------------------------------------------------------------
 * 3. HEAD & FACE SHAPE
 * ---------------------------------------------------------------------------- */
export const AvatarHead: React.FC<{
  face: FaceShape;
  skin: string;
}> = ({ face, skin }) => {
  return (
    <g id="layer-head">
      {/* Ears */}
      <g id="ears">
        <ellipse cx="26.5" cy="48" rx="3.5" ry="5.5" fill={skin} />
        <ellipse cx="26.5" cy="48" rx="1.8" ry="3.2" fill="rgba(0,0,0,0.08)" />
        <ellipse cx="73.5" cy="48" rx="3.5" ry="5.5" fill={skin} />
        <ellipse cx="73.5" cy="48" rx="1.8" ry="3.2" fill="rgba(0,0,0,0.08)" />
      </g>

      {/* Face Contour */}
      {face === 'round' && (
        <circle cx="50" cy="47" r="23" fill={skin} />
      )}

      {face === 'oval' && (
        <ellipse cx="50" cy="47" rx="21" ry="25" fill={skin} />
      )}

      {face === 'square' && (
        <rect x="29" y="24" width="42" height="46" rx="13" fill={skin} />
      )}

      {/* Subtle Rosy Cheeks */}
      <circle cx="36" cy="53" r="3.2" fill="#F43F5E" opacity="0.14" />
      <circle cx="64" cy="53" r="3.2" fill="#F43F5E" opacity="0.14" />

      {/* Minimal Nose */}
      <path
        d="M 50 48 Q 52 52 48 53"
        fill="none"
        stroke="rgba(0,0,0,0.22)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </g>
  );
};

/* ----------------------------------------------------------------------------
 * 4. EYEBROWS & EYES
 * ---------------------------------------------------------------------------- */
export const AvatarFacialFeatures: React.FC<{
  eyes: EyeExpression;
  eyebrows: EyebrowStyle;
  hairColor: string;
}> = ({ eyes, eyebrows, hairColor }) => {
  return (
    <g id="layer-eyes-brows">
      {/* Eyebrows */}
      <g id="eyebrows">
        {eyebrows === 'natural' && (
          <>
            <path d="M 36 38 Q 41 36 46 38" stroke={hairColor} strokeWidth="2.2" strokeLinecap="round" fill="none" />
            <path d="M 64 38 Q 59 36 54 38" stroke={hairColor} strokeWidth="2.2" strokeLinecap="round" fill="none" />
          </>
        )}
        {eyebrows === 'raised' && (
          <>
            <path d="M 36 36 Q 41 33 46 37" stroke={hairColor} strokeWidth="2.2" strokeLinecap="round" fill="none" />
            <path d="M 64 36 Q 59 33 54 37" stroke={hairColor} strokeWidth="2.2" strokeLinecap="round" fill="none" />
          </>
        )}
        {eyebrows === 'flat' && (
          <>
            <line x1="36" y1="38" x2="46" y2="38" stroke={hairColor} strokeWidth="2.2" strokeLinecap="round" />
            <line x1="54" y1="38" x2="64" y2="38" stroke={hairColor} strokeWidth="2.2" strokeLinecap="round" />
          </>
        )}
        {eyebrows === 'curved' && (
          <>
            <path d="M 35 39 Q 41 34 46 39" stroke={hairColor} strokeWidth="2.4" strokeLinecap="round" fill="none" />
            <path d="M 65 39 Q 59 34 54 39" stroke={hairColor} strokeWidth="2.4" strokeLinecap="round" fill="none" />
          </>
        )}
      </g>

      {/* Eyes */}
      <g id="eyes">
        {eyes === 'normal' && (
          <>
            <circle cx="41" cy="46" r="3.4" fill="#0F172A" />
            <circle cx="39.8" cy="44.8" r="1.1" fill="#FFFFFF" />
            <circle cx="59" cy="46" r="3.4" fill="#0F172A" />
            <circle cx="57.8" cy="44.8" r="1.1" fill="#FFFFFF" />
          </>
        )}

        {eyes === 'happy' && (
          <>
            <path d="M 37 47 Q 41 42 45 47" stroke="#0F172A" strokeWidth="2.4" strokeLinecap="round" fill="none" />
            <path d="M 55 47 Q 59 42 63 47" stroke="#0F172A" strokeWidth="2.4" strokeLinecap="round" fill="none" />
          </>
        )}

        {eyes === 'wink' && (
          <>
            {/* Playful wink on left eye */}
            <path d="M 37 46 Q 41 42 45 46" stroke="#0F172A" strokeWidth="2.4" strokeLinecap="round" fill="none" />
            {/* Open right eye with extra twinkle */}
            <circle cx="59" cy="46" r="3.5" fill="#0F172A" />
            <circle cx="57.8" cy="44.8" r="1.3" fill="#FFFFFF" />
            <polygon points="34,44 35,46 37,46 35.5,47.5 36,49.5 34,48 32,49.5 32.5,47.5 31,46 33,46" fill="#F59E0B" />
          </>
        )}

        {eyes === 'wide' && (
          <>
            <circle cx="41" cy="46" r="4.5" fill="#FFFFFF" stroke="#0F172A" strokeWidth="1.2" />
            <circle cx="41" cy="46" r="2.8" fill="#0F172A" />
            <circle cx="39.8" cy="44.8" r="1" fill="#FFFFFF" />

            <circle cx="59" cy="46" r="4.5" fill="#FFFFFF" stroke="#0F172A" strokeWidth="1.2" />
            <circle cx="59" cy="46" r="2.8" fill="#0F172A" />
            <circle cx="57.8" cy="44.8" r="1" fill="#FFFFFF" />
          </>
        )}

        {eyes === 'focused' && (
          <>
            <ellipse cx="41" cy="46" rx="3.8" ry="2.6" fill="#0F172A" />
            <circle cx="40" cy="45.2" r="0.9" fill="#FFFFFF" />
            <ellipse cx="59" cy="46" rx="3.8" ry="2.6" fill="#0F172A" />
            <circle cx="58" cy="45.2" r="0.9" fill="#FFFFFF" />
          </>
        )}
      </g>
    </g>
  );
};

/* ----------------------------------------------------------------------------
 * 5. MOUTH EXPRESSIONS
 * ---------------------------------------------------------------------------- */
export const AvatarMouth: React.FC<{
  mouth: MouthExpression;
}> = ({ mouth }) => {
  return (
    <g id="layer-mouth">
      {mouth === 'smile' && (
        <path
          d="M 44 59 Q 50 65 56 59"
          stroke="#881337"
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
        />
      )}

      {mouth === 'grin' && (
        <g id="mouth-grin">
          <path d="M 43 58 Q 50 67 57 58 Z" fill="#881337" />
          <path d="M 44.5 58 Q 50 62 55.5 58 Z" fill="#FFFFFF" />
        </g>
      )}

      {mouth === 'laugh' && (
        <g id="mouth-laugh">
          <path d="M 42 58 Q 50 70 58 58 Z" fill="#4C0519" />
          <path d="M 44 58 Q 50 62 56 58 Z" fill="#FFFFFF" />
          <ellipse cx="50" cy="65.5" rx="3.4" ry="2.2" fill="#F43F5E" />
        </g>
      )}

      {mouth === 'neutral' && (
        <line
          x1="45"
          y1="60"
          x2="55"
          y2="60"
          stroke="#881337"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}

      {mouth === 'smirk' && (
        <path
          d="M 45 61 Q 50 62 56 57"
          stroke="#881337"
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
        />
      )}
    </g>
  );
};

/* ----------------------------------------------------------------------------
 * 6. HAIRSTYLES
 * ---------------------------------------------------------------------------- */
export const AvatarHair: React.FC<{
  hair: HairStyle;
  hairColor: string;
}> = ({ hair, hairColor }) => {
  if (hair === 'bald') {
    return (
      <g id="hair-bald">
        {/* Subtle shine highlight on bald scalp */}
        <path d="M 42 27 Q 50 25 58 27" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round" fill="none" />
      </g>
    );
  }

  return (
    <g id="layer-hair" fill={hairColor}>
      {hair === 'short' && (
        <path
          d="M 27 38 C 26 23, 40 18, 50 18 C 62 18, 74 23, 73 38 C 70 31, 63 27, 50 27 C 38 27, 30 33, 27 38 Z"
        />
      )}

      {hair === 'curls' && (
        <g id="hair-curls">
          <circle cx="33" cy="28" r="8" />
          <circle cx="44" cy="22" r="8.5" />
          <circle cx="56" cy="22" r="8.5" />
          <circle cx="67" cy="28" r="8" />
          <circle cx="28" cy="36" r="6" />
          <circle cx="72" cy="36" r="6" />
          <circle cx="50" cy="26" r="8" />
        </g>
      )}

      {hair === 'bob' && (
        <path
          d="M 25 40 C 23 22, 40 17, 50 17 C 60 17, 77 22, 75 40 C 76 52, 73 59, 70 60 C 67 52, 69 41, 67 36 C 60 27, 40 27, 33 36 C 31 41, 33 52, 30 60 C 27 59, 24 52, 25 40 Z"
        />
      )}

      {hair === 'buzz' && (
        <path
          d="M 28 35 C 28 24, 38 20, 50 20 C 62 20, 72 24, 72 35 C 68 28, 60 25, 50 25 C 40 25, 32 28, 28 35 Z"
          opacity="0.9"
        />
      )}

      {hair === 'wavy' && (
        <path
          d="M 26 39 C 24 22, 38 16, 50 16 C 62 16, 76 22, 74 39 C 77 48, 74 58, 71 63 C 67 55, 68 45, 64 36 C 58 26, 42 26, 36 36 C 32 45, 33 55, 29 63 C 26 58, 23 48, 26 39 Z"
        />
      )}

      {hair === 'afro' && (
        <ellipse cx="50" cy="38" rx="27" ry="24" />
      )}
    </g>
  );
};

/* ----------------------------------------------------------------------------
 * 7. ACCESSORIES
 * ---------------------------------------------------------------------------- */
export const AvatarAccessory: React.FC<{
  accessory: AccessoryType;
}> = ({ accessory }) => {
  if (accessory === 'none') return null;

  return (
    <g id="layer-accessory">
      {accessory === 'glasses' && (
        <g id="acc-glasses">
          {/* Left Frame */}
          <rect x="34" y="41" width="13" height="10" rx="3.5" fill="rgba(255,255,255,0.1)" stroke="#0F172A" strokeWidth="1.8" />
          {/* Right Frame */}
          <rect x="53" y="41" width="13" height="10" rx="3.5" fill="rgba(255,255,255,0.1)" stroke="#0F172A" strokeWidth="1.8" />
          {/* Bridge */}
          <line x1="47" y1="45" x2="53" y2="45" stroke="#0F172A" strokeWidth="1.8" strokeLinecap="round" />
          {/* Temple arms */}
          <line x1="34" y1="44" x2="26" y2="43" stroke="#0F172A" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="66" y1="44" x2="74" y2="43" stroke="#0F172A" strokeWidth="1.6" strokeLinecap="round" />
          {/* Lens sheen */}
          <line x1="36" y1="49" x2="43" y2="43" stroke="rgba(255,255,255,0.55)" strokeWidth="1" strokeLinecap="round" />
          <line x1="55" y1="49" x2="62" y2="43" stroke="rgba(255,255,255,0.55)" strokeWidth="1" strokeLinecap="round" />
        </g>
      )}

      {accessory === 'sunglasses' && (
        <g id="acc-sunglasses">
          <polygon points="33,42 47,42 45,52 35,52" fill="#090D16" stroke="#020617" strokeWidth="1.6" />
          <polygon points="53,42 67,42 65,52 55,52" fill="#090D16" stroke="#020617" strokeWidth="1.6" />
          <line x1="47" y1="43" x2="53" y2="43" stroke="#020617" strokeWidth="2" />
          <line x1="33" y1="43" x2="26" y2="43" stroke="#020617" strokeWidth="1.6" />
          <line x1="67" y1="43" x2="74" y2="43" stroke="#020617" strokeWidth="1.6" />
          {/* Mirrored diagonal reflection */}
          <line x1="36" y1="50" x2="44" y2="43" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" strokeLinecap="round" />
          <line x1="56" y1="50" x2="64" y2="43" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" strokeLinecap="round" />
        </g>
      )}

      {accessory === 'headphones' && (
        <g id="acc-headphones">
          {/* Headband arch */}
          <path
            d="M 23 48 C 23 18, 77 18, 77 48"
            fill="none"
            stroke="#334155"
            strokeWidth="3.6"
            strokeLinecap="round"
          />
          {/* Left Ear Cushion */}
          <rect x="20" y="41" width="6" height="15" rx="3" fill="#0F172A" />
          <rect x="23" y="43" width="3" height="11" rx="1.5" fill="#4F46E5" />
          {/* Right Ear Cushion */}
          <rect x="74" y="41" width="6" height="15" rx="3" fill="#0F172A" />
          <rect x="74" y="43" width="3" height="11" rx="1.5" fill="#4F46E5" />
        </g>
      )}

      {accessory === 'beanie' && (
        <g id="acc-beanie">
          {/* Pom pom */}
          <circle cx="50" cy="14" r="4.5" fill="#F8FAFC" />
          {/* Main Beanie Body */}
          <path
            d="M 25 34 C 25 18, 75 18, 75 34 Z"
            fill="#3B82F6"
          />
          {/* Folded rim with ribs */}
          <rect x="23" y="32" width="54" height="7" rx="3.5" fill="#1D4ED8" />
          <line x1="32" y1="33" x2="32" y2="38" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
          <line x1="41" y1="33" x2="41" y2="38" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
          <line x1="50" y1="33" x2="50" y2="38" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
          <line x1="59" y1="33" x2="59" y2="38" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
          <line x1="68" y1="33" x2="68" y2="38" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
        </g>
      )}

      {accessory === 'badge' && (
        <g id="acc-badge">
          {/* Campus RIT Lapel Shield Badge on left chest */}
          <polygon points="30,83 36,83 36,89 33,92 30,89" fill="#F59E0B" stroke="#B45309" strokeWidth="0.8" />
          <text x="33" y="88" fontSize="4" fontWeight="bold" textAnchor="middle" fill="#78350F" fontFamily="sans-serif">
            RIT
          </text>
        </g>
      )}
    </g>
  );
};
