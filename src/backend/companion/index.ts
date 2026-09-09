export {
  COMPANION_BACKEND_API_VERSION,
  COMPANION_GUIDANCE_PATH,
  decodeCompanionBackendEnvelope,
  failureReply,
  type CompanionBackendEnvelope,
  type CompanionGuidanceHttpReply,
} from './envelope.js';
export {
  handleCompanionGuidanceRoute,
  matchCompanionGuidanceRoute,
  companionGuidanceStatus,
  type CompanionGuidanceHttpDependencies,
} from './http.js';
export {
  makeCompanionGuidanceService,
  type AdmittedSourceDigest,
  type CompanionGuidanceService,
  type CompanionGuidanceServiceOptions,
} from './service.js';
