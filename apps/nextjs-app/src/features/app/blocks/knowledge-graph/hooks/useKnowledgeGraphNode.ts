import { useQuery } from '@tanstack/react-query';
import { getKnowledgeGraphNode } from '@teable/openapi';
import { ReactQueryKeys } from '@teable/sdk/config';
import { useBaseId } from '@teable/sdk/hooks';

/**
 * Detail for one node. Synthetic nodes (`core`, the unclassified bucket) have no
 * backing record and 404 by design, so callers must not request them.
 */
export const useKnowledgeGraphNode = (nodeId: string | null) => {
  const baseId = useBaseId();

  return useQuery({
    queryKey: ReactQueryKeys.knowledgeGraphNode(baseId as string, nodeId as string),
    queryFn: ({ queryKey }) =>
      getKnowledgeGraphNode(queryKey[1], queryKey[2]).then((res) => res.data),
    enabled: Boolean(baseId && nodeId),
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
