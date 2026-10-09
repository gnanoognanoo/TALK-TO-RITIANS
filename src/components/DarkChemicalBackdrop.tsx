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
      {/* Layer 1: Soft Liquid Depth Radial Gradients */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 650px 480px at 10% 15%, rgba(82, 108, 52, 0.08) 0%, transparent 68%),
            radial-gradient(ellipse 720px 520px at 90% 20%, rgba(141, 168, 82, 0.06) 0%, transparent 70%),
            radial-gradient(ellipse 850px 600px at 50% 95%, rgba(18, 30, 18, 0.5) 0%, transparent 80%)
          `,
        }}
      />

      {/* Layer 2: Subtle Layered Vignette Frame */}
      <div
        className="absolute inset-0"
        style={{
          boxShadow: 'inset 0 0 180px rgba(5, 8, 5, 0.9)',
        }}
      />

      {/* Layer 3: Faint Chemistry Notation Motifs (C10, H15, N, 149.24) - Very faint, partially cropped, non-interactive */}
      <div className="absolute inset-0 chemical-motifs-container">
        {/* Top-Right Cluster */}
        <div className="absolute top-12 -right-6 sm:right-16 text-right opacity-[0.03] filter blur-[0.4px]">
          <span className="font-serif text-6xl sm:text-7xl text-[#8DA852] tracking-tight">
            C<sub>10</sub>H<sub>15</sub>N
          </span>
        </div>

        <div className="absolute top-28 right-8 sm:right-32 opacity-[0.035] filter blur-[0.2px]">
          <span className="font-mono text-xs sm:text-sm text-[#A2BD63] tracking-widest">
            149.24
          </span>
        </div>

        <div className="absolute top-20 -right-4 sm:right-10 opacity-[0.025] filter blur-[0.6px]">
          <span className="font-serif text-8xl sm:text-9xl font-bold text-[#8DA852]">
            N
          </span>
        </div>

        {/* Center-Left Subtle Accent */}
        <div className="absolute top-1/2 -left-4 sm:left-12 -translate-y-1/2 opacity-[0.02] filter blur-[0.5px]">
          <span className="font-serif text-6xl sm:text-7xl text-[#A2BD63]">
            H<sub>15</sub>
          </span>
        </div>

        {/* Bottom-Left Cluster */}
        <div className="absolute -bottom-8 left-4 sm:left-16 opacity-[0.025] filter blur-[0.4px]">
          <span className="font-serif text-7xl sm:text-8xl text-[#8DA852] tracking-tight">
            C<sub>10</sub>
          </span>
        </div>

        <div className="absolute bottom-16 left-12 sm:left-28 opacity-[0.035] filter blur-[0.2px]">
          <span className="font-mono text-xs sm:text-sm text-[#A2BD63] tracking-widest">
            149.24
          </span>
        </div>
      </div>
    </div>
  );
};

export default DarkChemicalBackdrop;
