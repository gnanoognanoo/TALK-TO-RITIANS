import React from 'react';
import { AvatarConfig } from '../../types/avatar';
import { AvatarRenderer } from './AvatarRenderer';

export interface AvatarPreviewProps {
  config: AvatarConfig;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showGlow?: boolean;
  className?: string;
  badge?: React.ReactNode;
}

const previewSizeClasses: Record<NonNullable<AvatarPreviewProps['size']>, { container: string; glow: string }> = {
  sm: { container: 'h-16 w-16 rounded-2xl', glow: 'blur-md' },
  md: { container: 'h-24 w-24 rounded-2xl', glow: 'blur-lg' },
  lg: { container: 'h-32 w-32 rounded-3xl', glow: 'blur-xl' },
  xl: { container: 'h-40 w-40 rounded-[28px]', glow: 'blur-2xl' },
  '2xl': { container: 'h-52 w-52 rounded-[36px]', glow: 'blur-3xl' },
};

export const AvatarPreview: React.FC<AvatarPreviewProps> = ({
  config,
  size = 'xl',
  showGlow = true,
  className = '',
  badge,
}) => {
  const styling = previewSizeClasses[size];

  return (
    <div className={`relative inline-flex flex-col items-center justify-center ${className}`}>
      {/* Dynamic Ambient Background Glow */}
      {showGlow && (
        <div
          className={`
            absolute inset-0 rounded-full opacity-40 transition-all duration-300 pointer-events-none ${styling.glow}
          `}
          style={{ backgroundColor: config.shirtColor || '#4F46E5' }}
          aria-hidden="true"
        />
      )}

      {/* Outer Border & Card Frame */}
      <div
        className={`
          relative overflow-hidden border-2 border-slate-700/70 shadow-2xl bg-slate-900
          transition-all duration-200 transform-gpu
          ${styling.container}
        `}
      >
        <AvatarRenderer config={config} className="h-full w-full object-cover" />

        {/* Live campus presence dot */}
        <span
          className="absolute bottom-2 right-2 h-3.5 w-3.5 rounded-full bg-emerald-400 ring-2 ring-slate-950 shadow-sm"
          title="Campus Ready"
        />
      </div>

      {/* Optional Custom Badge overlay */}
      {badge && <div className="mt-3">{badge}</div>}
    </div>
  );
};

export default AvatarPreview;
