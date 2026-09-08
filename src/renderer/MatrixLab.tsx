import { useState, type ReactElement } from 'react';
import { determinant, transformPoint, type Matrix } from './math';
import { Icon } from './FieldAtlas';

export function MatrixLab({
  onCapture,
}: {
  onCapture: (body: string) => void;
}): ReactElement {
  const [matrix, setMatrix] = useState<Matrix>([1, 0.5, 0, 1]);
  const polygon = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]
    .map(([x, y]) => transformPoint(matrix, [x!, y!]).join(','))
    .join(' ');
  const vector = transformPoint(matrix, [1, 1]);
  const area = determinant(matrix);
  return (
    <div className="matrix-lab">
      <p className="lab-prompt">
        Predict what happens to a square when you change one number.
      </p>
      <svg
        viewBox="0 0 320 260"
        role="img"
        aria-label="The original unit square and its matrix transformation"
      >
        <g transform="translate(160 150) scale(44 -44)">
          {Array.from({ length: 9 }, (_, index) => index - 4).map((offset) => (
            <g key={offset} stroke="var(--line)" strokeWidth="0.015">
              <path d={`M ${offset} -4 V 4 M -4 ${offset} H 4`} />
            </g>
          ))}
          <path
            d="M -4 0 H 4 M 0 -4 V 4"
            stroke="var(--muted)"
            strokeWidth="0.025"
          />
          <rect
            width="1"
            height="1"
            fill="none"
            stroke="var(--muted)"
            strokeWidth="0.025"
            strokeDasharray="0.08 0.06"
          />
          <polygon
            points={polygon}
            fill="var(--accent-soft)"
            stroke="var(--accent)"
            strokeWidth="0.035"
          />
          <path
            d={`M 0 0 L ${vector[0]} ${vector[1]}`}
            stroke="var(--human)"
            strokeWidth="0.04"
          />
          <circle cx={vector[0]} cy={vector[1]} r="0.07" fill="var(--human)" />
        </g>
      </svg>
      <div className="matrix-controls">
        {['a', 'b', 'c', 'd'].map((label, index) => (
          <label key={label}>
            {label} <output>{matrix[index]?.toFixed(1)}</output>
            <input
              aria-label={`Matrix ${label}`}
              type="range"
              min="-2"
              max="2"
              step="0.1"
              value={matrix[index]}
              onChange={(event) => {
                const next: [number, number, number, number] = [...matrix];
                next[index] = Number(event.target.value);
                setMatrix(next);
              }}
            />
          </label>
        ))}
      </div>
      <p className="lab-readout">
        Signed area <strong>{area.toFixed(2)}</strong> · (1, 1) →{' '}
        <strong>
          ({vector[0].toFixed(1)}, {vector[1].toFixed(1)})
        </strong>
      </p>
      <button
        className="text-button"
        onClick={() =>
          onCapture(
            `Matrix [[${matrix[0]}, ${matrix[1]}], [${matrix[2]}, ${matrix[3]}]].\nThe vector (1, 1) maps to (${vector[0]}, ${vector[1]}). Determinant: ${area.toFixed(2)}.\n\nMy prediction and what I noticed:\n`,
          )
        }
      >
        Capture result <Icon name="arrow" />
      </button>
    </div>
  );
}
