import { Workspace, LocalFilesystem } from '@mastra/core/workspace';
import { SkillSearchProcessor } from '@mastra/core/processors';

export const sharedWorkspace = new Workspace({
  filesystem: new LocalFilesystem({
    basePath: './src/mastra',
  }),
  skills: ['skills'],
  bm25: true,
});

export const skillSearchProcessor = new SkillSearchProcessor({
  workspace: sharedWorkspace,
  search: {
    topK: 5,
    minScore: 0.3,
  },
});
