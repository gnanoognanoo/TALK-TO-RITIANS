import React from 'react';
import { AvatarConfig, isValidAvatarConfig } from '../types';
import { AvatarRenderer } from '../features/avatar';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export type PresenceStatus = 'online' | 'matching' | 'offline' | 'none';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: AvatarSize;
  src?: string;
  avatarConfig?: AvatarConfig | Record<string, unknown> | null;
  alt?: string;
  initials?: string;
  icon?: React.ReactNode;
  presence?: PresenceStatus;
  shape?: 'rounded' | 'circle';
}

const sizeClasses: Record<AvatarSize, { box: string; text: string; dot: string; dotPos: string }> = {
  xs: { box: 'h-6 w-6 text-[10px]', text: 'text-[10px]', dot: 'h-1.5 w-1.5', dotPos: '-top-0.5 -right-0.5' },
  sm: { box: 'h-8 w-8 text-xs', text: 'text-xs', dot: 'h-2 w-2', dotPos: '-top-0.5 -right-0.5' },
  md: { box: 'h-10 w-10 text-sm', text: 'text-sm font-semibold', dot: 'h-2.5 w-2.5', dotPos: '-top-0.5 -right-0.5' },
  lg: { box: 'h-14 w-14 text-lg', text: 'text-lg font-bold', dot: 'h-3.5 w-3.5', dotPos: 'top-0 right-0' },
  xl: { box: 'h-20 w-20 text-2xl', text: 'text-2xl font-bold', dot: 'h-4 w-4', dotPos: 'top-0.5 right-0.5' },
  '2xl': { box: 'h-28 w-28 text-4xl', text: 'text-4xl font-extrabold', dot: 'h-5 w-5', dotPos: 'top-1 right-1' },
};

const presenceClasses: Record<Exclude<PresenceStatus, 'none'>, string> = {
  online: 'bg-emerald-400 ring-2 ring-slate-950',
  matching: 'bg-amber-400 ring-2 ring-slate-950 animate-pulse',
  offline: 'bg-slate-500 ring-2 ring-slate-950',
};

export const Avatar: React.FC<AvatarProps> = ({
  size = 'md',
  src,
  avatarConfig,
  alt = 'Avatar',
  initials,
  icon,
  presence = 'none',
  shape = 'rounded',
  className = '',
  ...props
}) => {
  const config = sizeClasses[size];
  const radius = shape === 'circle' ? 'rounded-full' : 'rounded-2xl';
  const hasModularConfig = Boolean(
    avatarConfig &&
      typeof avatarConfig === 'object' &&
      ('face' in avatarConfig || 'skin' in avatarConfig || isValidAvatarConfig(avatarConfig))
  );

  return (
    <div
      className={`
        relative inline-flex items-center justify-center shrink-0 select-none overflow-hidden
        bg-gradient-to-br from-brand-600/20 via-indigo-600/20 to-purple-600/20
        border border-brand-500/30 text-brand-300 shadow-inner
        ${radius} ${config.box} ${className}
      `.trim()}
      role="img"
      aria-label={alt}
      {...props}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          className={`h-full w-full object-cover ${radius}`}
        />
      ) : hasModularConfig ? (
        <AvatarRenderer
          config={avatarConfig}
          className={`h-full w-full object-cover ${radius}`}
        />
      ) : icon ? (
        <span className="flex items-center justify-center">{icon}</span>
      ) : (
        <span className={`${config.text} uppercase tracking-wider`}>
          {initials || 'RIT'}
        </span>
      )}

      {presence !== 'none' && (
        <span
          className={`
            absolute ${config.dotPos} rounded-full ${config.dot} ${presenceClasses[presence]}
          `.trim()}
          aria-label={`Status: ${presence}`}
        />
      )}
    </div>
  );
};

export default Avatar;
