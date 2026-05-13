import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ISettingVo, IUpdateSettingRo } from '@teable/openapi';
import { getSetting, updateSetting } from '@teable/openapi';
import { useIsHydrated } from '@teable/sdk/hooks';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useEffect, useRef } from 'react';
import { AIControlCard } from '../setting/components/ai-config/AIControlCard';
import { AIConfigFormWizard } from '../setting/components/ai-config/AiFormWizard';

export interface IAiSettingPageProps {
  settingServerData?: ISettingVo;
}

export const AiSettingPage = ({ settingServerData }: IAiSettingPageProps) => {
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();
  const router = useRouter();
  const llmRef = useRef<HTMLDivElement>(null);
  const isHydrated = useIsHydrated();

  const { data: setting = settingServerData } = useQuery({
    queryKey: ['setting'],
    queryFn: () => getSetting().then(({ data }) => data),
  });

  const { mutateAsync: mutateUpdateSetting } = useMutation({
    mutationFn: (props: IUpdateSettingRo) => updateSetting(props),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setting'] });
    },
  });

  useEffect(() => {
    const { anchor } = router.query;
    if (anchor === 'llm' || anchor === 'app') {
      setTimeout(() => {
        llmRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 500);
    }
  }, [router.query]);

  if (!setting || !isHydrated) return null;

  const setAiConfig = (aiConfig: NonNullable<ISettingVo['aiConfig']>) => {
    mutateUpdateSetting({ aiConfig } as IUpdateSettingRo);
  };

  const onControlChange = ({ disableActions }: { disableActions: string[] }) => {
    mutateUpdateSetting({
      aiConfig: { ...setting.aiConfig, disableActions },
    } as IUpdateSettingRo);
  };

  return (
    <div className="flex h-screen flex-1 flex-col overflow-y-auto overflow-x-hidden p-4 sm:p-8">
      <div className="pb-6">
        <h1 className="text-2xl font-semibold">{t('admin.setting.ai.title', 'AI Settings')}</h1>
        <div className="mt-2 text-sm text-muted-foreground">
          {t(
            'admin.setting.ai.description',
            'Configure AI providers and models for your instance.'
          )}
        </div>
      </div>

      <div className="flex max-w-3xl flex-col gap-6">
        <div ref={llmRef}>
          <AIConfigFormWizard aiConfig={setting.aiConfig} setAiConfig={setAiConfig} />
        </div>

        <AIControlCard
          disableActions={setting.aiConfig?.disableActions ?? []}
          onChange={onControlChange}
        />
      </div>
    </div>
  );
};
