import { event, publishStatus } from './workflow-api.mjs';
const context = process.env.GATE_CONTEXT;
if (!['Lane guard', 'Fable review', 'Linear gate'].includes(context))
  throw new Error('Unknown gate');
if (!event.merge_group) throw new Error('Expected merge_group event');
// No constituent status is trusted or carried forward: native queue mode is unsupported.
await publishStatus(event.merge_group.head_sha, {
  context,
  state: 'failure',
  description:
    'Native merge queue is disabled by design; Luna must serialize direct merges.',
});
process.exitCode = 1;
