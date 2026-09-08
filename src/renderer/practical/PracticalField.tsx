import { useId, type ReactElement } from 'react';
import { MAX_PRACTICAL_FIELD_LENGTH } from './draft-limits';

export function PracticalField({
  label,
  attribution,
  value,
  onChange,
}: Readonly<{
  label: string;
  attribution?: string;
  value: string;
  onChange: (value: string) => void;
}>): ReactElement {
  const id = useId();
  const tooLong = value.length > MAX_PRACTICAL_FIELD_LENGTH;
  return (
    <div className="practical-field">
      <label htmlFor={id}>
        {label}
        {attribution && (
          <span className="practical-provenance">{attribution}</span>
        )}
      </label>
      <textarea
        id={id}
        className="practical-input"
        value={value}
        aria-invalid={tooLong}
        aria-describedby={`${id}-limit`}
        onChange={(event) => onChange(event.target.value)}
      />
      <span
        id={`${id}-limit`}
        className="practical-field-limit"
        role={tooLong ? 'alert' : undefined}
      >
        {value.length.toLocaleString()} /{' '}
        {MAX_PRACTICAL_FIELD_LENGTH.toLocaleString()} characters
        {tooLong &&
          ' · Your full text is retained. Shorten this field before saving.'}
      </span>
    </div>
  );
}
