import React from 'react';
import styled from '@emotion/styled';
import { motion } from 'framer-motion';

const ProgressContainer = styled.div`
  width: 100%;
  height: 8px;
  background: #334155;
  border-radius: 4px;
  overflow: hidden;
  position: relative;
`;

const ProgressFill = styled(motion.div)<{ variant?: 'primary' | 'success' | 'warning' | 'error' }>`
  height: 100%;
  background: ${props => {
    switch (props.variant) {
      case 'success': return 'linear-gradient(90deg, #10b981, #059669)';
      case 'warning': return 'linear-gradient(90deg, #f59e0b, #d97706)';
      case 'error': return 'linear-gradient(90deg, #ef4444, #dc2626)';
      default: return 'linear-gradient(90deg, #3b82f6, #8b5cf6)';
    }
  }};
  border-radius: 4px;
  transition: width 0.3s ease-in-out;
  position: relative;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.3),
      transparent
    );
    animation: shimmer 2s infinite;
  }

  @keyframes shimmer {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }
`;

const ProgressLabel = styled.div`
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: #94a3b8;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

interface ProgressBarProps {
  value: number;
  max?: number;
  variant?: 'primary' | 'success' | 'warning' | 'error';
  showLabel?: boolean;
  label?: string;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  variant = 'primary',
  showLabel = false,
  label,
  className
}) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  return (
    <div className={className}>
      <ProgressContainer role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
        <ProgressFill
          variant={variant}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </ProgressContainer>
      {showLabel && (
        <ProgressLabel>
          <span>{label || 'Progress'}</span>
          <span>{percentage.toFixed(0)}%</span>
        </ProgressLabel>
      )}
    </div>
  );
};
