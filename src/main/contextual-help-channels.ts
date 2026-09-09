import {
  CONTEXTUAL_HELP_CANCEL_CHANNEL,
  CONTEXTUAL_HELP_REQUEST_CHANNEL,
} from '../contracts/contextual-help';

/** Extra named operations. AR-56 registers these beside the frozen request/cancel channels. */
export const CONTEXTUAL_HELP_CHANNELS = {
  request: CONTEXTUAL_HELP_REQUEST_CHANNEL,
  cancel: CONTEXTUAL_HELP_CANCEL_CHANNEL,
  load: 'learning:load-retained-explanation',
  list: 'learning:list-retained-explanations',
  saveScene: 'learning:save-explanation-scene-state',
  loadScene: 'learning:load-explanation-scene-state',
  capture: 'learning:accept-scene-capture',
  loadCapture: 'learning:load-trusted-scene-capture',
} as const;
