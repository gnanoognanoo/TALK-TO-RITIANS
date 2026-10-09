import React from 'react';
import { Link } from 'react-router-dom';
import { Compass, Home, ArrowLeft } from 'lucide-react';
import { Button, Card, PageContainer } from '../components';

export const NotFoundPage: React.FC = () => {
  return (
    <PageContainer maxWidth="sm" className="flex-1 flex items-center justify-center py-16">
      <Card className="w-full p-8 text-center border border-gray-200/80 dark:border-[rgba(140,170,110,0.22)] bg-white/95 dark:bg-[#091009]/90 backdrop-blur-md shadow-card dark:shadow-liquid-outer rounded-[28px]">
        <div className="h-16 w-16 rounded-2xl bg-brand-50 dark:bg-[#101D11] border border-brand-200 dark:border-[rgba(140,170,110,0.25)] text-brand-600 dark:text-[#8DA852] mx-auto flex items-center justify-center mb-6 shadow-sm">
          <Compass className="h-8 w-8 stroke-[1.75]" />
        </div>

        <span className="text-xs font-semibold uppercase tracking-wider text-brand-700 dark:text-[#A2BD63] bg-brand-50 dark:bg-[#101D11] px-3 py-1 rounded-full border border-brand-200 dark:border-[rgba(140,170,110,0.25)]">
          404 &bull; Page Not Found
        </span>

        <h1 className="text-2xl font-black text-gray-900 dark:text-[#F4F6F1] mt-4 tracking-tight">
          Lost on Campus?
        </h1>

        <p className="text-xs sm:text-sm text-gray-500 dark:text-[#9DA89A] mt-2 leading-relaxed">
          The page or chat room you're looking for doesn't exist, has ended, or moved to another block.
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
