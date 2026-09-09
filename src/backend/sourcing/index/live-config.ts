import {
  TURBOPUFFER_OREGON_REGIONS,
  type TurbopufferRegion,
} from '../../policy.js';

export const isAllowedTurbopufferRegion = (
  region: string,
): region is TurbopufferRegion =>
  (TURBOPUFFER_OREGON_REGIONS as readonly string[]).includes(region);

export const turbopufferNamespaceUrl = (
  region: TurbopufferRegion,
  namespace: string,
): string =>
  `https://${region}.turbopuffer.com/v2/namespaces/${encodeURIComponent(namespace)}`;
