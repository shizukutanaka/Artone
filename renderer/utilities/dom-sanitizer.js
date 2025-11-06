'use strict';

(function registerRendererSanitizer(global) {
  if (global.domSanitizer && typeof global.domSanitizer.setInnerHTMLSafe === 'function') {
    return;
  }

  const ALLOWED_TAGS = new Set([
    'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'em', 'br', 'ul', 'ol', 'li', 'a', 'img',
    'button', 'input', 'label', 'select', 'option', 'textarea',
    'svg', 'path', 'g', 'circle', 'rect', 'line', 'polyline', 'polygon', 'defs', 'use', 'symbol',
    'section', 'article', 'header', 'footer', 'main', 'aside',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'pre', 'code'
  ]);

  const ALLOWED_URI_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'];
  const SAFE_DATA_URI_PATTERN = /^data:(image\/(png|jpe?g|gif|webp|svg\+xml)|audio\/(mpeg|ogg)|video\/(mp4|webm));base64,[a-z0-9+/=]+$/i;
  const MAX_DATA_URI_LENGTH = 1024 * 32; // 32KB cap to avoid large inline payloads

  function sanitizeURL(value) {
    try {
      const trimmed = value.trim();
      if (trimmed === '') return '';

      if (trimmed.startsWith('data:')) {
        if (trimmed.length > MAX_DATA_URI_LENGTH) {
          return '';
        }
        return SAFE_DATA_URI_PATTERN.test(trimmed) ? trimmed : '';
      }

      const parsed = new URL(trimmed, window.location.origin);
      return ALLOWED_URI_PROTOCOLS.includes(parsed.protocol) ? parsed.href : '';
    } catch (error) {
      return '';
    }
  }

  function removeDangerousContent(root) {
    const disallowedSelectors = 'script, iframe, object, embed, link, style, meta';
    root.querySelectorAll(disallowedSelectors).forEach((node) => node.remove());

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
    let current = walker.currentNode;

    while (current) {
      if (!ALLOWED_TAGS.has(current.nodeName.toLowerCase())) {
        const replacement = document.createDocumentFragment();
        while (current.firstChild) {
          replacement.appendChild(current.firstChild);
        }
        const parent = current.parentNode;
        if (parent) {
          parent.replaceChild(replacement, current);
        }
      } else {
        Array.from(current.attributes).forEach((attr) => {
          const name = attr.name.toLowerCase();
          const value = attr.value;

          if (name.startsWith('on')) {
            current.removeAttribute(attr.name);
            return;
          }

          if (name === 'style') {
            current.removeAttribute(attr.name);
            return;
          }

          if ((name === 'href' || name === 'src' || name === 'xlink:href') && value) {
            const sanitized = sanitizeURL(value);
            if (sanitized) {
              current.setAttribute(attr.name, sanitized);
            } else {
              current.removeAttribute(attr.name);
            }
            return;
          }

          if (name.startsWith('data:') || name.startsWith('aria:')) {
            return;
          }

          if (/^[a-z0-9-_:]+$/i.test(name) === false) {
            current.removeAttribute(attr.name);
          }
        });
      }

      current = walker.nextNode();
    }

    return root;
  }

  function sanitizeHTML(html) {
    if (typeof html !== 'string' || html.trim() === '') {
      return '';
    }

    if (global.DOMPurify && typeof global.DOMPurify.sanitize === 'function') {
      return global.DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true, svg: true, mathMl: false },
        ADD_TAGS: ['svg', 'path', 'g', 'defs', 'use', 'symbol'],
        ADD_ATTR: ['d', 'viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin']
      });
    }

    const parser = new DOMParser();
    const parsed = parser.parseFromString(`<!doctype html><body>${html}`, 'text/html');
    const sanitizedBody = removeDangerousContent(parsed.body);
    return sanitizedBody.innerHTML;
  }

  function setInnerHTMLSafe(element, html) {
    if (!(element instanceof Element)) {
      return;
    }

    const sanitized = sanitizeHTML(html);
    element.innerHTML = sanitized;
  }

  function createElementFromHTML(html) {
    const template = document.createElement('template');
    template.innerHTML = sanitizeHTML(html);
    return template.content.firstElementChild || null;
  }

  function setTextContent(element, text) {
    if (!(element instanceof Element)) return;
    element.textContent = String(text ?? '');
  }

  function applyStyles(element, styles) {
    if (!(element instanceof Element) || !styles || typeof styles !== 'object') {
      return;
    }

    Object.entries(styles).forEach(([property, value]) => {
      if (typeof value === 'string') {
        element.style[property] = value;
      }
    });
  }

  global.domSanitizer = {
    sanitizeHTML,
    setInnerHTMLSafe,
    createElementFromHTML,
    setTextContent,
    applyStyles
  };
})(typeof window !== 'undefined' ? window : globalThis);
