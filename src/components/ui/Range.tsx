/**
 * Range Component
 * Atlassian Design System inspired range slider
 */

import React, { useState, useRef, useEffect } from 'react';

export interface RangeProps {
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error';
  showValue?: boolean;
  valueFormatter?: (value: number) => string;
  onChange?: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  className?: string;
  label?: string;
  description?: string;
}

const Range: React.FC<RangeProps> = ({
  value = 50,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  size = 'medium',
  color = 'primary',
  showValue = false,
  valueFormatter,
  onChange,
  onChangeEnd,
  className = '',
  label,
  description,
}) => {
  const [internalValue, setInternalValue] = useState(value);
  const [isDragging, setIsDragging] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  const currentValue = value !== undefined ? value : internalValue;

  useEffect(() => {
    if (value !== undefined) {
      setInternalValue(value);
    }
  }, [value]);

  const colorClasses = {
    primary: 'bg-[var(--color-primary)]',
    secondary: 'bg-[var(--color-secondary)]',
    success: 'bg-[var(--color-success)]',
    warning: 'bg-[var(--color-warning)]',
    error: 'bg-[var(--color-error)]',
  };

  const sizeClasses = {
    small: {
      track: 'h-1',
      thumb: 'w-3 h-3',
      offset: 'top-[-2px]',
    },
    medium: {
      track: 'h-2',
      thumb: 'w-4 h-4',
      offset: 'top-[-6px]',
    },
    large: {
      track: 'h-3',
      thumb: 'w-5 h-5',
      offset: 'top-[-8px]',
    },
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    if (disabled) return;
    setIsDragging(true);
    handleMove(event);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (event: MouseEvent) => {
    handleMove(event);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    onChangeEnd?.(currentValue);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  const handleMove = (event: MouseEvent | React.MouseEvent) => {
    if (!sliderRef.current) return;

    const rect = sliderRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const newValue = Math.round((percentage * (max - min) + min) / step) * step;
    const clampedValue = Math.max(min, Math.min(max, newValue));

    if (value === undefined) {
      setInternalValue(clampedValue);
    }
    onChange?.(clampedValue);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;

    let newValue = currentValue;
    const stepSize = step * (event.shiftKey ? 10 : 1);

    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        event.preventDefault();
        newValue = Math.max(min, currentValue - stepSize);
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        event.preventDefault();
        newValue = Math.min(max, currentValue + stepSize);
        break;
      case 'Home':
        event.preventDefault();
        newValue = min;
        break;
      case 'End':
        event.preventDefault();
        newValue = max;
        break;
      default:
        return;
    }

    if (value === undefined) {
      setInternalValue(newValue);
    }
    onChange?.(newValue);
    onChangeEnd?.(newValue);
  };

  const percentage = ((currentValue - min) / (max - min)) * 100;

  const formattedValue = valueFormatter ? valueFormatter(currentValue) : currentValue.toString();

  return (
    <div className={`space-y-2 ${className}`}>
      {(label || showValue) && (
        <div className="flex items-center justify-between">
          {label && (
            <label className="text-sm font-medium text-[var(--color-text)]">
              {label}
            </label>
          )}
          {showValue && (
            <span className="text-sm text-[var(--color-text-secondary)]">
              {formattedValue}
            </span>
          )}
        </div>
      )}

      <div className="relative">
        <div
          ref={sliderRef}
          className={`w-full bg-[var(--color-surface-hover)] rounded-full cursor-pointer ${
            disabled ? 'cursor-not-allowed opacity-50' : ''
          } ${sizeClasses[size].track}`}
          onMouseDown={handleMouseDown}
          role="slider"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={currentValue}
          aria-label={label}
          tabIndex={disabled ? -1 : 0}
          onKeyDown={handleKeyDown}
        >
          <div
            className={`absolute left-0 top-0 h-full rounded-full transition-all duration-100 ${colorClasses[color]}`}
            style={{ width: `${percentage}%` }}
          />
        </div>

        <div
          ref={thumbRef}
          className={`absolute ${sizeClasses[size].offset} ${sizeClasses[size].thumb} bg-white border-2 ${colorClasses[color]} rounded-full shadow-md cursor-pointer transition-transform ${
            isDragging ? 'scale-110' : ''
          } ${disabled ? 'cursor-not-allowed' : ''}`}
          style={{ left: `calc(${percentage}% - ${sizeClasses[size].thumb.split(' ')[0].replace('w-', '')}px / 2)` }}
          onMouseDown={handleMouseDown}
        />
      </div>

      {description && (
        <p className="text-sm text-[var(--color-text-secondary)]">
          {description}
        </p>
      )}
    </div>
  );
};

export { Range };
