import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LearningWorkspace } from '../../contracts/learning-records';
import { createCanvasFixture } from '../canvas/canvas-fixture';
import { ReaderSidebar } from './ReaderSidebar';

const workspace: LearningWorkspace = {
  project: {
    id: 'project',
    goal: 'Learning robotics',
    createdAt: '',
    updatedAt: '',
  },
  entries: [],
  sources: [],
  highlights: [],
  paths: [],
  placements: [],
  unreadableProjects: [],
};

describe('ReaderSidebar collapse', () => {
  it('follows the automatic Canvas collapse and restores when leaving', () => {
    const { rerender } = render(
      <ReaderSidebar
        workspace={workspace}
        onNavigate={vi.fn()}
        onLesson={vi.fn()}
        destination="canvas"
        collapsed
      />,
    );
    const nav = screen.getByRole('navigation', { name: 'Project navigation' });
    expect(nav).toHaveClass('shell-icon-rail');
    const toggle = screen.getByRole('button', { name: 'Expand sidebar' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.getByRole('button', { name: 'Applied Research home' }),
    ).not.toHaveAttribute('aria-expanded');
    fireEvent.click(toggle);
    expect(nav).not.toHaveClass('shell-icon-rail');
    expect(
      screen.getByRole('button', { name: 'Collapse sidebar' }),
    ).toHaveAttribute('aria-expanded', 'true');
    rerender(
      <ReaderSidebar
        workspace={workspace}
        onNavigate={vi.fn()}
        onLesson={vi.fn()}
        destination="reader"
        collapsed={false}
      />,
    );
    expect(nav).not.toHaveClass('shell-icon-rail');
    expect(
      screen.getByRole('button', { name: 'Collapse sidebar' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('allows collapsing while reading without changing Home', () => {
    const onNavigate = vi.fn();
    render(
      <ReaderSidebar
        workspace={workspace}
        onNavigate={onNavigate}
        onLesson={vi.fn()}
        destination="reader"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(
      screen.getByRole('navigation', { name: 'Project navigation' }),
    ).toHaveClass('shell-icon-rail');
    fireEvent.click(
      screen.getByRole('button', { name: 'Applied Research home' }),
    );
    expect(onNavigate).toHaveBeenCalledWith('home');
  });

  it('opens a saved chapter from the outline while expanded', () => {
    const onLesson = vi.fn();
    render(
      <ReaderSidebar
        workspace={createCanvasFixture()}
        onNavigate={vi.fn()}
        onLesson={onLesson}
        selectedLessonId="lesson"
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Joint angles and hand position/ }),
    );
    expect(onLesson).toHaveBeenCalledWith({
      pathId: 'path',
      pathRevision: 1,
      topicId: 'topic',
      lessonId: 'lesson',
    });
  });
});
