/**
 * Side Navigation Component
 * Atlassian Design System inspired side navigation for app navigation
 */

import React, { useState } from 'react';
import { Button } from './Button';
import { Badge } from './Badge';

export interface NavigationItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  badge?: string | number;
  disabled?: boolean;
  children?: NavigationItem[];
}

export interface SideNavigationProps {
  items: NavigationItem[];
  activeItemId?: string;
  onItemSelect?: (item: NavigationItem) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

const SideNavigation: React.FC<SideNavigationProps> = ({
  items,
  activeItemId,
  onItemSelect,
  collapsed = false,
  onToggleCollapse,
  header,
  footer,
  className = '',
}) => {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const handleItemClick = (item: NavigationItem) => {
    if (item.disabled) return;

    if (item.children && item.children.length > 0) {
      // Toggle expanded state for items with children
      const newExpandedItems = new Set(expandedItems);
      if (newExpandedItems.has(item.id)) {
        newExpandedItems.delete(item.id);
      } else {
        newExpandedItems.add(item.id);
      }
      setExpandedItems(newExpandedItems);
    } else {
      // Call onItemSelect for leaf items
      onItemSelect?.(item);
      if (item.onClick) {
        item.onClick();
      }
    }
  };

  const renderNavigationItem = (item: NavigationItem, level = 0): React.ReactNode => {
    const isActive = activeItemId === item.id;
    const isExpanded = expandedItems.has(item.id);
    const hasChildren = item.children && item.children.length > 0;

    const itemClasses = [
      'group flex items-center w-full px-3 py-2 text-sm font-medium rounded-md transition-colors',
      'hover:bg-[var(--color-surface-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-inset',
      isActive ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text)]',
      item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
      collapsed && level === 0 ? 'justify-center px-2' : '',
      level > 0 ? 'ml-6' : '',
    ].filter(Boolean).join(' ');

    const iconClasses = [
      'flex-shrink-0 w-5 h-5',
      isActive ? 'text-white' : 'text-[var(--color-text-secondary)] group-hover:text-[var(--color-text)]',
    ].filter(Boolean).join(' ');

    return (
      <div key={item.id}>
        <button
          className={itemClasses}
          onClick={() => handleItemClick(item)}
          disabled={item.disabled}
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-current={isActive ? 'page' : undefined}
        >
          {item.icon && (
            <span className={iconClasses}>
              {item.icon}
            </span>
          )}

          {(!collapsed || level > 0) && (
            <>
              <span className="flex-1 text-left ml-3">
                {item.label}
              </span>

              {item.badge && (
                <Badge
                  variant={isActive ? 'secondary' : 'default'}
                  size="small"
                  className="ml-2"
                >
                  {item.badge}
                </Badge>
              )}

              {hasChildren && (
                <svg
                  className={`ml-2 w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </>
          )}
        </button>

        {/* Render children if expanded */}
        {hasChildren && isExpanded && (!collapsed || level > 0) && (
          <div className="mt-1 space-y-1">
            {item.children!.map((child) => renderNavigationItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const containerClasses = [
    'flex flex-col h-full bg-[var(--color-surface)] border-r border-[var(--color-border)]',
    collapsed ? 'w-16' : 'w-64',
    'transition-all duration-300 ease-in-out',
    className,
  ].filter(Boolean).join(' ');

  return (
    <nav className={containerClasses} role="navigation" aria-label="Main navigation">
      {/* Header */}
      {(header || onToggleCollapse) && (
        <div className={`flex items-center justify-between p-4 border-b border-[var(--color-border)] ${collapsed ? 'px-2' : ''}`}>
          {header && !collapsed && header}
          {onToggleCollapse && (
            <Button
              variant="secondary"
              size="small"
              onClick={onToggleCollapse}
              aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            >
              <svg
                className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Button>
          )}
        </div>
      )}

      {/* Navigation Items */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {items.map((item) => renderNavigationItem(item))}
        </div>
      </div>

      {/* Footer */}
      {footer && (
        <div className={`p-4 border-t border-[var(--color-border)] ${collapsed ? 'px-2' : ''}`}>
          {footer}
        </div>
      )}
    </nav>
  );
};

export { SideNavigation };
