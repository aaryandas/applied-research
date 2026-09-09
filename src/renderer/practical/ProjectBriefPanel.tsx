import type { ReactElement } from 'react';
import type { RetainedPracticalBrief } from '../../contracts/practical-brief';
import { projectPracticeTool } from '../../contracts/practical-brief';
import type { PracticalActivity } from '../../contracts/practical-work';

export function ProjectBriefPanel({
  activity,
  brief,
}: Readonly<{
  activity: PracticalActivity;
  brief: RetainedPracticalBrief | null;
}>): ReactElement {
  if (!brief)
    return (
      <section className="practical-section" aria-label="Project brief">
        <h2 className="practical-subheading">{activity.title}</h2>
        <p className="practical-copy practical-objective">
          {activity.objective}
        </p>
        <p className="practical-copy practical-instructions">
          {activity.instructions}
        </p>
        <p className="practical-copy practical-muted">
          This workspace uses the saved lesson activity. A generated course
          brief or capstone is not available. You can add a human-authored plan
          below. User-reported completion is not mastery.
        </p>
        <p className="practical-provenance">
          Provenance: saved lesson activity · no reviewed course-practice
          binding
        </p>
      </section>
    );
  const { brief: body, provenance } = brief;
  const tool = projectPracticeTool(body.tool);
  return (
    <section className="practical-section" aria-label="Project brief">
      <h2 className="practical-subheading">{activity.title}</h2>
      <p className="practical-provenance">
        Retained course-practice binding · proposal revision{' '}
        {brief.briefRevision} · not a reviewed AR-52 producer result
      </p>
      <h3 className="practical-subheading">Outcome</h3>
      <p className="practical-copy">{body.intendedOutcome}</p>
      <h3 className="practical-subheading">Setup</h3>
      <p className="practical-copy">{body.setup}</p>
      <h3 className="practical-subheading">Tools</h3>
      <p className="practical-copy">
        {tool.kind === 'supported-embedded'
          ? `Supported in-app tool: ${tool.label}. Optional; it does not auto-launch.`
          : `External setup (does not auto-launch): ${tool.label}. ${tool.instructions}`}
      </p>
      <h3 className="practical-subheading">Instructions</h3>
      <p className="practical-copy practical-instructions">
        {body.instructions}
      </p>
      <h3 className="practical-subheading">Deliverable</h3>
      <p className="practical-copy">{body.expectedArtifact}</p>
      {provenance.capstone ? (
        <>
          <h3 className="practical-subheading">Capstone</h3>
          <p className="practical-copy">{provenance.capstone.outcome}</p>
          <p className="practical-copy practical-muted">
            User-reported completion of this project is not mastery.
          </p>
        </>
      ) : (
        <p className="practical-copy practical-muted">
          No generated capstone is included in this accepted brief.
        </p>
      )}
      <p className="practical-copy practical-muted">{body.reflectionPrompt}</p>
    </section>
  );
}
