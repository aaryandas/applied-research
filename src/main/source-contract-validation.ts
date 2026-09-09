import { createHash } from 'node:crypto';
import { createSourceContractValidation } from '../contracts/source-contract-validation';
export { SourcingContractValidationError } from '../contracts/source-contract-validation';
export function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
export const {
  parseDiscoverSourcesRequest,
  parseAcquireCanonicalSourceRequest,
  parseDiscoverSourcesResponse,
  parseAcquireCanonicalSourceResponse,
  parseStoredAcquiredSource,
} = createSourceContractValidation(sha256Text);
