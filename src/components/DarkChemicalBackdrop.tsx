import React from 'react';

/**
 * DarkChemicalBackdrop
 * Renders faint decorative chemistry notation (C10, H15, N, 149.24) and soft green volumetric atmosphere.
 * Active ONLY in dark mode.
 * Completely hidden in light mode.
 * Pointer-events none, zero impact on interaction and readability.
 */
export const DarkChemicalBackdrop: React.FC = () => {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none select-none overflow-hidden z-0 hidden dark:block"
    >
      {/* Layer 1: Soft Volumetric Green Glows */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 650px 450px at 12% 18%, rgba(56, 85, 40, 0.075) 0%, transparent 70%),
            radial-gradient(ellipse 700px 500px at 88% 22%, rgba(45, 75, 32, 0.065) 0%, transparent 70%),
            radial-gradient(ellipse 850px 550px at 50% 92%, rgba(30, 52, 24, 0.07) 0%, transparent 75%)
          `,
        }}
      />

      {/* Layer 2: Subtle Vignette Frame */}
      <div
        className="absolute inset-0"
        style={{
          boxShadow: 'inset 0 0 160px rgba(3, 6, 4, 0.85)',
        }}
      />

      {/* Layer 3: Faint Chemistry Notation Motifs (C10, H15, N, 149.24) */}
      <div className="absolute inset-0 chemical-motifs-container">
        {/* Top-Right Cluster */}
        <div className="absolute top-16 right-12 sm:right-28 text-right opacity-[0.035] filter blur-[0.3px]">
          <span className="font-serif text-5xl sm:text-6xl text-[#9CB65F] tracking-tight">
            C<sub>10</sub> H<sub>15</sub> N
          </span>
        </div>

        <div className="absolute top-32 right-24 sm:right-44 opacity-[0.045] filter blur-[0.2px]">
          <span className="font-mono text-xs sm:text-sm text-[#A8C96A] tracking-wider">
            149.24
          </span>
        </div>

        <div className="absolute top-24 right-16 sm:right-32 opacity-[0.04] filter blur-[0.4px]">
          <span className="font-serif text-7xl sm:text-8xl font-bold text-[#8FAF56]">
            N
          </span>
        </div>

        <div className="absolute top-52 right-8 sm:right-20 opacity-[0.03] filter blur-[0.3px]">
          <span className="font-serif text-4xl sm:text-5xl text-[#9CB65F]">
            H<sub>15</sub>
          </span>
        </div>

        <div className="absolute top-72 right-28 sm:right-52 opacity-[0.025] filter blur-[0.4px]">
          <span className="font-serif text-5xl sm:text-6xl text-[#8FAF56]">
            C<sub>10</sub>
          </span>
        </div>

        {/* Center-Left Subtle Accent */}
        <div className="absolute top-1/2 left-8 sm:left-20 -translate-y-1/2 opacity-[0.025] filter blur-[0.4px]">
          <span className="font-serif text-4xl sm:text-5xl text-[#9CB65F]">
            H<sub>15</sub>
          </span>
        </div>

        {/* Bottom-Left Cluster */}
        <div className="absolute bottom-24 left-10 sm:left-24 opacity-[0.03] filter blur-[0.3px]">
          <span className="font-serif text-4xl sm:text-5xl text-[#8FAF56] tracking-tight">
            C<sub>10</sub>
          </span>
        </div>

        <div className="absolute bottom-16 left-16 sm:left-36 opacity-[0.04] filter blur-[0.2px]">
          <span className="font-mono text-xs sm:text-sm text-[#A8C96A] tracking-widest">
            149.24
          </span>
        </div>

        <div className="absolute bottom-32 left-28 sm:left-52 opacity-[0.025] filter blur-[0.5px]">
          <span className="font-serif text-5xl sm:text-6xl text-[#9CB65F]">
            N
          </span>
        </div>
      </div>
    </div>
  );
};

export default DarkChemicalBackdrop;
