import type { ISettingVo } from '@teable/openapi';
import { Button, Input, Label } from '@teable/ui-lib/shadcn';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';

interface IAppBuilderConfigProps {
  appConfig: ISettingVo['appConfig'];
  onSave: (appConfig: NonNullable<ISettingVo['appConfig']>) => void;
}

export const AppBuilderConfig = ({ appConfig, onSave }: IAppBuilderConfigProps) => {
  const { t } = useTranslation('common');

  const [vercelToken, setVercelToken] = useState(appConfig?.vercelToken ?? '');
  const [customDomain, setCustomDomain] = useState(appConfig?.customDomain ?? '');
  const [vercelBaseUrl, setVercelBaseUrl] = useState(appConfig?.vercelBaseUrl ?? '');

  // Keep local state in sync if parent config updates
  useEffect(() => {
    setVercelToken(appConfig?.vercelToken ?? '');
    setCustomDomain(appConfig?.customDomain ?? '');
    setVercelBaseUrl(appConfig?.vercelBaseUrl ?? '');
  }, [appConfig]);

  const handleSave = () => {
    onSave({
      vercelToken: vercelToken || undefined,
      customDomain: customDomain || undefined,
      vercelBaseUrl: vercelBaseUrl || undefined,
    });
    toast.success(t('admin.setting.ai.configUpdated', 'Settings saved.'));
  };

  return (
    <div className="rounded-lg border bg-card p-5 shadow-none">
      <div className="mb-5">
        <h2 className="font-medium">
          {t('admin.configuration.list.appBuilderDomain.title', 'App Builder')}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            'admin.setting.appBuilder.description',
            'Configure Vercel integration to enable the App Builder feature.'
          )}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="vercel-token">
            {t('admin.setting.app.vercelToken', 'Vercel API Token')}
            <span className="ml-1 text-destructive">*</span>
          </Label>
          <Input
            id="vercel-token"
            type="password"
            value={vercelToken}
            placeholder={t('admin.action.enterApiKey', 'Enter API key…')}
            onChange={(e) => setVercelToken(e.target.value.trim())}
            autoComplete="off"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="custom-domain">
            {t('admin.setting.app.customDomain', 'Custom Domain')}
            <span className="ml-1 text-xs text-muted-foreground">
              ({t('admin.setting.ai.wizard.optional', 'optional')})
            </span>
          </Label>
          <Input
            id="custom-domain"
            type="text"
            value={customDomain}
            placeholder="app.yourdomain.com"
            onChange={(e) => setCustomDomain(e.target.value.trim())}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="vercel-base-url">
            {t('admin.setting.app.vercelBaseUrl', 'Vercel API Base URL')}
            <span className="ml-1 text-xs text-muted-foreground">
              ({t('admin.setting.ai.wizard.optional', 'optional')})
            </span>
          </Label>
          <Input
            id="vercel-base-url"
            type="text"
            value={vercelBaseUrl}
            placeholder="https://api.vercel.com"
            onChange={(e) => setVercelBaseUrl(e.target.value.trim())}
          />
          <p className="text-xs text-muted-foreground">
            {t(
              'admin.setting.app.vercelBaseUrlDescription',
              'Use a reverse proxy URL if direct Vercel API access is blocked.'
            )}
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={!vercelToken}>
            {t('actions.save', 'Save')}
          </Button>
        </div>
      </div>
    </div>
  );
};
