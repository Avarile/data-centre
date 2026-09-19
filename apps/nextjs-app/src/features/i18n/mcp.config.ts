import type { I18nActiveNamespaces } from '@/lib/i18n';

export interface IMcpPageConfig {
  i18nNamespaces: I18nActiveNamespaces<'common' | 'sdk' | 'setting' | 'mcp'>;
}

export const mcpConfig: IMcpPageConfig = {
  i18nNamespaces: ['common', 'sdk', 'setting', 'mcp'],
};
