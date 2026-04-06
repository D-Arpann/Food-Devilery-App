import React, { useId, useState } from 'react';

const containerStyle = {
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const labelStyle = {
  fontFamily: "'Outfit', sans-serif",
  fontSize: '0.95rem',
  fontWeight: 600,
  color: '#333232',
  paddingLeft: '2px',
};

const fieldBaseStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  minHeight: '52px',
  backgroundColor: '#F4E5D8',
  border: '2px solid #F8964F',
  borderRadius: '15px',
  padding: '0 14px',
  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
};

const inputStyle = {
  width: '100%',
  height: '100%',
  border: 'none',
  outline: 'none',
  background: 'transparent',
  color: '#1E1E1E',
  fontFamily: "'Outfit', sans-serif",
  fontSize: '1rem',
  fontWeight: 600,
};

const helperErrorStyle = {
  fontFamily: "'Outfit', sans-serif",
  fontSize: '0.85rem',
  fontWeight: 500,
  color: '#D32F2F',
};

export function Input({
  label,
  placeholder,
  value,
  onChange,
  onChangeText,
  type = 'text',
  error,
  prefix,
  prefixStyle,
  suffix,
  name,
  id,
  disabled = false,
  required = false,
  autoComplete,
  autoFocus = false,
  maxLength,
  inputMode,
  className,
  style,
  inputStyle: inputStyleOverride,
}) {
  const fallbackId = useId();
  const inputId = id || fallbackId;
  const [isFocused, setIsFocused] = useState(false);

  const handleChange = (event) => {
    onChange?.(event);
    onChangeText?.(event.target.value);
  };

  return (
    <div style={containerStyle} className={className}>
      {label && (
        <label htmlFor={inputId} style={labelStyle}>
          {label}
        </label>
      )}
      <div
        style={{
          ...fieldBaseStyle,
          borderColor: isFocused ? '#F8964F' : '#E7D8CA',
          boxShadow: isFocused ? '0 8px 24px rgba(248, 150, 79, 0.2)' : 'none',
          opacity: disabled ? 0.65 : 1,
          ...style,
        }}
      >
        {prefix ? (
          <span style={{ color: '#5E5E5E', fontWeight: 700, ...prefixStyle }}>{prefix}</span>
        ) : null}
        <input
          id={inputId}
          name={name}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          disabled={disabled}
          required={required}
          maxLength={maxLength}
          inputMode={inputMode}
          style={{ ...inputStyle, ...inputStyleOverride }}
        />
        {suffix}
      </div>
      {error ? <span style={helperErrorStyle}>{error}</span> : null}
    </div>
  );
}
