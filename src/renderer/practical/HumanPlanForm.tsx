import { useState, type ReactElement } from 'react';
import type { PracticalHumanPlan } from '../../contracts/practical-records';
import { PracticalField } from './PracticalField';

export function HumanPlanDraft({
  initial,
  disabled,
  onSave,
}: Readonly<{
  initial: PracticalHumanPlan;
  disabled: boolean;
  onSave: (plan: PracticalHumanPlan) => void;
}>): ReactElement {
  const [plan, setPlan] = useState(initial);
  return (
    <HumanPlanForm
      plan={plan}
      disabled={disabled}
      onChange={setPlan}
      onSave={() => onSave(plan)}
    />
  );
}

export function HumanPlanForm({
  plan,
  disabled,
  onChange,
  onSave,
}: Readonly<{
  plan: PracticalHumanPlan;
  disabled: boolean;
  onChange: (plan: PracticalHumanPlan) => void;
  onSave: () => void;
}>): ReactElement {
  return (
    <section className="practical-section" aria-label="Human-authored plan">
      <h2 className="practical-subheading">Human-authored plan</h2>
      <p className="practical-copy practical-muted">
        This plan is your writing. It is not a generated capstone and is not AI
        guidance.
      </p>
      <PracticalField
        label="Outcome"
        attribution="Human-authored"
        value={plan.outcome}
        onChange={(outcome) => onChange({ ...plan, outcome })}
      />
      <PracticalField
        label="Setup"
        attribution="Human-authored"
        value={plan.setup}
        onChange={(setup) => onChange({ ...plan, setup })}
      />
      <PracticalField
        label="Deliverable"
        attribution="Human-authored"
        value={plan.deliverable}
        onChange={(deliverable) => onChange({ ...plan, deliverable })}
      />
      <PracticalField
        label="How you will evaluate it"
        attribution="Human-authored"
        value={plan.evaluation}
        onChange={(evaluation) => onChange({ ...plan, evaluation })}
      />
      <PracticalField
        label="Reflection prompt"
        attribution="Human-authored"
        value={plan.reflectionPrompt}
        onChange={(reflectionPrompt) => onChange({ ...plan, reflectionPrompt })}
      />
      {plan.milestones.map((milestone, index) => (
        <article key={milestone.id} className="practical-milestone">
          <PracticalField
            label={`Milestone ${index + 1} title`}
            attribution="Human-authored"
            value={milestone.title}
            onChange={(title) =>
              onChange({
                ...plan,
                milestones: plan.milestones.map((item) =>
                  item.id === milestone.id ? { ...item, title } : item,
                ),
              })
            }
          />
          <PracticalField
            label="Description"
            attribution="Human-authored"
            value={milestone.description}
            onChange={(description) =>
              onChange({
                ...plan,
                milestones: plan.milestones.map((item) =>
                  item.id === milestone.id ? { ...item, description } : item,
                ),
              })
            }
          />
          <PracticalField
            label="Expected result"
            attribution="Human-authored"
            value={milestone.expectedResult}
            onChange={(expectedResult) =>
              onChange({
                ...plan,
                milestones: plan.milestones.map((item) =>
                  item.id === milestone.id ? { ...item, expectedResult } : item,
                ),
              })
            }
          />
        </article>
      ))}
      <div className="practical-actions">
        <button
          type="button"
          className="practical-button"
          disabled={disabled}
          onClick={() =>
            onChange({
              ...plan,
              milestones: [
                ...plan.milestones,
                {
                  id: crypto.randomUUID(),
                  title: '',
                  description: '',
                  expectedResult: '',
                },
              ],
            })
          }
        >
          Add a milestone
        </button>
        <button
          type="button"
          className="practical-button"
          disabled={disabled}
          onClick={onSave}
        >
          Save human plan
        </button>
      </div>
    </section>
  );
}
