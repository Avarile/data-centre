import { useQuery } from '@tanstack/react-query';
import { getKnowledgeGraph } from '@teable/openapi';
import { ReactQueryKeys } from '@teable/sdk/config';
import { useBaseId } from '@teable/sdk/hooks';

/**
 * `useBaseId()` reads AnchorContext, which BaseLayout provides, and returns
 * undefined outside it — hence `enabled`.
 *
 * The shared QueryCache.onError swallows 4xx on queries, so a failed fetch
 * shows the user nothing on its own. The consuming component must render its
 * own error state.
 */
export const useKnowledgeGraph = () => {
  const baseId = useBaseId();

  return useQuery({
    queryKey: ReactQueryKeys.knowledgeGraph(baseId as string),
    queryFn: ({ queryKey }) => getKnowledgeGraph(queryKey[1]).then((res) => res.data),
    enabled: Boolean(baseId),
    // The graph changes only when someone edits the knowledge tables. 60s keeps
    // a tab-switch cheap while staying inside the window a human calls "fresh".
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
