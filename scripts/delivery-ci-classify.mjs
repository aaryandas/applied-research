#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { classifyDeliveryCi } from './delivery-constants.mjs';

export function classifyFromEnv(env = process.env) {
  return classifyDeliveryCi({
    liveHeadSha: env.LIVE_HEAD_SHA ?? env.HEAD_SHA,
    ciGateResult: env.CI_GATE_RESULT,
    workflowSha: env.WORKFLOW_SHA ?? env.GITHUB_SHA,
    linearKind: env.LINEAR_KIND,
    checks: [
      env.WINDOWS_CONCLUSION
        ? {
            name: 'checks / Verify (windows-latest)',
            conclusion: env.WINDOWS_CONCLUSION,
            head_sha: env.LIVE_HEAD_SHA ?? env.HEAD_SHA,
          }
        : null,
    ].filter(Boolean),
  });
}

export function main(env = process.env, { log = console } = {}) {
  const result = classifyFromEnv(env);
  log.log(JSON.stringify(result));
  if (result.action === 'ignore') {
    log.log(result.reason);
  }
  return result;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
