/**
 * Tabs Component
 * Atlassian Design System inspired tabs for navigation
 */

import React, { useState, createContext, useContext } from 'react';

interface TabsContextType {
  activeTab: string;
  setActiveTab: (value: string) => void;
}

const TabsContext = createContext<TabsContextType | undefined>(undefined);

export interface TabsProps {
  children: React.ReactNode;
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

export interface TabsListProps {
  children: React.ReactNode;
  className?: string;
}

export interface TabsTriggerProps {
  value: string;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export interface TabsContentProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

const Tabs: React.FC<TabsProps> = ({
  children,
  defaultValue,
  value: controlledValue,
  onValueChange
}) => {
  const [internalValue, setInternalValue] = useState(defaultValue || '');
  const activeTab = controlledValue ?? internalValue;

  const setActiveTab = (value: string) => {
    if (controlledValue === undefined) {
      setInternalValue(value);
    }
    onValueChange?.(value);
  };

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className="w-full">
        {children}
      </div>
    </TabsContext.Provider>
  );
};

const TabsList: React.FC<TabsListProps> = ({ children, className = '' }) => {
  const classes = [
    'inline-flex h-10 items-center justify-center rounded-md bg-[var(--color-surface)] p-1 text-[var(--color-text-secondary)]',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div role="tablist" className={classes}>
      {children}
    </div>
  );
};

const TabsTrigger: React.FC<TabsTriggerProps> = ({
  value,
  children,
  disabled = false,
  className = ''
}) => {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabsTrigger must be used within Tabs');

  const { activeTab, setActiveTab } = context;
  const isActive = activeTab === value;

  const baseClasses = [
    'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium',
    'ring-offset-[var(--color-background)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
  ];

  const stateClasses = isActive
    ? 'bg-[var(--color-background)] text-[var(--color-text)] shadow-sm'
    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]';

  const classes = [
    ...baseClasses,
    stateClasses,
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      role="tab"
      type="button"
      disabled={disabled}
      className={classes}
      onClick={() => setActiveTab(value)}
      aria-selected={isActive}
      aria-controls={`tabs-content-${value}`}
      id={`tabs-trigger-${value}`}
    >
      {children}
    </button>
  );
};

const TabsContent: React.FC<TabsContentProps> = ({
  value,
  children,
  className = ''
}) => {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabsContent must be used within Tabs');

  const { activeTab } = context;
  const isActive = activeTab === value;

  if (!isActive) return null;

  const classes = [
    'mt-2 ring-offset-[var(--color-background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div
      role="tabpanel"
      id={`tabs-content-${value}`}
      aria-labelledby={`tabs-trigger-${value}`}
      className={classes}
      tabIndex={-1}
    >
      {children}
    </div>
  );
};

export { Tabs, TabsList, TabsTrigger, TabsContent };
