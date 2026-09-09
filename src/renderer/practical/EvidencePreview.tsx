import { useState, type ReactElement } from 'react';
import type { PracticalFilePreviewResult } from '../../contracts/practical-records';
import type { SelectedPracticalFile } from '../../contracts/practical-work';

export function EvidencePreview({
  files,
  previewFile,
  exportFile,
  disabled,
}: Readonly<{
  files: readonly SelectedPracticalFile[];
  previewFile: (selectionId: string) => Promise<PracticalFilePreviewResult>;
  exportFile: (selectionId: string) => Promise<void>;
  disabled: boolean;
}>): ReactElement | null {
  const [preview, setPreview] = useState<PracticalFilePreviewResult | null>(
    null,
  );
  const [message, setMessage] = useState('');
  if (files.length === 0) return null;
  return (
    <div className="practical-evidence-preview">
      {files.map((file) => (
        <div key={file.selectionId} className="practical-actions">
          <span>
            {file.displayName}
            <small className="practical-provenance">
              {file.mediaType} · {file.byteLength.toLocaleString()} bytes ·
              user-selected evidence, not an app measurement or source citation
            </small>
          </span>
          <button
            type="button"
            className="practical-button"
            disabled={disabled}
            onClick={() => {
              setMessage('');
              void previewFile(file.selectionId).then(setPreview, () =>
                setMessage('This retained file could not be previewed.'),
              );
            }}
          >
            Preview
          </button>
          <button
            type="button"
            className="practical-button"
            disabled={disabled}
            onClick={() => {
              setMessage('');
              void exportFile(file.selectionId).catch(() =>
                setMessage('The exact file could not be exported.'),
              );
            }}
          >
            Save a copy
          </button>
        </div>
      ))}
      {preview?.status === 'ready' && (
        <pre className="practical-preview" aria-label="Retained file preview">
          {preview.completeness === 'truncated'
            ? `${preview.text}\n\n[Preview truncated · retained file is complete]`
            : preview.text}
        </pre>
      )}
      {preview?.status === 'unsupported-preview' && (
        <p className="practical-copy" role="status">
          {preview.message}
        </p>
      )}
      {(preview?.status === 'failed' || preview?.status === 'unavailable') && (
        <p className="practical-copy" role="alert">
          This retained file could not be previewed.
        </p>
      )}
      {message && (
        <p className="practical-copy" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
