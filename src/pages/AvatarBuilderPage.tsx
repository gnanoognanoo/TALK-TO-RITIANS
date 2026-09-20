import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Palette } from 'lucide-react';
import { Button, Card, CardContent, CardFooter, Badge } from '../components';

const avatarPresets = [
  { id: 'phoenix', name: 'Phoenix', emoji: '🔥', initials: 'PX' },
  { id: 'robot', name: 'Cyberbot', emoji: '🤖', initials: 'CB' },
  { id: 'tiger', name: 'Brave Tiger', emoji: '🐯', initials: 'BT' },
  { id: 'astronaut', name: 'Cosmonaut', emoji: '👨‍🚀', initials: 'CM' },
  { id: 'owl', name: 'Wise Owl', emoji: '🦉', initials: 'WO' },
  { id: 'wizard', name: 'Code Mage', emoji: '🧙‍♂️', initials: 'CM' },
  { id: 'cat', name: 'Ninja Cat', emoji: '🐱', initials: 'NC' },
  { id: 'alien', name: 'Cosmic Alien', emoji: '👾', initials: 'CA' },
];

const colorThemes = [
  { id: 'indigo', name: 'Brand Indigo', bg: 'from-brand-600 to-indigo-900', border: 'border-brand-500' },
  { id: 'emerald', name: 'Campus Emerald', bg: 'from-emerald-600 to-teal-900', border: 'border-emerald-500' },
  { id: 'purple', name: 'Electric Violet', bg: 'from-purple-600 to-indigo-950', border: 'border-purple-500' },
  { id: 'amber', name: 'Solar Amber', bg: 'from-amber-600 to-orange-950', border: 'border-amber-500' },
  { id: 'cyan', name: 'Glacier Cyan', bg: 'from-cyan-600 to-blue-950', border: 'border-cyan-500' },
  { id: 'rose', name: 'Neon Rose', bg: 'from-rose-600 to-pink-950', border: 'border-rose-500' },
];

export const AvatarBuilderPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedPreset, setSelectedPreset] = useState(avatarPresets[0]);
  const [selectedColor, setSelectedColor] = useState(colorThemes[0]);

  const handleFinish = () => {
    navigate('/home');
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <Badge variant="brand" size="sm">
          Onboarding Step 3
        </Badge>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Select Your Campus Avatar
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
          Choose a visual icon and color scheme to represent you in chat conversations.
        </p>
      </div>

      <Card className="border-slate-800 bg-slate-900/80 shadow-2xl">
        <CardContent className="space-y-8 pt-6">
          {/* Live Preview Display */}
          <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-slate-950/60 border border-slate-800">
            <div className="text-center space-y-3">
              <div
                className={`
                  relative inline-flex items-center justify-center rounded-3xl p-1 bg-gradient-to-br
                  ${selectedColor.bg} border-2 ${selectedColor.border} shadow-2xl shadow-brand-500/10
                `}
              >
                <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-[20px] bg-slate-950/40 backdrop-blur flex items-center justify-center text-4xl sm:text-5xl select-none">
                  {selectedPreset.emoji}
                </div>
                {/* Online status indicator */}
                <span className="absolute bottom-1 right-1 h-5 w-5 rounded-full bg-emerald-400 ring-4 ring-slate-950" />
              </div>

              <div>
                <h3 className="text-base font-bold text-white">{selectedPreset.name}</h3>
                <p className="text-xs text-slate-400">Theme: {selectedColor.name}</p>
              </div>
            </div>
          </div>

          {/* Preset Avatar Selection Grid */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Choose Avatar Character
            </h4>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
              {avatarPresets.map((preset) => {
                const isSelected = selectedPreset.id === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedPreset(preset)}
                    className={`
                      relative p-3 rounded-2xl border text-center transition-all duration-150 flex flex-col items-center gap-1.5
                      ${
                        isSelected
                          ? 'bg-brand-600/20 border-brand-500 shadow-lg shadow-brand-500/20 scale-105'
                          : 'bg-slate-950/40 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
                      }
                    `.trim()}
                  >
                    <span className="text-2xl">{preset.emoji}</span>
                    <span className="text-[10px] font-medium text-slate-400 truncate w-full">
                      {preset.name.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color Scheme Picker */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Palette className="h-4 w-4 text-brand-400" />
              <span>Glow & Background Palette</span>
            </h4>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
              {colorThemes.map((color) => {
                const isSelected = selectedColor.id === color.id;
                return (
                  <button
                    key={color.id}
                    type="button"
                    onClick={() => setSelectedColor(color)}
                    className={`
                      p-2 rounded-xl border text-xs font-medium flex items-center gap-2 transition-all
                      ${
                        isSelected
                          ? 'bg-slate-800 border-white/40 text-white shadow-sm'
                          : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                      }
                    `.trim()}
                  >
                    <span
                      className={`h-3.5 w-3.5 rounded-full bg-gradient-to-br ${color.bg} shrink-0`}
                    />
                    <span className="truncate text-[11px]">{color.name.split(' ')[1]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex items-center justify-between border-t border-slate-800/60 pt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate('/username')}
            leftIcon={<ArrowLeft className="h-4 w-4" />}
          >
            Back
          </Button>

          <Button
            type="button"
            variant="primary"
            onClick={handleFinish}
            rightIcon={<ArrowRight className="h-4 w-4" />}
          >
            Complete Setup & Enter Campus
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default AvatarBuilderPage;
