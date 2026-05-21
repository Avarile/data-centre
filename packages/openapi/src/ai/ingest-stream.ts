import { urlBuilder } from '../utils';
import { z } from '../zod';

export const AI_INGEST_STREAM = '/api/{baseId}/ai/ingest-stream';

export const aiIngestRoSchema = z.object({
  targetTable: z.string().min(1),
  description: z.string().optional(),
});

export type IAiIngestRo = z.infer<typeof aiIngestRoSchema> & {
  files: File[];
};

export const aiIngestStream = (
  baseId: string,
  ro: IAiIngestRo,
  signal?: AbortSignal
): Promise<Response> => {
  const formData = new FormData();
  ro.files.forEach((f) => formData.append('files', f));
  formData.append('targetTable', ro.targetTable);
  if (ro.description) formData.append('description', ro.description);

  return fetch(urlBuilder(AI_INGEST_STREAM, { baseId }), {
    method: 'POST',
    body: formData,
    signal,
  });
};
