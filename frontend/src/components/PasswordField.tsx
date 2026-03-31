import { useState } from 'react';
import { UiIcon } from './UiIcon';

export function PasswordField({
  label,
  value,
  placeholder,
  autoComplete,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  autoComplete?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <label>
      <span>{label}</span>
      <div className="password-field">
        <input
          type={isVisible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="password-field-toggle"
          aria-label={isVisible ? 'Hide password' : 'Show password'}
          aria-pressed={isVisible}
          title={isVisible ? 'Hide password' : 'Show password'}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setIsVisible((current) => !current)}
        >
          <UiIcon name={isVisible ? 'eyeOff' : 'eye'} size={18} />
        </button>
      </div>
    </label>
  );
}
