import type { IMcpToolGroup, IMcpToolItem } from '@teable/openapi';
import { Badge } from '@teable/ui-lib/shadcn';
import { useTranslation } from 'next-i18next';
import { useMemo } from 'react';
import { mcpConfig } from '@/features/i18n/mcp.config';

const GROUP_ORDER: IMcpToolGroup[] = ['discovery', 'record', 'schema'];

interface IToolCatalogueProps {
  tools: IMcpToolItem[];
}

export const ToolCatalogue = ({ tools }: IToolCatalogueProps) => {
  const { t } = useTranslation(mcpConfig.i18nNamespaces);

  const grouped = useMemo(() => {
    return GROUP_ORDER.map((group) => ({
      group,
      items: tools.filter((tool) => tool.group === group),
    })).filter(({ items }) => items.length > 0);
  }, [tools]);

  return (
    <div className="space-y-6">
      {grouped.map(({ group, items }) => (
        <div key={group} className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">
            {t(`mcp:catalogue.group.${group}`)}
          </h4>
          <div className="divide-y rounded-md border">
            {items.map((tool) => (
              <div key={tool.name} className="flex flex-col gap-1 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{tool.name}</code>
                  {tool.annotations.readOnlyHint ? (
                    <Badge variant="secondary" className="text-[11px] font-normal">
                      {t('mcp:catalogue.readOnly')}
                    </Badge>
                  ) : null}
                  {tool.annotations.destructiveHint ? (
                    <Badge variant="destructive" className="text-[11px] font-normal">
                      {t('mcp:catalogue.destructive')}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">{tool.description}</p>
                <p className="text-xs text-muted-foreground">
                  {t('mcp:catalogue.requiredScopes')}:{' '}
                  {tool.requiredActions.map((action) => (
                    <code key={action} className="mr-1 rounded bg-muted px-1 py-0.5">
                      {action}
                    </code>
                  ))}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
