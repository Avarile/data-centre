import { useTranslation } from 'next-i18next';
import { AnimatedGridPattern } from '@/components/ui/animated-grid-pattern';
import { authConfig } from '@/features/i18n/auth.config';
// import { Rectangles } from './Rectangles';

export const DescContent = () => {
  const { t } = useTranslation(authConfig.i18nNamespaces);
  return (
    <div className="shrink-1 relative hidden flex-1 basis-1/4 items-center justify-center border-r p-10 shadow-lg lg:flex">
      <AnimatedGridPattern
        className="absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,white,transparent_80%)]"
        width={40}
        height={40}
        numSquares={40}
        maxOpacity={0.15}
        duration={3}
        repeatDelay={0.5}
      />
      <div className="overflow-hidden">
        <h2 className="absolute -translate-y-full text-wrap pr-10 text-6xl font-bold">
          {t('auth:content.title')}
        </h2>
        <p className="py-10">{t('auth:content.description')}</p>
      </div>
    </div>
  );
};
