/**
 * Language Selector Component
 * Provides a dropdown to switch between supported languages
 */

import React from 'react';
import styled from '@emotion/styled';
import { useI18n } from '../../hooks/useI18n';

const SelectorContainer = styled.div`
  position: relative;
  display: inline-block;
`;

const Select = styled.select`
  appearance: none;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 8px 32px 8px 12px;
  font-size: 14px;
  color: var(--color-text);
  cursor: pointer;
  outline: none;
  min-width: 120px;

  &:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(var(--color-primary-rgb), 0.1);
  }

  &:hover {
    border-color: var(--color-primary);
  }
`;

const Arrow = styled.div`
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: var(--color-text-secondary);
  font-size: 12px;
`;

interface LanguageSelectorProps {
  className?: string;
}

export function LanguageSelector({ className }: LanguageSelectorProps) {
  const { currentLanguage, supportedLanguages, setLanguage, t } = useI18n();

  const handleLanguageChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setLanguage(event.target.value);
  };

  return (
    <SelectorContainer className={className}>
      <Select
        value={currentLanguage}
        onChange={handleLanguageChange}
        aria-label={t('nav.language', { defaultValue: 'Select Language' })}
      >
        {supportedLanguages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.nativeName} ({lang.name})
          </option>
        ))}
      </Select>
      <Arrow>▼</Arrow>
    </SelectorContainer>
  );
}
