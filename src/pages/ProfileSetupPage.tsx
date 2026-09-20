import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, BookOpen, GraduationCap } from 'lucide-react';
import { Button, Card, CardContent, CardFooter, Badge } from '../components';

const departments = [
  'Computer Science & Engineering',
  'Artificial Intelligence & Data Science',
  'Electronics & Communication',
  'Mechanical Engineering',
  'Civil Engineering',
  'Information Technology',
  'Biomedical Engineering',
  'Prefer Not to Say',
];

const collegeYears = ['1st Year (Freshman)', '2nd Year (Sophomore)', '3rd Year (Junior)', '4th Year (Senior)', 'Alumni'];

export const ProfileSetupPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedDept, setSelectedDept] = useState(departments[0]);
  const [selectedYear, setSelectedYear] = useState(collegeYears[2]);
  const [campusBio, setCampusBio] = useState('');

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('/username');
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <Badge variant="brand" size="sm">
          Onboarding Step 1
        </Badge>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Campus Profile Setup
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
          Share general campus context to help find better conversations. This remains entirely anonymous.
        </p>
      </div>

      <Card className="border-slate-800 bg-slate-900/80 shadow-2xl">
        <form onSubmit={handleNext}>
          <CardContent className="space-y-6 pt-6">
            {/* Department Selection */}
            <div className="space-y-2">
              <label
                htmlFor="department-select"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5"
              >
                <BookOpen className="h-4 w-4 text-brand-400" />
                <span>Department / Branch</span>
              </label>
              <select
                id="department-select"
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="w-full bg-slate-900 text-slate-100 rounded-xl border border-slate-800 px-4 py-2.5 text-sm focus-visible:border-brand-500 focus-visible:ring-1 focus-visible:ring-brand-500 transition-colors"
              >
                {departments.map((dept) => (
                  <option key={dept} value={dept} className="bg-slate-900 text-slate-100">
                    {dept}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">
                Shown as an optional tag to help connect over coursework or campus topics.
              </p>
            </div>

            {/* Academic Year */}
            <div className="space-y-2">
              <label
                htmlFor="year-select"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5"
              >
                <GraduationCap className="h-4 w-4 text-emerald-400" />
                <span>Academic Year</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {collegeYears.map((year) => {
                  const isSelected = selectedYear === year;
                  return (
                    <button
                      key={year}
                      type="button"
                      onClick={() => setSelectedYear(year)}
                      className={`
                        p-2.5 text-xs rounded-xl font-medium border text-left transition-all
                        ${
                          isSelected
                            ? 'bg-brand-600/20 text-brand-300 border-brand-500/50 shadow-sm'
                            : 'bg-slate-950/40 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-300'
                        }
                      `.trim()}
                    >
                      {year}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Optional Bio */}
            <div className="space-y-2">
              <label
                htmlFor="campus-bio"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center justify-between"
              >
                <span className="flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  <span>Campus Interests & Icebreaker (Optional)</span>
                </span>
                <span className="text-[10px] text-slate-500 font-normal">Max 120 chars</span>
              </label>
              <textarea
                id="campus-bio"
                maxLength={120}
                rows={3}
                value={campusBio}
                onChange={(e) => setCampusBio(e.target.value)}
                placeholder="E.g. Hackathons enthusiast, looking to chat about web development or campus food recommendations..."
                className="w-full bg-slate-900 text-slate-100 placeholder-slate-500 rounded-xl border border-slate-800 p-3 text-sm focus-visible:border-brand-500 focus-visible:ring-1 focus-visible:ring-brand-500 transition-colors"
              />
            </div>
          </CardContent>

          <CardFooter className="flex items-center justify-between border-t border-slate-800/60 pt-4">
            <span className="text-xs text-slate-500">Step 1 of 3</span>
            <Button
              type="submit"
              variant="primary"
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Next: Choose Username
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default ProfileSetupPage;
