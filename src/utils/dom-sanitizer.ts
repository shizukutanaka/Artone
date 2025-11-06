/**
 * DOM Sanitizer - Secure alternative to innerHTML
 * Prevents XSS attacks by sanitizing HTML content
 */

import DOMPurify from 'isomorphic-dompurify';

interface SanitizerConfig {
  ALLOWED_TAGS?: string[];
  ALLOWED_ATTR?: string[];
  FORBID_TAGS?: string[];
  FORBID_ATTR?: string[];
}

const DEFAULT_CONFIG: SanitizerConfig = {
  ALLOWED_TAGS: [
    'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'em', 'br', 'ul', 'ol', 'li', 'a', 'img',
    'button', 'input', 'label', 'select', 'option', 'textarea'
  ],
  ALLOWED_ATTR: [
    'class', 'id', 'style', 'title', 'alt', 'src', 'href',
    'type', 'value', 'placeholder', 'disabled', 'readonly',
    'data-*', 'aria-*', 'role'
  ],
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'link'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
};

/**
 * Sanitize HTML string to prevent XSS
 */
export function sanitizeHTML(
  dirtyHTML: string,
  config: SanitizerConfig = DEFAULT_CONFIG
): string {
  if (typeof window === 'undefined') {
    // Server-side: strip all HTML
    return dirtyHTML.replace(/<[^>]*>/g, '');
  }

  return DOMPurify.sanitize(dirtyHTML, config);
}

/**
 * Safely set innerHTML using sanitized content
 */
export function setInnerHTMLSafe(
  element: HTMLElement,
  html: string,
  config?: SanitizerConfig
): void {
  const sanitized = sanitizeHTML(html, config);
  element.innerHTML = sanitized;
}

/**
 * Create element safely from HTML string
 */
export function createElementFromHTML(
  html: string,
  config?: SanitizerConfig
): HTMLElement {
  const sanitized = sanitizeHTML(html, config);
  const template = document.createElement('template');
  template.innerHTML = sanitized;
  return template.content.firstElementChild as HTMLElement;
}

/**
 * Safe text content setter (no HTML allowed)
 */
export function setTextContent(element: HTMLElement, text: string): void {
  element.textContent = text;
}

/**
 * Build DOM elements programmatically (safest approach)
 */
export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options?: {
    className?: string;
    id?: string;
    attributes?: Record<string, string>;
    children?: (HTMLElement | string)[];
    events?: Record<string, EventListener>;
  }
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);

  if (options?.className) {
    element.className = options.className;
  }

  if (options?.id) {
    element.id = options.id;
  }

  if (options?.attributes) {
    Object.entries(options.attributes).forEach(([key, value]) => {
      // Sanitize attribute values
      if (!key.startsWith('on') && typeof value === 'string') {
        element.setAttribute(key, value);
      }
    });
  }

  if (options?.children) {
    options.children.forEach(child => {
      if (typeof child === 'string') {
        element.appendChild(document.createTextNode(child));
      } else {
        element.appendChild(child);
      }
    });
  }

  if (options?.events) {
    Object.entries(options.events).forEach(([event, handler]) => {
      element.addEventListener(event, handler);
    });
  }

  return element;
}

/**
 * Sanitize URL to prevent javascript: and data: protocols
 */
export function sanitizeURL(url: string): string | null {
  try {
    const parsed = new URL(url, window.location.origin);

    // Only allow http, https, mailto
    const allowedProtocols = ['http:', 'https:', 'mailto:'];

    if (!allowedProtocols.includes(parsed.protocol)) {
      return null;
    }

    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Sanitize CSS to prevent CSS injection attacks
 */
export function sanitizeCSS(css: string): string {
  // Remove potentially dangerous CSS properties
  const dangerous = [
    'expression',
    'javascript:',
    'vbscript:',
    'data:',
    '@import',
    'behavior:',
    '-moz-binding'
  ];

  let sanitized = css;
  dangerous.forEach(keyword => {
    const regex = new RegExp(keyword, 'gi');
    sanitized = sanitized.replace(regex, '');
  });

  return sanitized;
}

/**
 * Apply safe inline styles
 */
export function applyStyles(
  element: HTMLElement,
  styles: Partial<CSSStyleDeclaration>
): void {
  Object.entries(styles).forEach(([property, value]) => {
    if (typeof value === 'string') {
      const sanitizedValue = sanitizeCSS(value);
      (element.style as any)[property] = sanitizedValue;
    }
  });
}

// Make available globally for renderer scripts
if (typeof window !== 'undefined') {
  (window as any).DOMSanitizer = {
    setInnerHTMLSafe,
    createElement,
    sanitizeHTML,
    sanitizeURL,
    sanitizeCSS,
    applyStyles
  };
}
