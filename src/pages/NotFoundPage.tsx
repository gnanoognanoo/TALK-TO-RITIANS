import React from 'react';
import { Link } from 'react-router-dom';
import { Compass, Home, ArrowLeft } from 'lucide-react';
import { Button, Card, PageContainer } from '../components';

export const NotFoundPage: React.FC = () => {
  return (
    <PageContainer maxWidth="sm" className="flex-1 flex items-center justify-center py-16">
      <Card className="w-full p-8 text-center border-slate-800 bg-slate-900/80 shadow-2xl">
        <div className="h-16 w-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 text-brand-400 mx-auto flex items-center justify-center mb-6 shadow-inner">
          <Compass className="h-8 w-8" />
        </div>

        <span className="text-xs font-mono font-bold uppercase tracking-widest text-brand-400 bg-brand-500/10 px-3 py-1 rounded-full border border-brand-500/20">
          404 &bull; Page Not Found
        </span>

        <h1 className="text-2xl font-black text-white mt-4 tracking-tight">
          Lost in Campus?
        </h1>

        <p className="text-xs sm:text-sm text-slate-400 mt-2 leading-relaxed">
          The page or chat room you're looking for doesn't exist, has expired, or moved to another block.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/" className="w-full sm:w-auto">
            <Button
              variant="secondary"
              fullWidth
              leftIcon={<ArrowLeft className="h-4 w-4" />}
            >
              Go to Landing
            </Button>
          </Link>
          <Link to="/home" className="w-full sm:w-auto">
            <Button
              variant="primary"
              fullWidth
              leftIcon={<Home className="h-4 w-4" />}
            >
              Student Home
            </Button>
          </Link>
        </div>
      </Card>
    </PageContainer>
  );
};

export default NotFoundPage;
