import { expect, it } from 'vitest';
import {
  GENERATION_EVAL_ALLOWANCE_ID,
  GENERATION_EVAL_ALLOWANCE_NAME,
  GENERATION_EVAL_LIMIT_DISPATCHES,
  GENERATION_EVAL_LIMIT_MICROUSD,
} from './generation-eval.js';

it('uses the shared AR-48 generation-eval allowance identity and $2/10 cap', () => {
  expect(GENERATION_EVAL_ALLOWANCE_NAME).toBe('generation-eval');
  expect(GENERATION_EVAL_ALLOWANCE_ID).toBe(
    'ar48-generation-evaluation-2026-09-09',
  );
  expect(GENERATION_EVAL_LIMIT_MICROUSD).toBe(2_000_000);
  expect(GENERATION_EVAL_LIMIT_DISPATCHES).toBe(10);
});
