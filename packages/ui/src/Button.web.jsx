import React, { useState } from 'react';

const baseStyle = {
  minHeight: '52px',
  borderRadius: '15px',
  padding: '0 24px',
  border: '2px solid transparent',
  fontFamily: "'Outfit', sans-serif",
  fontSize: '1rem',
  fontWeight: 700,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  transition: 'transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease',
};

const variants = {
  primary: {
    backgroundColor: '#F8964F',
    borderColor: '#F8964F',
    color: '#FFFFFF',
    boxShadow: '0 8px 24px rgba(248, 150, 79, 0.28)',
  },
  outline: {
    backgroundColor: '#FFFFFF',
    borderColor: '#1E1E1E',
    color: '#1E1E1E',
    boxShadow: 'none',
  },
};

export function Button({
  title,
  children,
  onPress,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled = false,
  loading = false,
  className,
  style,
}) {
  const [hovered, setHovered] = useState(false);
  const variantStyle = variants[variant] || variants.primary;
  const isDisabled = disabled || loading;
  const showHover = hovered && !isDisabled;

  const hoverStyle =
    variant === 'outline'
      ? {
          backgroundColor: '#1E1E1E',
          borderColor: '#1E1E1E',
          color: '#FFFFFF',
          boxShadow: '0 8px 24px rgba(30, 30, 30, 0.2)',
          transform: 'translateY(-2px)',
        }
      : {
          backgroundColor: '#EF7F2E',
          borderColor: '#EF7F2E',
          color: '#FFFFFF',
          boxShadow: '0 12px 30px rgba(248, 150, 79, 0.35)',
          transform: 'translateY(-2px)',
        };

  const handleClick = (event) => {
    onClick?.(event);
    onPress?.(event);
  };

  return (
    <button
      type={type}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={isDisabled}
      className={className}
      style={{
        ...baseStyle,
        ...variantStyle,
        ...(showHover ? hoverStyle : {}),
        opacity: isDisabled ? 0.65 : 1,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
    >
      {loading ? 'Please wait...' : title || children}
    </button>
  );
}
