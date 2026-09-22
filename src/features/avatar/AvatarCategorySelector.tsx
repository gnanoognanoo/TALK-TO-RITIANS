import React, { useState } from 'react';
import {
  AvatarConfig,
  SKIN_TONES,
  HAIR_COLORS,
  SHIRT_COLORS,
  BACKGROUND_THEMES,
  FACE_OPTIONS,
  HAIR_OPTIONS,
  EYE_OPTIONS,
  EYEBROW_OPTIONS,
  MOUTH_OPTIONS,
  SHIRT_OPTIONS,
  ACCESSORY_OPTIONS,
} from '../../types/avatar';
import { User, Sparkles, Smile, Shirt, Glasses, Palette, Check } from 'lucide-react';

export interface AvatarCategorySelectorProps {
  config: AvatarConfig;
  onChange: (updated: AvatarConfig) => void;
}

type TabType = 'face' | 'hair' | 'expression' | 'outfit' | 'accessory' | 'background';

interface CategoryTab {
  id: TabType;
  label: string;
  icon: React.ReactNode;
}

const CATEGORY_TABS: CategoryTab[] = [
  { id: 'face', label: 'Face & Skin', icon: <User className="h-4 w-4" /> },
  { id: 'hair', label: 'Hair & Color', icon: <Sparkles className="h-4 w-4" /> },
  { id: 'expression', label: 'Expression', icon: <Smile className="h-4 w-4" /> },
  { id: 'outfit', label: 'Outfit', icon: <Shirt className="h-4 w-4" /> },
  { id: 'accessory', label: 'Accessory', icon: <Glasses className="h-4 w-4" /> },
  { id: 'background', label: 'Backdrop', icon: <Palette className="h-4 w-4" /> },
];

export const AvatarCategorySelector: React.FC<AvatarCategorySelectorProps> = ({
  config,
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('face');

  const updateProp = <K extends keyof AvatarConfig>(key: K, value: AvatarConfig[K]) => {
    onChange({
      ...config,
      [key]: value,
    });
  };

  return (
    <div className="space-y-6">
      {/* Category Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none border-b border-gray-200">
        {CATEGORY_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-150
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500
                ${
                  isActive
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-50 border border-gray-200'
                }
              `.trim()}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div className="space-y-6 animate-in fade-in duration-150">
        {/* =========================================================================
            TAB 1: FACE & SKIN
            ========================================================================= */}
        {activeTab === 'face' && (
          <div className="space-y-5">
            {/* Skin Tone Swatches */}
            <div className="space-y-2.5">
              <label className="text-xs font-semibold text-gray-700">
                Skin Tone
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                {SKIN_TONES.map((tone) => {
                  const isSelected = config.skin === tone.id;
                  return (
                    <button
                      key={tone.id}
                      type="button"
                      onClick={() => updateProp('skin', tone.id)}
                      className={`
                        group p-2 rounded-xl border flex items-center gap-2.5 transition-all
                        ${
                          isSelected
                            ? 'bg-brand-50 border-brand-500 ring-2 ring-brand-100 text-brand-900 font-semibold shadow-sm'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900 hover:bg-gray-50'
                        }
                      `.trim()}
                    >
                      <span
                        className="h-5 w-5 rounded-full border border-black/15 shrink-0 shadow-inner flex items-center justify-center text-gray-900"
                        style={{ backgroundColor: tone.color }}
                      >
                        {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                      </span>
                      <span className="text-[11px] font-medium truncate">{tone.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Face Shape */}
            <div className="space-y-2.5">
              <label className="text-xs font-semibold text-gray-700">
                Face Shape
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {FACE_OPTIONS.map((shape) => {
                  const isSelected = config.face === shape.id;
                  return (
                    <button
                      key={shape.id}
                      type="button"
                      onClick={() => updateProp('face', shape.id)}
                      className={`
                        p-3 rounded-xl border text-xs font-medium transition-all text-center
                        ${
                          isSelected
                            ? 'bg-brand-50 border-brand-500 text-brand-700 ring-2 ring-brand-100 font-semibold shadow-sm'
                            : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                        }
                      `.trim()}
                    >
                      {shape.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 2: HAIR & COLOR
            ========================================================================= */}
        {activeTab === 'hair' && (
          <div className="space-y-5">
            {/* Hair Style */}
            <div className="space-y-2.5">
              <label className="text-xs font-semibold text-gray-700">
                Hairstyle
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {HAIR_OPTIONS.map((style) => {
                  const isSelected = config.hair === style.id;
                  return (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => updateProp('hair', style.id)}
                      className={`
                        p-3 rounded-xl border text-xs font-medium transition-all text-center
                        ${
                          isSelected
                            ? 'bg-brand-50 border-brand-500 text-brand-700 ring-2 ring-brand-100 font-semibold shadow-sm'
                            : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                        }
                      `.trim()}
                    >
                      {style.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Hair Color */}
            <div className="space-y-2.5">
              <label className="text-xs font-semibold text-gray-700">
                Hair Color
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {HAIR_COLORS.map((col) => {
                  const isSelected = config.hairColor === col.id;
                  return (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => updateProp('hairColor', col.id)}
                      className={`
                        p-2 rounded-xl border flex items-center gap-2.5 transition-all
                        ${
                          isSelected
                            ? 'bg-brand-50 border-brand-500 ring-2 ring-brand-100 text-brand-900 font-semibold shadow-sm'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900 hover:bg-gray-50'
                        }
                      `.trim()}
                    >
                      <span
                        className="h-4 w-4 rounded-full border border-black/15 shrink-0 shadow-sm flex items-center justify-center text-white"
                        style={{ backgroundColor: col.color }}
                      >
                        {isSelected && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                      </span>
                      <span className="text-[11px] font-medium truncate">{col.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 3: EXPRESSION (EYES, EYEBROWS, MOUTH)
            ========================================================================= */}
        {activeTab === 'expression' && (
          <div className="space-y-5">
            {/* Eyes */}
            <div className="space-y-2.5">
              <label className="text-xs font-semibold text-gray-700">
                Eyes Expression
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {EYE_OPTIONS.map((opt) => {
                  const isSelected = config.eyes === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => updateProp('eyes', opt.id)}
                      className={`
                        p-2.5 rounded-xl border text-xs font-medium transition-all text-center
                        ${
                          isSelected
                            ? 'bg-brand-50 border-brand-500 text-brand-700 ring-2 ring-brand-100 font-semibold shadow-sm'
                            : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                        }
                      `.trim()}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Eyebrows */}
            <div className="space-y-2.5">
              <label className="text-xs font-semibold text-gray-700">
                Eyebrows Style
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {EYEBROW_OPTIONS.map((opt) => {
                  const isSelected = config.eyebrows === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => updateProp('eyebrows', opt.id)}
                      className={`
                        p-2.5 rounded-xl border text-xs font-medium transition-all text-center
                        ${
                          isSelected
                            ? 'bg-brand-50 border-brand-500 text-brand-700 ring-2 ring-brand-100 font-semibold shadow-sm'
                            : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                        }
                      `.trim()}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mouth */}
            <div className="space-y-2.5">
              <label className="text-xs font-semibold text-gray-700">
                Mouth &amp; Mood
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {MOUTH_OPTIONS.map((opt) => {
                  const isSelected = config.mouth === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => updateProp('mouth', opt.id)}
                      className={`
                        p-2.5 rounded-xl border text-xs font-medium transition-all text-center
                        ${
                          isSelected
                            ? 'bg-brand-50 border-brand-500 text-brand-700 ring-2 ring-brand-100 font-semibold shadow-sm'
                            : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                        }
                      `.trim()}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 4: OUTFIT & SHIRT COLOR
            ========================================================================= */}
        {activeTab === 'outfit' && (
          <div className="space-y-5">
            {/* Shirt Style */}
            <div className="space-y-2.5">
              <label className="text-xs font-semibold text-gray-700">
                Top Style
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {SHIRT_OPTIONS.map((shirt) => {
                  const isSelected = config.shirt === shirt.id;
                  return (
                    <button
                      key={shirt.id}
                      type="button"
                      onClick={() => updateProp('shirt', shirt.id)}
                      className={`
                        p-3 rounded-xl border text-xs font-medium transition-all text-center
                        ${
                          isSelected
                            ? 'bg-brand-50 border-brand-500 text-brand-700 ring-2 ring-brand-100 font-semibold shadow-sm'
                            : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                        }
                      `.trim()}
                    >
                      {shirt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Shirt Color Palette */}
            <div className="space-y-2.5">
              <label className="text-xs font-semibold text-gray-700">
                Outfit Color
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {SHIRT_COLORS.map((col) => {
                  const isSelected = config.shirtColor === col.id;
                  return (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => updateProp('shirtColor', col.id)}
                      className={`
                        p-2 rounded-xl border flex items-center gap-2.5 transition-all
                        ${
                          isSelected
                            ? 'bg-brand-50 border-brand-500 ring-2 ring-brand-100 text-brand-900 font-semibold shadow-sm'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900 hover:bg-gray-50'
                        }
                      `.trim()}
                    >
                      <span
                        className="h-4 w-4 rounded-full border border-black/15 shrink-0 shadow-sm flex items-center justify-center text-white"
                        style={{ backgroundColor: col.color }}
                      >
                        {isSelected && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                      </span>
                      <span className="text-[11px] font-medium truncate">{col.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 5: ACCESSORIES
            ========================================================================= */}
        {activeTab === 'accessory' && (
          <div className="space-y-5">
            <div className="space-y-2.5">
              <label className="text-xs font-semibold text-gray-700">
                Campus Wear &amp; Gear
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {ACCESSORY_OPTIONS.map((acc) => {
                  const isSelected = config.accessory === acc.id;
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => updateProp('accessory', acc.id)}
                      className={`
                        p-3 rounded-xl border text-xs font-medium transition-all text-center
                        ${
                          isSelected
                            ? 'bg-brand-50 border-brand-500 text-brand-700 ring-2 ring-brand-100 font-semibold shadow-sm'
                            : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                        }
                      `.trim()}
                    >
                      {acc.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 6: BACKGROUND THEMES
            ========================================================================= */}
        {activeTab === 'background' && (
          <div className="space-y-5">
            <div className="space-y-2.5">
              <label className="text-xs font-semibold text-gray-700">
                Avatar Backdrop &amp; Color
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {BACKGROUND_THEMES.map((theme) => {
                  const isSelected = config.background === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => updateProp('background', theme.id)}
                      className={`
                        p-2.5 rounded-xl border flex items-center gap-2.5 transition-all text-left
                        ${
                          isSelected
                            ? 'bg-brand-50 border-brand-500 ring-2 ring-brand-100 text-brand-900 font-semibold shadow-sm'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900 hover:bg-gray-50'
                        }
                      `.trim()}
                    >
                      <span
                        className={`h-4 w-4 rounded-full bg-gradient-to-br ${theme.gradient} shrink-0 border border-black/15 shadow-sm`}
                      />
                      <span className="text-[11px] font-medium truncate">{theme.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AvatarCategorySelector;
