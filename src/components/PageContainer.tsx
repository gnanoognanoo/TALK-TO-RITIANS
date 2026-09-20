import React from 'react';

export type ContainerMaxWidth = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';

export interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  maxWidth?: ContainerMaxWidth;
  children: React.ReactNode;
}

const maxWidthClasses: Record<ContainerMaxWidth, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
  '2xl': 'max-w-7xl',
  full: 'max-w-full',
};

export const PageContainer: React.FC<PageContainerProps> = ({
  maxWidth = 'xl',
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`
        w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10
        ${maxWidthClasses[maxWidth]} ${className}
      `.trim()}
      {...props}
    >
      {children}
    </div>
  );
};

export default PageContainer;
