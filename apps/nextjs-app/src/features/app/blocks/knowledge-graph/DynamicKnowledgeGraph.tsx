import { Skeleton } from '@teable/ui-lib/shadcn';
import dynamic from 'next/dynamic';

/**
 * `ssr: false` is mandatory: react-force-graph-3d touches `window` at import
 * time. It is also what keeps three out of the initial page chunk measured by
 * `.size-limit.js`.
 */
export const DynamicKnowledgeGraph = dynamic(
  () => import('./KnowledgeGraph').then((mod) => mod.KnowledgeGraph),
  {
    loading: () => <Skeleton className="size-full" />,
    ssr: false,
  }
);
