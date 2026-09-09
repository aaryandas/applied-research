import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ATTACHMENT_LINK_MUTATION,
  LinearGraphqlError,
  TEAM_ISSUE_QUERY,
  confirmExactIssueUrl,
  ensureIssueHasPrUrl,
  isDuplicateAttachmentError,
  isSuccessfulAttachmentLink,
  issueHasExactAttachmentUrl,
  linearGraphql,
  main,
  parseLinearGraphqlErrors,
  queryTeamIssue,
} from './linear-gate.mjs';

const ISSUE_ID = 'issue-ar-50';
const IDENTIFIER = 'AR-50';
const PR_URL = 'https://github.com/aaryandas/applied-research/pull/70';
const OTHER_URL = 'https://github.com/aaryandas/applied-research/pull/99';

function duplicateAttachmentError() {
  return new LinearGraphqlError(
    [
      {
        message: 'Duplicate attachment for duplicate url',
        path: ['attachmentLinkURL'],
        extensions: {
          type: 'invalid input',
          code: 'INPUT_ERROR',
          statusCode: 400,
          userError: true,
          userPresentableMessage:
            'An attachment with the same URL already exists.',
        },
      },
    ],
    { httpStatus: 400 },
  );
}

function issueRecord({ id = ISSUE_ID, urls = [] } = {}) {
  return {
    id,
    identifier: IDENTIFIER,
    state: { name: 'In Development' },
    attachments: { nodes: urls.map((url) => ({ url })) },
  };
}

function issueQueryData(issue) {
  return { issues: { nodes: issue ? [issue] : [] } };
}

test('duplicate attachment detection requires INPUT_ERROR plus the live message', () => {
  assert.equal(isDuplicateAttachmentError(duplicateAttachmentError()), true);
  assert.equal(
    isDuplicateAttachmentError(
      new LinearGraphqlError([
        {
          message: 'Issue not found',
          extensions: { code: 'INPUT_ERROR', statusCode: 400 },
        },
      ]),
    ),
    false,
  );
  assert.equal(
    isDuplicateAttachmentError(
      new Error('Duplicate attachment for duplicate url'),
    ),
    false,
  );
  assert.equal(isDuplicateAttachmentError(new Error('network down')), false);
  const mixed = new LinearGraphqlError([
    {
      message: 'Duplicate attachment for duplicate url',
      extensions: { code: 'INPUT_ERROR', statusCode: 400 },
    },
    {
      message: 'Authentication required',
      extensions: { code: 'AUTHENTICATION_ERROR', statusCode: 401 },
    },
  ]);
  assert.equal(parseLinearGraphqlErrors(mixed).length, 2);
  assert.equal(isDuplicateAttachmentError(mixed), false);
  assert.deepEqual(
    parseLinearGraphqlErrors(duplicateAttachmentError()).length,
    1,
  );
});

test('existing exact PR URL does not call attachmentLinkURL', async () => {
  const calls = [];
  const issue = issueRecord({ urls: [PR_URL] });
  const result = await ensureIssueHasPrUrl({
    gql: async (query, variables) => {
      calls.push({ query, variables });
      throw new Error('must not GraphQL');
    },
    issue,
    identifier: IDENTIFIER,
    prUrl: PR_URL,
    title: 'PR',
  });
  assert.equal(result.status, 'already-linked');
  assert.equal(result.reason, 'existing-attachment');
  assert.equal(calls.length, 0);
  assert.equal(issueHasExactAttachmentUrl(issue, PR_URL), true);
  assert.equal(issueHasExactAttachmentUrl(issue, OTHER_URL), false);
});

test('concurrent duplicate attachmentLinkURL is confirmed on the intended issue', async () => {
  const urls = [];
  const waiting = [];
  let waiters = 0;
  const waitForPeer = () =>
    new Promise((resolve) => {
      waiters += 1;
      waiting.push(resolve);
      if (waiters >= 2) {
        for (const release of waiting.splice(0)) release();
        waiters = 0;
      }
    });
  const gql = async (query, variables) => {
    if (query === TEAM_ISSUE_QUERY) {
      return issueQueryData(issueRecord({ urls: [...urls] }));
    }
    if (query === ATTACHMENT_LINK_MUTATION) {
      await waitForPeer();
      if (urls.includes(variables.url)) {
        throw duplicateAttachmentError();
      }
      urls.push(variables.url);
      return { attachmentLinkURL: { success: true } };
    }
    throw new Error(`unexpected query ${query}`);
  };
  const stale = issueRecord({ urls: [] });
  const [first, second] = await Promise.all([
    ensureIssueHasPrUrl({
      gql,
      issue: stale,
      identifier: IDENTIFIER,
      prUrl: PR_URL,
      title: 'PR',
    }),
    ensureIssueHasPrUrl({
      gql,
      issue: stale,
      identifier: IDENTIFIER,
      prUrl: PR_URL,
      title: 'PR',
    }),
  ]);
  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, ['already-linked', 'created']);
  assert.equal(urls.length, 1);
  assert.equal(urls[0], PR_URL);
  const confirmed = [first, second].find(
    (entry) => entry.status === 'already-linked',
  );
  assert.equal(confirmed.reason, 'duplicate-confirmed');
});

test('genuine Linear errors are not treated as a successful link', async () => {
  await assert.rejects(
    () =>
      ensureIssueHasPrUrl({
        gql: async () => {
          throw new LinearGraphqlError(
            [
              {
                message: 'Authentication required',
                extensions: { code: 'AUTHENTICATION_ERROR', statusCode: 401 },
              },
            ],
            { httpStatus: 401 },
          );
        },
        issue: issueRecord(),
        identifier: IDENTIFIER,
        prUrl: PR_URL,
        title: 'PR',
      }),
    (error) => {
      assert.equal(isDuplicateAttachmentError(error), false);
      assert.match(error.message, /Authentication required/);
      return true;
    },
  );
});

test('duplicate error still fails when the intended URL is missing', async () => {
  await assert.rejects(
    () =>
      ensureIssueHasPrUrl({
        gql: async (query) => {
          if (query === ATTACHMENT_LINK_MUTATION) {
            throw duplicateAttachmentError();
          }
          return issueQueryData(issueRecord({ urls: [OTHER_URL] }));
        },
        issue: issueRecord(),
        identifier: IDENTIFIER,
        prUrl: PR_URL,
        title: 'PR',
      }),
    /still has no matching attachment/,
  );
});

test('duplicate error still fails for the wrong issue identity', async () => {
  await assert.rejects(
    () =>
      confirmExactIssueUrl({
        gql: async () =>
          issueQueryData(issueRecord({ id: 'other-issue', urls: [PR_URL] })),
        identifier: IDENTIFIER,
        issueId: ISSUE_ID,
        url: PR_URL,
      }),
    /not intended issue/,
  );
});

test('duplicate error fails closed when the issue is missing on re-query', async () => {
  await assert.rejects(
    () =>
      ensureIssueHasPrUrl({
        gql: async (query) => {
          if (query === ATTACHMENT_LINK_MUTATION) {
            throw duplicateAttachmentError();
          }
          return issueQueryData(null);
        },
        issue: issueRecord(),
        identifier: IDENTIFIER,
        prUrl: PR_URL,
        title: 'PR',
      }),
    /missing after a duplicate attachment error/,
  );
});

test('mixed duplicate and AUTHENTICATION_ERROR fails even if the exact URL exists', async () => {
  const mixed = new LinearGraphqlError(
    [
      {
        message: 'Duplicate attachment for duplicate url',
        path: ['attachmentLinkURL'],
        extensions: {
          type: 'invalid input',
          code: 'INPUT_ERROR',
          statusCode: 400,
          userError: true,
          userPresentableMessage:
            'An attachment with the same URL already exists.',
        },
      },
      {
        message: 'Authentication required',
        extensions: { code: 'AUTHENTICATION_ERROR', statusCode: 401 },
      },
    ],
    { httpStatus: 400 },
  );
  assert.equal(isDuplicateAttachmentError(mixed), false);
  await assert.rejects(
    () =>
      ensureIssueHasPrUrl({
        gql: async (query) => {
          if (query === ATTACHMENT_LINK_MUTATION) {
            throw mixed;
          }
          return issueQueryData(issueRecord({ urls: [PR_URL] }));
        },
        issue: issueRecord(),
        identifier: IDENTIFIER,
        prUrl: PR_URL,
        title: 'PR',
      }),
    (error) => {
      assert.equal(isDuplicateAttachmentError(error), false);
      assert.match(
        error.message,
        /AUTHENTICATION_ERROR|Authentication required/,
      );
      return true;
    },
  );
});

test('rejected or malformed attachmentLinkURL payload is not created', async () => {
  const payloads = [
    { attachmentLinkURL: { success: false } },
    { attachmentLinkURL: null },
    {},
    undefined,
    { attachmentLinkURL: { success: 'true' } },
  ];
  for (const data of payloads) {
    assert.equal(isSuccessfulAttachmentLink(data), false);
    await assert.rejects(
      () =>
        ensureIssueHasPrUrl({
          gql: async (query) => {
            if (query === TEAM_ISSUE_QUERY) {
              throw new Error('must not re-query a malformed create');
            }
            return data;
          },
          issue: issueRecord(),
          identifier: IDENTIFIER,
          prUrl: PR_URL,
          title: 'PR',
        }),
      /success:true payload/,
    );
  }
  assert.equal(
    isSuccessfulAttachmentLink({ attachmentLinkURL: { success: true } }),
    true,
  );
});

test('HTTP 200 empty GraphQL data is not a created link', async () => {
  await assert.rejects(
    () =>
      ensureIssueHasPrUrl({
        gql: async (query, variables) =>
          linearGraphql(query, variables, {
            apiKey: 'lin_api_test',
            fetchImpl: async () => ({
              status: 200,
              ok: true,
              async json() {
                return { data: {} };
              },
            }),
          }),
        issue: issueRecord(),
        identifier: IDENTIFIER,
        prUrl: PR_URL,
        title: 'PR',
      }),
    /success:true payload/,
  );
  await assert.rejects(
    () =>
      ensureIssueHasPrUrl({
        gql: async (query, variables) =>
          linearGraphql(query, variables, {
            apiKey: 'lin_api_test',
            fetchImpl: async () => ({
              status: 200,
              ok: true,
              async json() {
                return { data: { attachmentLinkURL: { success: false } } };
              },
            }),
          }),
        issue: issueRecord(),
        identifier: IDENTIFIER,
        prUrl: PR_URL,
        title: 'PR',
      }),
    /success:true payload/,
  );
});

test('queryTeamIssue returns the AR team node or null', async () => {
  const found = await queryTeamIssue(IDENTIFIER, async (query, variables) => {
    assert.equal(query, TEAM_ISSUE_QUERY);
    assert.equal(variables.n, 50);
    return issueQueryData(issueRecord({ urls: [PR_URL] }));
  });
  assert.equal(found.identifier, IDENTIFIER);
  const missing = await queryTeamIssue(IDENTIFIER, async () =>
    issueQueryData(null),
  );
  assert.equal(missing, null);
});

test('linearGraphql fail-closes HTTP and unrelated GraphQL errors', async () => {
  await assert.rejects(
    () => linearGraphql(TEAM_ISSUE_QUERY, { n: 50 }, { apiKey: '' }),
    /LINEAR_API_KEY is missing/,
  );
  await assert.rejects(
    () =>
      linearGraphql(
        TEAM_ISSUE_QUERY,
        { n: 50 },
        {
          apiKey: 'lin_api_test',
          fetchImpl: async () => ({
            status: 500,
            ok: false,
            async json() {
              return { errors: [{ message: 'backend unavailable' }] };
            },
          }),
        },
      ),
    (error) => {
      assert.equal(error instanceof LinearGraphqlError, true);
      assert.equal(isDuplicateAttachmentError(error), false);
      return true;
    },
  );
  await assert.rejects(
    () =>
      linearGraphql(
        TEAM_ISSUE_QUERY,
        { n: 50 },
        {
          apiKey: 'lin_api_test',
          fetchImpl: async () => ({
            status: 502,
            ok: false,
            async json() {
              throw new Error('no json');
            },
          }),
        },
      ),
    /returned 502/,
  );
});

test('draft In Development stays green and does not move Linear status', async () => {
  const logs = [];
  const mutations = [];
  const result = await main(
    {
      LINEAR_API_KEY: 'lin_api_test',
      HEAD_REF: 'codex/ar-50-reflection-readiness',
      PR_BODY: 'Linear: AR-50\n\nRepair details.',
      PR_URL,
      PR_TITLE: 'AR-50: reflection',
      PR_STATE: 'open',
      PR_DRAFT: 'true',
      LABELS: 'lane:practical',
    },
    {
      log: {
        log: (line) => logs.push(String(line)),
        error: (line) => logs.push(String(line)),
      },
      gql: async (query, variables) => {
        if (query === TEAM_ISSUE_QUERY) {
          return issueQueryData(issueRecord({ urls: [PR_URL] }));
        }
        mutations.push({ query, variables });
        throw new Error('must not link again');
      },
    },
  );
  assert.equal(result.exitCode, 0);
  assert.equal(result.kind, 'expected-lifecycle');
  assert.equal(result.link.status, 'already-linked');
  assert.equal(mutations.length, 0);
  assert.match(logs.join('\n'), /expected-lifecycle/);
  assert.equal(logs.join('\n').includes('move Linear status'), true);
});

test('integration lane is exempt without Linear I/O', async () => {
  let called = false;
  const result = await main(
    { LABELS: 'lane:integration', LINEAR_API_KEY: 'lin_api_test' },
    {
      log: { log() {}, error() {} },
      gql: async () => {
        called = true;
        throw new Error('must not query Linear');
      },
    },
  );
  assert.equal(result.kind, 'exempt');
  assert.equal(result.exitCode, 0);
  assert.equal(called, false);
});
