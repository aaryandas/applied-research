import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  LearningRecordsBridge,
  LearningWorkspace,
  SourceRecord,
} from '../../contracts/learning-records';
import { SourceImport } from './SourceImport';

function setup() {
  const unavailable = async (): Promise<never> => {
    throw new Error('Unused test operation');
  };
  const bridge: LearningRecordsBridge = {
    getLearningWorkspace: unavailable,
    importTextSource: vi.fn(unavailable),
    saveHighlight: unavailable,
    saveReadingNote: unavailable,
    saveQuestion: unavailable,
    saveInsight: unavailable,
    savePathRevision: unavailable,
    moveLearningRecord: unavailable,
  };
  render(
    <SourceImport
      bridge={bridge}
      projectId="project"
      onImported={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText('Source title'), {
    target: { value: 'Synthetic source' },
  });
  fireEvent.change(screen.getByLabelText('Exact source text'), {
    target: { value: '  Exact 😀\nsource  ' },
  });
  return bridge;
}

describe('pasted-source import preservation', () => {
  it('requires reading the current source and explicit retry after a conflict', async () => {
    const source: SourceRecord = {
      id: 'source',
      projectId: 'project',
      currentRevision: 1,
      currentVersionId: 'v1',
      createdAt: '',
      versions: [],
      currentVersion: {
        sourceId: 'source',
        revisionId: 'v1',
        revision: 1,
        title: 'Old source',
        canonicalText: 'Old text',
        sha256: 'fixture',
        format: 'plain-text',
        canonicalizationVersion: '1',
        acquiredAt: '',
        provenance: {
          kind: 'human-imported',
          locator: 'https://example.org/source',
        },
      },
    };
    const latest: SourceRecord = {
      ...source,
      currentRevision: 2,
      currentVersionId: 'v2',
      currentVersion: {
        ...source.currentVersion,
        revisionId: 'v2',
        revision: 2,
        canonicalText: 'Newer saved source text',
      },
    };
    const workspace: LearningWorkspace = {
      project: {
        id: 'project',
        goal: 'Synthetic',
        createdAt: '',
        updatedAt: '',
      },
      sources: [latest],
      entries: [],
      paths: [],
      highlights: [],
      placements: [],
      unreadableProjects: [],
    };
    const unused = async (): Promise<never> => {
      throw new Error('unused');
    };
    const bridge: LearningRecordsBridge = {
      getLearningWorkspace: vi
        .fn()
        .mockRejectedValueOnce(new Error('read failed'))
        .mockResolvedValue(workspace),
      importTextSource: vi
        .fn<LearningRecordsBridge['importTextSource']>()
        .mockResolvedValueOnce({
          status: 'conflict',
          conflict: {
            code: 'revision-conflict',
            projectId: 'project',
            recordId: 'source',
            expectedRevision: 1,
            currentRevision: 2,
          },
        })
        .mockResolvedValue({
          status: 'committed',
          acknowledgement: {
            projectId: 'project',
            recordId: 'source',
            revision: 3,
            revisionId: 'v3',
            committedAt: '',
            changed: true,
          },
          record: latest,
        }),
      saveHighlight: unused,
      saveReadingNote: unused,
      saveQuestion: unused,
      saveInsight: unused,
      savePathRevision: unused,
      moveLearningRecord: unused,
    };
    const imported = vi.fn();
    const cancel = vi.fn();
    render(
      <SourceImport
        bridge={bridge}
        projectId="project"
        source={source}
        onImported={imported}
        onCancel={cancel}
      />,
    );
    fireEvent.change(screen.getByLabelText('Exact source text'), {
      target: { value: 'My pasted replacement 😀' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import source' }));
    await screen.findByText(/A newer source version exists/);
    expect(
      screen.getByRole('button', { name: 'Import source' }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Load latest revision for retry' }),
    );
    await screen.findByText(/Could not load the latest source/);
    fireEvent.click(
      screen.getByRole('button', { name: 'Load latest revision for retry' }),
    );
    await screen.findByText('Newer saved source text');
    expect(screen.getByLabelText('Exact source text')).toHaveValue(
      'My pasted replacement 😀',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Use revision 2 for my retry' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Import source' }));
    await waitFor(() => expect(imported).toHaveBeenCalledWith(latest));
    expect(vi.mocked(bridge.importTextSource).mock.calls[1]![0]).toMatchObject({
      sourceId: 'source',
      expectedRevision: 2,
      text: 'My pasted replacement 😀',
      locator: 'https://example.org/source',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Discard import' }));
    expect(cancel).toHaveBeenCalledOnce();
  });
  it.each([
    'http://example.com',
    'https://user:password@example.com',
    'javascript:alert(1)',
  ])(
    'refuses unsafe locator %s without sending source text',
    async (locator) => {
      const bridge = setup();
      fireEvent.change(screen.getByLabelText('Source locator (optional)'), {
        target: { value: locator },
      });
      fireEvent.submit(
        screen.getByRole('button', { name: 'Import source' }).closest('form')!,
      );
      expect(await screen.findByRole('alert')).toHaveTextContent('HTTPS');
      expect(bridge.importTextSource).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Exact source text')).toHaveValue(
        '  Exact 😀\nsource  ',
      );
    },
  );
  it('keeps exact pasted text after a failed import and permits retry', async () => {
    const bridge = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Import source' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your text is preserved',
    );
    expect(screen.getByLabelText('Exact source text')).toHaveValue(
      '  Exact 😀\nsource  ',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Import source' }));
    await waitFor(() =>
      expect(bridge.importTextSource).toHaveBeenCalledTimes(2),
    );
    expect(vi.mocked(bridge.importTextSource).mock.calls[0]![0]).toMatchObject({
      projectId: 'project',
      expectedRevision: 0,
      text: '  Exact 😀\nsource  ',
    });
  });
});
