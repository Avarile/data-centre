import { useQuery } from '@tanstack/react-query';
import { Key } from '@teable/icons';
import { getMcpManifest } from '@teable/openapi';
import { Button, Skeleton } from '@teable/ui-lib/shadcn';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { mcpConfig } from '@/features/i18n/mcp.config';
import { SettingRight } from '../SettingRight';
import { SettingRightTitle } from '../SettingRightTitle';
import { ConnectionSnippet } from './ConnectionSnippet';
import { ToolCatalogue } from './ToolCatalogue';

const Section = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) => (
  <section className="space-y-2">
    <h3 className="text-base font-medium">{title}</h3>
    {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    {children}
  </section>
);

export const McpPage = () => {
  const { t } = useTranslation(mcpConfig.i18nNamespaces);
  const { data, isLoading } = useQuery({
    queryKey: ['mcp-manifest'],
    queryFn: () => getMcpManifest().then(({ data }) => data),
  });

  return (
    <SettingRight
      header={<SettingRightTitle title={t('setting:mcp')} description={t('mcp:description')} />}
    >
      {isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div className="max-w-3xl space-y-8 pb-8">
          <Section title={t('mcp:endpoint.title')} description={t('mcp:endpoint.description')}>
            <code className="block overflow-x-auto rounded-md bg-muted p-3 text-sm">
              {data.endpoint}
            </code>
          </Section>

          <Section title={t('mcp:token.title')} description={t('mcp:token.description')}>
            <p className="text-sm text-muted-foreground">{t('mcp:token.hint')}</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/setting/personal-access-token">
                <Key className="mr-1 size-4" />
                {t('mcp:token.manage')}
              </Link>
            </Button>
          </Section>

          <Section title={t('mcp:connect.title')}>
            <ConnectionSnippet endpoint={data.endpoint} />
          </Section>

          <Section title={t('mcp:catalogue.title')} description={t('mcp:catalogue.description')}>
            {!data.writesEnabled ? (
              <p className="rounded-md border border-warning bg-warning/10 p-3 text-sm">
                {t('mcp:catalogue.writesDisabled')}
              </p>
            ) : null}
            <ToolCatalogue tools={data.tools} />
          </Section>

          <Section title={t('mcp:safety.title')} description={t('mcp:safety.description')}>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>{t('mcp:limits.maxRecords', { count: data.maxRecordsPerCall })}</li>
              <li>{t('mcp:limits.maxDelete', { count: data.maxDeletePerCall })}</li>
              <li>{t('mcp:safety.learnMore')}</li>
            </ul>
          </Section>
        </div>
      )}
    </SettingRight>
  );
};
