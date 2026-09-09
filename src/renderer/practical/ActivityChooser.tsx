import type { ReactElement } from 'react';
import type { PracticalActivity } from '../../contracts/practical-work';

export function ActivityChooser({
  activities,
  onSelect,
}: Readonly<{
  activities: readonly PracticalActivity[];
  onSelect: (activity: PracticalActivity) => void;
}>): ReactElement {
  return (
    <section className="practical-work" aria-label="Practical work">
      <h1 className="practical-heading">Practical work</h1>
      {activities.length === 0 ? (
        <p className="practical-copy">
          No saved lesson activities are available in this project yet. Open a
          lesson that includes an activity, then return here. A generated course
          brief is not available until an accepted course produces one.
        </p>
      ) : (
        <>
          <p className="practical-copy">
            Choose a saved lesson activity. Each item keeps its exact project,
            path, revision, topic, lesson and source origin.
          </p>
          <ul className="practical-activity-list">
            {activities.map((activity) => {
              const { path } = activity.origin;
              return (
                <li
                  key={`${path.pathId}:${path.lessonId}:${path.pathRevision}`}
                >
                  <button
                    type="button"
                    className="practical-button"
                    onClick={() => onSelect(activity)}
                  >
                    {activity.title}
                    <small className="practical-provenance">
                      {activity.objective}
                    </small>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
