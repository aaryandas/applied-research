import { useState } from 'react';
import { ARM_LIMITS, type ArmParameters } from '../../contracts/explanations';

export type ArmField = keyof ArmParameters;
export type ArmDrafts = Record<ArmField, string>;
export const ARM_FIELDS = Object.keys(ARM_LIMITS) as ArmField[];

function draftStrings(parameters: ArmParameters): ArmDrafts {
  return {
    firstLength: String(parameters.firstLength),
    secondLength: String(parameters.secondLength),
    shoulderDegrees: String(parameters.shoulderDegrees),
    elbowDegrees: String(parameters.elbowDegrees),
  };
}
export function parseArmDraft(field: ArmField, draft: string): number | null {
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(draft)) return null;
  const number = Number(draft);
  const { min, max } = ARM_LIMITS[field];
  return Number.isFinite(number) && number >= min && number <= max
    ? number
    : null;
}
interface InputState {
  parameters: ArmParameters;
  drafts: ArmDrafts;
  focused: ArmField | null;
}
export interface ArmInputs {
  drafts: ArmDrafts;
  hasUnfinishedInputs: boolean;
  edit: (field: ArmField, draft: string) => void;
  focus: (field: ArmField | null) => void;
  reset: (parameters: ArmParameters) => void;
}
export function useArmInputs(
  parameters: ArmParameters,
  onChange: (parameters: ArmParameters) => void,
): ArmInputs {
  const [state, setState] = useState<InputState>(() => ({
    parameters,
    drafts: draftStrings(parameters),
    focused: null,
  }));
  if (state.parameters !== parameters) {
    const drafts = { ...state.drafts };
    for (const field of ARM_FIELDS) {
      const changedExternally = state.parameters[field] !== parameters[field];
      const representsCommittedValue =
        parseArmDraft(field, drafts[field]) === parameters[field];
      if (
        changedExternally &&
        field !== state.focused &&
        !representsCommittedValue
      )
        drafts[field] = String(parameters[field]);
    }
    setState({ ...state, parameters, drafts });
  }
  return {
    drafts: state.drafts,
    hasUnfinishedInputs: ARM_FIELDS.some(
      (field) =>
        parseArmDraft(field, state.drafts[field]) !== parameters[field],
    ),
    edit(field, draft) {
      setState((previous) => ({
        ...previous,
        drafts: { ...previous.drafts, [field]: draft },
      }));
      const number = parseArmDraft(field, draft);
      if (number !== null) onChange({ ...parameters, [field]: number });
    },
    focus(focused) {
      setState((previous) => ({ ...previous, focused }));
    },
    reset(next) {
      setState({ parameters: next, drafts: draftStrings(next), focused: null });
    },
  };
}
