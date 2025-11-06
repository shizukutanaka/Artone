import React from 'react';
import styled, { keyframes } from '@emotion/styled';

const spin = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

const SpinnerContainer = styled.div<{ size?: 'small' | 'medium' | 'large' }>`
  display: inline-block;
  width: ${props => {
    switch (props.size) {
      case 'small': return '16px';
      case 'large': return '48px';
      default: return '32px';
    }
  }};
  height: ${props => {
    switch (props.size) {
      case 'small': return '16px';
      case 'large': return '48px';
      default: return '32px';
    }
  }};
`;

const SpinnerSVG = styled.svg`
  animation: ${spin} 0.8s linear infinite;
`;

interface SpinnerProps {
  size?: 'small' | 'medium' | 'large';
  className?: string;
  'aria-label'?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'medium',
  className,
  'aria-label': ariaLabel = 'Loading'
}) => {
  return (
    <SpinnerContainer size={size} className={className} role="status" aria-label={ariaLabel}>
      <SpinnerSVG viewBox="0 0 50 50">
        <circle
          cx="25"
          cy="25"
          r="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="80, 200"
          strokeDashoffset="0"
          opacity="0.3"
        />
        <circle
          cx="25"
          cy="25"
          r="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="80, 200"
          strokeDashoffset="60"
        />
      </SpinnerSVG>
    </SpinnerContainer>
  );
};
