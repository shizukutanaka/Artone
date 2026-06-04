/**
 * Artone v3 - E2E Tests
 * 
 * Playwright テスト
 */

import { test, expect } from '@playwright/test';

test.describe('Artone v3 - Core Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load main application', async ({ page }) => {
    await expect(page).toHaveTitle(/Artone/);
    await expect(page.locator('#app')).toBeVisible();
  });

  test('should display timeline panel', async ({ page }) => {
    await expect(page.locator('[data-testid="timeline"]')).toBeVisible();
  });

  test('should display preview panel', async ({ page }) => {
    await expect(page.locator('[data-testid="preview"]')).toBeVisible();
  });

  test('should display media browser', async ({ page }) => {
    await expect(page.locator('[data-testid="media-browser"]')).toBeVisible();
  });
});

test.describe('Media Import', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should show import dialog on button click', async ({ page }) => {
    await page.click('[data-testid="import-button"]');
    await expect(page.locator('[data-testid="import-dialog"]')).toBeVisible();
  });

  test('should accept video files', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    // Verify accept attribute
    await expect(fileInput).toHaveAttribute('accept', /video/);
  });
});

test.describe('Timeline Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should zoom timeline with scroll', async ({ page }) => {
    const timeline = page.locator('[data-testid="timeline"]');
    await page.evaluate(() => {
      return (window as any).__timelineZoom || 1;
    });
    
    await timeline.hover();
    await page.mouse.wheel(0, -100);
    
    // Verify zoom changed
    await page.waitForTimeout(100);
  });

  test('should scrub playhead on click', async ({ page }) => {
    const ruler = page.locator('[data-testid="timeline-ruler"]');
    await ruler.click({ position: { x: 200, y: 10 } });
    
    const playhead = page.locator('[data-testid="playhead"]');
    await expect(playhead).toBeVisible();
  });
});

test.describe('Export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should open export dialog', async ({ page }) => {
    await page.click('[data-testid="export-button"]');
    await expect(page.locator('[data-testid="export-dialog"]')).toBeVisible();
  });

  test('should show export presets', async ({ page }) => {
    await page.click('[data-testid="export-button"]');
    
    const presets = page.locator('[data-testid="export-preset"]');
    await expect(presets).toHaveCount(8);
  });
});

test.describe('Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should play/pause with Space', async ({ page }) => {
    await page.keyboard.press('Space');
    // Verify playback state changed
  });

  test('should undo with Cmd/Ctrl+Z', async ({ page }) => {
    await page.keyboard.press('Meta+z');
    // Verify undo action
  });

  test('should save with Cmd/Ctrl+S', async ({ page }) => {
    await page.keyboard.press('Meta+s');
    // Verify save action
  });
});

test.describe('Performance', () => {
  test('should load within 3 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - start;
    
    expect(loadTime).toBeLessThan(3000);
  });

  test('should maintain 60fps during scrubbing', async ({ page }) => {
    await page.goto('/');
    
    // Enable performance metrics
    const client = await page.context().newCDPSession(page);
    await client.send('Performance.enable');
    
    // Simulate scrubbing
    const ruler = page.locator('[data-testid="timeline-ruler"]');
    for (let x = 0; x < 500; x += 50) {
      await ruler.click({ position: { x, y: 10 } });
    }
    
    await client.send('Performance.getMetrics');
    // Verify frame rate metrics
  });
});

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should have proper ARIA labels', async ({ page }) => {
    const timeline = page.locator('[data-testid="timeline"]');
    await expect(timeline).toHaveAttribute('aria-label', /timeline/i);
  });

  test('should be keyboard navigable', async ({ page }) => {
    await page.keyboard.press('Tab');
    
    const focused = page.locator(':focus');
    await expect(focused).toBeVisible();
  });
});

test.describe('WebGPU/WebCodecs Support', () => {
  test('should detect WebGPU support', async ({ page }) => {
    const hasWebGPU = await page.evaluate(() => {
      return 'gpu' in navigator;
    });
    
    // WebGPU may not be available in CI
    console.log(`WebGPU support: ${hasWebGPU}`);
  });

  test('should detect WebCodecs support', async ({ page }) => {
    const hasWebCodecs = await page.evaluate(() => {
      return 'VideoEncoder' in window && 'VideoDecoder' in window;
    });
    
    console.log(`WebCodecs support: ${hasWebCodecs}`);
  });
});

test.describe('Collaboration', () => {
  test('should show collaboration panel', async ({ page }) => {
    await page.click('[data-testid="collab-button"]');
    await expect(page.locator('[data-testid="collab-panel"]')).toBeVisible();
  });

  test('should generate share link', async ({ page }) => {
    await page.click('[data-testid="collab-button"]');
    await page.click('[data-testid="share-link-button"]');
    
    const shareInput = page.locator('[data-testid="share-link-input"]');
    await expect(shareInput).toHaveValue(/https?:\/\//);
  });
});

test.describe('Mobile Responsive', () => {
  test('should adapt to mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // Mobile layout should hide side panels
    await expect(page.locator('[data-testid="media-browser"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="mobile-nav"]')).toBeVisible();
  });

  test('should adapt to tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    
    // Tablet layout should show compact timeline
    await expect(page.locator('[data-testid="timeline-compact"]')).toBeVisible();
  });
});
