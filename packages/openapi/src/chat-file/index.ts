import { axios } from '../axios';
import { registerRoute, urlBuilder } from '../utils';
import { z } from '../zod';

export const CHAT_FILE_BASE_URL = '/{baseId}/chat-files';
export const CHAT_FILE_ITEM_URL = '/{baseId}/chat-files/{fileId}';

// ---- Schemas ----

export const chatFileVoSchema = z.object({
  id: z.string(),
  token: z.string(),
  name: z.string(),
  size: z.number(),
  mimetype: z.string(),
  path: z.string(),
  baseId: z.string(),
  createdBy: z.string(),
  createdTime: z.string(),
});

export type IChatFileVo = z.infer<typeof chatFileVoSchema>;

export const saveChatFileRoSchema = z.object({
  token: z.string(),
  name: z.string(),
  size: z.number(),
  mimetype: z.string(),
  path: z.string(),
});

export type ISaveChatFileRo = z.infer<typeof saveChatFileRoSchema>;

// ---- Routes ----

export const listChatFilesRoute = registerRoute({
  method: 'get',
  path: CHAT_FILE_BASE_URL,
  description: 'List chat files for a base',
  request: {
    params: z.object({ baseId: z.string() }),
  },
  responses: {
    200: {
      description: 'List of chat files',
      content: {
        'application/json': {
          schema: z.array(chatFileVoSchema),
        },
      },
    },
  },
  tags: ['chat-file'],
});

export const saveChatFileRoute = registerRoute({
  method: 'post',
  path: CHAT_FILE_BASE_URL,
  description: 'Save a chat file reference after upload',
  request: {
    params: z.object({ baseId: z.string() }),
    body: {
      content: {
        'application/json': {
          schema: saveChatFileRoSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Saved chat file',
      content: {
        'application/json': {
          schema: chatFileVoSchema,
        },
      },
    },
  },
  tags: ['chat-file'],
});

export const deleteChatFileRoute = registerRoute({
  method: 'delete',
  path: CHAT_FILE_ITEM_URL,
  description: 'Delete a chat file',
  request: {
    params: z.object({ baseId: z.string(), fileId: z.string() }),
  },
  responses: {
    200: {
      description: 'Deleted successfully',
    },
  },
  tags: ['chat-file'],
});

// ---- API Functions ----

export const listChatFiles = (baseId: string) => {
  return axios.get<IChatFileVo[]>(urlBuilder(CHAT_FILE_BASE_URL, { baseId }));
};

export const saveChatFile = (baseId: string, data: ISaveChatFileRo) => {
  return axios.post<IChatFileVo>(urlBuilder(CHAT_FILE_BASE_URL, { baseId }), data);
};

export const deleteChatFile = (baseId: string, fileId: string) => {
  return axios.delete(urlBuilder(CHAT_FILE_ITEM_URL, { baseId, fileId }));
};
