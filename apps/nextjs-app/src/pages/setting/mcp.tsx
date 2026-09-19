import type { GetServerSideProps } from 'next';
import type { ReactElement } from 'react';
import { McpPage } from '@/features/app/blocks/setting/mcp/McpPage';
import { SettingLayout } from '@/features/app/layouts/SettingLayout';
import { mcpConfig } from '@/features/i18n/mcp.config';
import ensureLogin from '@/lib/ensureLogin';
import { getTranslationsProps } from '@/lib/i18n';
import type { NextPageWithLayout } from '@/lib/type';
import withEnv from '@/lib/withEnv';

const Mcp: NextPageWithLayout = () => {
  return <McpPage />;
};

export const getServerSideProps: GetServerSideProps = withEnv(
  ensureLogin(async (context) => {
    return {
      props: {
        ...(await getTranslationsProps(context, mcpConfig.i18nNamespaces)),
      },
    };
  })
);

Mcp.getLayout = function getLayout(page: ReactElement, pageProps) {
  return <SettingLayout {...pageProps}>{page}</SettingLayout>;
};

export default Mcp;
