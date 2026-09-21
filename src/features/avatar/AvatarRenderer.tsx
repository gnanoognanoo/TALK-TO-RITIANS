import React from 'react';
import { AvatarConfig, DEFAULT_AVATAR_CONFIG } from '../../types/avatar';
import {
  AvatarBackground,
  AvatarBody,
  AvatarHead,
  AvatarFacialFeatures,
  AvatarMouth,
  AvatarHair,
  AvatarAccessory,
} from './avatarElements';

export interface AvatarRendererProps extends React.SVGAttributes<SVGSVGElement> {
  config?: Partial<AvatarConfig> | Record<string, unknown> | null;
  size?: number | string;
  className?: string;
}

/**
 * ============================================================================
 * TALK TO RITIANS - Scalable Modular Avatar SVG Renderer
 * ============================================================================
 * Deterministically renders layered vector SVG based on an AvatarConfig.
 * High performance, crisp on all resolutions, zero raster images.
 */
export const AvatarRenderer: React.FC<AvatarRendererProps> = ({
  config,
  size = '100%',
  className = '',
  ...svgProps
}) => {
  // Merge supplied properties with safe default fallback
  const merged: AvatarConfig = {
    face: (config?.face as AvatarConfig['face']) || DEFAULT_AVATAR_CONFIG.face,
    skin: (config?.skin as string) || DEFAULT_AVATAR_CONFIG.skin,
    hair: (config?.hair as AvatarConfig['hair']) || DEFAULT_AVATAR_CONFIG.hair,
    hairColor: (config?.hairColor as string) || DEFAULT_AVATAR_CONFIG.hairColor,
    eyes: (config?.eyes as AvatarConfig['eyes']) || DEFAULT_AVATAR_CONFIG.eyes,
    eyebrows: (config?.eyebrows as AvatarConfig['eyebrows']) || DEFAULT_AVATAR_CONFIG.eyebrows,
    mouth: (config?.mouth as AvatarConfig['mouth']) || DEFAULT_AVATAR_CONFIG.mouth,
    shirt: (config?.shirt as AvatarConfig['shirt']) || DEFAULT_AVATAR_CONFIG.shirt,
    shirtColor: (config?.shirtColor as string) || DEFAULT_AVATAR_CONFIG.shirtColor,
    accessory: (config?.accessory as AvatarConfig['accessory']) || DEFAULT_AVATAR_CONFIG.accessory,
    background: (config?.background as AvatarConfig['background']) || DEFAULT_AVATAR_CONFIG.background,
  };

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`select-none overflow-hidden ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Modular student avatar"
      {...svgProps}
    >
      {/* 1. Background Scene */}
      <AvatarBackground theme={merged.background} />

      {/* 2. Neck, Torso & Shirt */}
      <AvatarBody
        skin={merged.skin}
        shirt={merged.shirt}
        shirtColor={merged.shirtColor}
      />

      {/* 3. Head & Facial Contour */}
      <AvatarHead
        face={merged.face}
        skin={merged.skin}
      />

      {/* 4. Eyebrows & Eyes */}
      <AvatarFacialFeatures
        eyes={merged.eyes}
        eyebrows={merged.eyebrows}
        hairColor={merged.hairColor}
      />

      {/* 5. Mouth Expression */}
      <AvatarMouth
        mouth={merged.mouth}
      />

      {/* 6. Hair Style & Color */}
      <AvatarHair
        hair={merged.hair}
        hairColor={merged.hairColor}
      />

      {/* 7. Accessories */}
      <AvatarAccessory
        accessory={merged.accessory}
      />
    </svg>
  );
};

export default AvatarRenderer;
