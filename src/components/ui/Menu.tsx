/**
 * Menu Component
 * Atlassian Design System inspired dropdown menu
 */

import React, { useState, useRef, useEffect } from 'react';
import { Button } from './Button';

export interface MenuItem {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  divider?: boolean;
  icon?: React.ReactNode;
  href?: string;
  target?: string;
  children?: MenuItem[];
}

export interface MenuProps {
  trigger: React.ReactNode;
  items: MenuItem[];
  placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';
  className?: string;
}

const Menu: React.FC<MenuProps> = ({
  trigger,
  items,
  placement = 'bottom-start',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleTriggerClick = () => {
    setIsOpen(!isOpen);
  };

  const handleItemClick = (item: MenuItem) => {
    if (!item.disabled && item.onClick) {
      item.onClick();
      setIsOpen(false);
    }
  };

  const getPlacementClasses = () => {
    switch (placement) {
      case 'bottom-start':
        return 'top-full left-0 mt-1';
      case 'bottom-end':
        return 'top-full right-0 mt-1';
      case 'top-start':
        return 'bottom-full left-0 mb-1';
      case 'top-end':
        return 'bottom-full right-0 mb-1';
      default:
        return 'top-full left-0 mt-1';
    }
  };

  const renderMenuItem = (item: MenuItem, index: number) => {
    if (item.divider) {
      return <div key={index} className="border-t border-[var(--color-border)] my-1" />;
    }

    const itemClasses = [
      'flex items-center px-3 py-2 text-sm transition-colors cursor-pointer',
      'hover:bg-[var(--color-surface-hover)] focus:bg-[var(--color-surface-hover)]',
      'focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-inset',
      item.disabled ? 'opacity-50 cursor-not-allowed' : 'text-[var(--color-text)]',
    ].filter(Boolean).join(' ');

    const content = (
      <div className={itemClasses} onClick={() => handleItemClick(item)}>
        {item.icon && (
          <span className="mr-3 flex-shrink-0">
            {item.icon}
          </span>
        )}
        <span className="flex-1">{item.label}</span>
        {item.children && item.children.length > 0 && (
          <svg className="ml-3 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
      </div>
    );

    if (item.href && !item.disabled) {
      return (
        <a
          key={index}
          href={item.href}
          target={item.target}
          className={itemClasses}
          onClick={(e) => {
            if (item.onClick) {
              e.preventDefault();
              handleItemClick(item);
            }
          }}
        >
          {item.icon && (
            <span className="mr-3 flex-shrink-0">
              {item.icon}
            </span>
          )}
          <span className="flex-1">{item.label}</span>
        </a>
      );
    }

    return (
      <div
        key={index}
        className={itemClasses}
        onClick={() => handleItemClick(item)}
        role="menuitem"
        tabIndex={item.disabled ? -1 : 0}
      >
        {item.icon && (
          <span className="mr-3 flex-shrink-0">
            {item.icon}
          </span>
        )}
        <span className="flex-1">{item.label}</span>
        {item.children && item.children.length > 0 && (
          <svg className="ml-3 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
      </div>
    );
  };

  return (
    <div className={`relative inline-block ${className}`} ref={menuRef}>
      <div ref={triggerRef} onClick={handleTriggerClick}>
        {trigger}
      </div>

      {isOpen && (
        <div
          className={`absolute z-50 w-56 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-[var(--shadow-large)] ${getPlacementClasses()}`}
          role="menu"
          aria-orientation="vertical"
        >
          {items.map((item, index) => renderMenuItem(item, index))}
        </div>
      )}
    </div>
  );
};

export { Menu };
