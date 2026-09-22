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

const previewSizeClasses: Record<NonNullable<AvatarPreviewProps['size']>, { container: string }> = {
  sm: { container: 'h-16 w-16 rounded-2xl' },
  md: { container: 'h-24 w-24 rounded-2xl' },
  lg: { container: 'h-32 w-32 rounded-3xl' },
  xl: { container: 'h-44 w-44 rounded-[28px]' },
  '2xl': { container: 'h-52 w-52 rounded-[36px]' },
};

export const AvatarPreview: React.FC<AvatarPreviewProps> = ({
  config,
  size = 'xl',
  className = '',
  badge,
}) => {
  const styling = previewSizeClasses[size];

  return (
    <div className={`relative inline-flex flex-col items-center justify-center ${className}`}>
      {/* Outer Border & Clean Card Frame */}
      <div
        className={`
          relative overflow-hidden border-2 border-gray-200 shadow-card bg-white
          transition-all duration-200
          ${styling.container}
        `}
      >
        <AvatarRenderer config={config} className="h-full w-full object-cover" />

        {/* Live campus presence dot */}
        <span
          className="absolute bottom-2.5 right-2.5 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-white shadow-sm"
          title="Campus Ready"
        />
      </div>

      {/* Optional Custom Badge overlay */}
      {badge && <div className="mt-3">{badge}</div>}
    </div>
  );
};

export default AvatarPreview;
