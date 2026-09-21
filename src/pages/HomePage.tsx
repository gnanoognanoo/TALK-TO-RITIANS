import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  MessageSquare,
  Sparkles,
  Users,
  ShieldCheck,
  Zap,
  ArrowRight,
  Radio,
} from 'lucide-react';
import { Button, Card, Badge, Avatar, PageContainer, EmptyState } from '../components';
import { useAuth } from '../context';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const displayUsername = profile?.display_username || 'Unknown Student';
  const initials = displayUsername
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const departmentInfo = profile?.department
    ? `${profile.department}${profile.batch ? ` • ${profile.batch}` : ''}`
    : 'Rajalakshmi Institute of Technology';

  return (
    <PageContainer maxWidth="xl" className="space-y-8">
      {/* Student Welcome Header Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-brand-900/40 via-slate-900 to-slate-900 border border-brand-500/20 p-6 sm:p-8 shadow-2xl">
        <div
          className="absolute -right-10 -bottom-10 w-72 h-72 bg-brand-600/10 blur-[90px] rounded-full pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <Avatar
              size="xl"
              avatarConfig={profile?.avatar_config as any}
              initials={initials}
              presence="online"
            />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  {displayUsername}
                </h1>
                <Badge variant={profile?.college_identity_linked ? 'success' : 'warning'} size="sm" withDot>
                  {profile?.college_identity_linked ? 'Campus Verified' : 'Unlinked ID'}
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-slate-400">
                {departmentInfo}
              </p>
              <div className="flex items-center gap-3 pt-1 text-xs text-slate-400">
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  Ready to match
                </span>
                <span>&bull;</span>
                <Link to="/avatar" className="text-brand-400 hover:text-brand-300 font-medium">
                  Customize Avatar
                </Link>
              </div>
            </div>
          </div>

          <div className="w-full md:w-auto flex flex-col sm:flex-row gap-3">
            <Button
              variant="primary"
              size="lg"
              onClick={() => navigate('/matching')}
              leftIcon={<Radio className="h-5 w-5 text-white animate-pulse" />}
              rightIcon={<ArrowRight className="h-5 w-5" />}
              className="shadow-xl shadow-brand-600/30 font-bold"
            >
              Start Anonymous Chat
            </Button>
          </div>
        </div>
      </div>

      {/* Live Campus Activity & Pulse Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card className="p-5 flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-2xl font-black text-white">42</span>
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
            </div>
            <p className="text-xs text-slate-400 font-medium">RITians Online Now</p>
          </div>
        </Card>

        <Card className="p-5 flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-brand-500/10 text-brand-400 border border-brand-500/20 flex items-center justify-center shrink-0">
            <MessageSquare className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-2xl font-black text-white">18</span>
            </div>
            <p className="text-xs text-slate-400 font-medium">Live Active Rooms</p>
          </div>
        </Card>

        <Card className="p-5 flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center shrink-0">
            <Zap className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-2xl font-black text-white">&lt; 3s</span>
            </div>
            <p className="text-xs text-slate-400 font-medium">Avg Match Time</p>
          </div>
        </Card>
      </div>

      {/* Two-Column Section: Topics & Guidelines */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trending Campus Topics (2 cols) */}
        <Card className="lg:col-span-2 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-400" />
              <h2 className="text-base font-bold text-white">Trending Campus Topics</h2>
            </div>
            <Badge variant="neutral" size="sm">
              Today
            </Badge>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Need something to break the ice? Here are common topics students are talking about today:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { title: 'Semester Lab Internals', desc: 'Schedules, past papers, viva prep & tips', tag: 'Academics' },
              { title: 'Hackathons & Symposiums', desc: 'Forming project teams & project ideas', tag: 'Events' },
              { title: 'Hostel & Food Reviews', desc: 'Best spots inside and outside campus', tag: 'Campus Life' },
              { title: 'Placement / Internship Drive', desc: 'Interview experiences & resume review', tag: 'Careers' },
            ].map((topic) => (
              <button
                key={topic.title}
                type="button"
                onClick={() => navigate('/matching')}
                className="text-left p-4 rounded-xl bg-slate-950/50 border border-slate-800/80 hover:border-brand-500/40 hover:bg-slate-900/60 transition-all group"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <Badge variant="brand" size="sm">
                    {topic.tag}
                  </Badge>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-brand-400 group-hover:translate-x-0.5 transition-all" />
                </div>
                <h3 className="text-xs sm:text-sm font-semibold text-slate-200 group-hover:text-white">
                  {topic.title}
                </h3>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{topic.desc}</p>
              </button>
            ))}
          </div>
        </Card>

        {/* Safety & Community Standards (1 col) */}
        <Card className="p-6 space-y-4 bg-slate-900/50">
          <div className="flex items-center gap-2 text-emerald-400">
            <ShieldCheck className="h-5 w-5" />
            <h2 className="text-base font-bold text-white">Campus Standards</h2>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Talk to RITians is a respectful, safe space exclusively for our student body.
          </p>

          <ul className="space-y-3 text-xs text-slate-300">
            <li className="flex items-start gap-2">
              <span className="text-brand-400 font-bold">&bull;</span>
              <span>Keep personal identity private. Don't share phone numbers or social handles.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-brand-400 font-bold">&bull;</span>
              <span>Treat every student with respect. Harassment will lead to student ID ban.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-brand-400 font-bold">&bull;</span>
              <span>Use the Skip or Leave button anytime a conversation doesn't feel right.</span>
            </li>
          </ul>

          <div className="pt-2 border-t border-slate-800">
            <Button
              variant="secondary"
              size="sm"
              fullWidth
              onClick={() => navigate('/matching')}
            >
              Enter Queue
            </Button>
          </div>
        </Card>
      </div>

      {/* Ephemeral History & Privacy Assurance using EmptyState */}
      <div className="pt-2">
        <EmptyState
          title="Zero Message Retention"
          description="Your previous chat sessions are permanently discarded upon exit. Talk to RITians stores zero transcripts or identity records to keep your conversations completely safe and private."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/matching')}
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Start New Conversation
            </Button>
          }
        />
      </div>
    </PageContainer>
  );
};

export default HomePage;
