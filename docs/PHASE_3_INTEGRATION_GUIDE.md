# Phase 3 Integration Guide

## Quick Start - Implementing Phase 3 Features

This guide explains how to integrate Phase 3 improvements into your existing codebase.

---

## 1. 12-Factor Configuration

### Step 1: Set Environment Variables

Create `.env.local` (not committed to git):
```bash
# Application
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001

# Security (generate with: openssl rand -base64 32)
CSRF_SECRET=your-random-32-char-secret
SESSION_SECRET=your-random-32-char-secret

# Optional services
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...

# Logging
LOG_LEVEL=debug
LOG_FORMAT=text
```

### Step 2: Use Configuration in Your Code

**Server-side (Node.js/Next.js API routes)**:
```typescript
import { getConfig } from '@/config/environment';

export default function handler(req, res) {
  const config = getConfig();

  // Use configuration
  const apiUrl = config.apiUrl;
  const enableCollaboration = config.features.enableCollaboration;

  res.json({ success: true });
}
```

**Client-side (React components)**:
```typescript
import { publicConfig } from '@/config/environment';

export function VideoUpload() {
  return (
    <form action={`${publicConfig.apiUrl}/upload`}>
      {/* Form content */}
    </form>
  );
}
```

### Step 3: Add Configuration Validation

```typescript
// Before app starts:
import { getConfig } from '@/config/environment';

try {
  const config = getConfig();
  console.log('✅ Configuration validated');
} catch (error) {
  console.error('❌ Invalid configuration:', error.message);
  process.exit(1);
}
```

---

## 2. OpenTelemetry Structured Logging

### Step 1: Initialize Logger at App Startup

```typescript
// pages/_app.tsx or middleware.ts
import { initializeLogger, getLogger } from '@/monitoring/opentelemetry-setup';

export function App() {
  useEffect(() => {
    // Initialize with user context
    const logger = initializeLogger({
      userId: user?.id,
      sessionId: sessionId,
    });

    logger.info('Application started', {
      environment: process.env.NODE_ENV,
      version: process.env.APP_VERSION,
    });
  }, []);

  return <YourApp />;
}
```

### Step 2: Replace console.log with Logger

**Before**:
```typescript
console.log('Video processing started');
console.error('Error:', error.message);
```

**After**:
```typescript
import { getLogger } from '@/monitoring/opentelemetry-setup';

const logger = getLogger();

logger.info('Video processing started', {
  videoId: '123',
  format: 'mp4',
});

logger.error('Processing failed', error, {
  videoId: '123',
  duration: 120,
});
```

### Step 3: Capture Metrics

```typescript
import { MetricsCollector } from '@/monitoring/opentelemetry-setup';

const metrics = new MetricsCollector(logger);

async function processVideo(videoId: string) {
  const startTime = performance.now();

  try {
    // Process video...
    const duration = performance.now() - startTime;
    metrics.recordMetric('video_processing_ms', duration);

    logger.info('Video processed', {
      videoId,
      duration: `${duration.toFixed(2)}ms`,
    });
  } catch (error) {
    logger.error('Processing failed', error, { videoId });
  }
}
```

### Step 4: Generate Reports

```typescript
// Periodically (e.g., every hour):
const report = metrics.getReport();
logger.info('Performance metrics', report);

// Output:
// {
//   "video_processing_ms": {
//     "count": 150,
//     "min": 45,
//     "max": 234,
//     "avg": 127.5
//   }
// }
```

---

## 3. Docker Dev Containers

### Step 1: Open in Container

1. Install VS Code extension: "Dev Containers"
2. `Cmd+Shift+P` → "Remote-Containers: Open Folder in Container"
3. Wait for container to build (~2-3 minutes first time)

### Step 2: Verify Environment

```bash
# Inside container
node --version
npm --version
git --version

# Run tests
npm run test

# Start development server
npm run dev
```

### Step 3: Access Application

- App: http://localhost:3000
- API: http://localhost:3001
- Debugger: localhost:9229

### Customization

Edit `.devcontainer/devcontainer.json` to:
- Add more VS Code extensions
- Change Node version
- Add system packages
- Mount additional directories

---

## 4. Automated Accessibility Testing

### Step 1: Install Dependencies

```bash
npm install axe-core @axe-core/playwright
npm install --save-dev @testing-library/jest-dom
```

### Step 2: Create Accessibility Tests

```typescript
// tests/accessibility/components.test.ts
import { test, expect } from '@playwright/test';
import { testAccessibility, isAccessibilityTestPass } from '@/tests/accessibility/axe-core-setup';

test('VideoEditor accessibility', async ({ page }) => {
  await page.goto('http://localhost:3000/editor');

  // Run accessibility tests
  const result = await testAccessibility(page, {
    wcagLevel: 'wcag21aa',
    includeIncomplete: true,
  });

  // Print report
  console.log(formatAccessibilityReport(result));

  // Assert no critical violations
  expect(isAccessibilityTestPass(result)).toBe(true);
});
```

### Step 3: Add to CI/CD

```yaml
# .github/workflows/e2e.yml
- name: Run Accessibility Tests
  run: npm run test:a11y
```

### Step 4: Fix Issues

When tests fail, the report includes:
- Which elements fail
- Why they fail
- How to fix them
- Link to detailed guidance

Example:
```
[SERIOUS] color-contrast
Description: Ensures the contrast between foreground and background colors meets WCAG AA standards
Affected Elements: 15
Remediation: Change color to darker shade (need 4.5:1 contrast ratio)
Help: https://www.deque.com/axe-core/rules/color-contrast/
```

---

## 5. Rust/WebAssembly Video Processing

### Step 1: Check WASM Support

```typescript
import { isWasmSupported } from '@/video/wasm-bridge';

if (!isWasmSupported()) {
  console.warn('WebAssembly not supported, using JavaScript fallback');
  // Use JS implementation instead
}
```

### Step 2: Use WASM Processor

```typescript
import { getWasmProcessor } from '@/video/wasm-bridge';

async function applyGrayscale(imageData: ImageData) {
  const processor = await getWasmProcessor();
  const result = await processor.processGrayscale(imageData);
  return result; // Returns in 20ms instead of 150ms
}
```

### Step 3: Integrate into Pipeline

```typescript
// Replace existing effect processing
import { getWasmProcessor } from '@/video/wasm-bridge';

export async function renderFrame(
  canvas: HTMLCanvasElement,
  effects: Effect[]
) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  if (!effects.length) return imageData;

  const processor = await getWasmProcessor();
  let processed = imageData;

  for (const effect of effects) {
    switch (effect.type) {
      case 'grayscale':
        processed = await processor.processGrayscale(processed);
        break;
      case 'blur':
        processed = await processor.processBlur(processed, effect.radius);
        break;
      case 'colorCorrection':
        processed = await processor.colorCorrection(
          processed,
          effect.brightness,
          effect.contrast,
          effect.saturation
        );
        break;
    }
  }

  ctx.putImageData(processed, 0, 0);
  return processed;
}
```

### Step 4: Build WASM Module

```bash
# Install Rust (if needed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install wasm-pack
cargo install wasm-pack

# Build WASM module (place Rust source in wasm/ directory)
wasm-pack build wasm/video_processor --target web

# Output will be in wasm/video_processor/pkg/
# Copy to public/wasm/ for serving
```

---

## 6. CRDT Collaborative Editing

### Step 1: Install Yjs

```bash
npm install yjs lib0
```

### Step 2: Initialize Collaborative Document

```typescript
// pages/editor.tsx
import { CollaborativeDocument } from '@/collaboration/crdt-yjs-integration';
import { useEffect, useState } from 'react';

export function VideoEditor() {
  const [doc, setDoc] = useState<CollaborativeDocument | null>(null);

  useEffect(() => {
    const userId = user?.id || 'anonymous-' + Math.random();
    const userName = user?.name || 'Anonymous';

    const collaborativeDoc = new CollaborativeDocument(userId, userName);
    setDoc(collaborativeDoc);

    return () => collaborativeDoc.destroy();
  }, []);

  return <Editor doc={doc} />;
}
```

### Step 3: Handle Timeline Changes

```typescript
function TimelineEditor({ doc }: { doc: CollaborativeDocument }) {
  const [clips, setClips] = useState(doc.getClips());

  // Listen for changes
  useEffect(() => {
    const unsubscribe = doc.onUpdate((update, origin) => {
      setClips(doc.getClips());
    });
    return unsubscribe;
  }, [doc]);

  // Add clip
  function addClip(clip: CollaborativeClip) {
    doc.addClip(clip);
  }

  // Remove clip
  function removeClip(clipId: string) {
    doc.removeClip(clipId);
  }

  // Update clip
  function updateClip(clipId: string, updates: Partial<CollaborativeClip>) {
    doc.updateClip(clipId, updates);
  }

  return (
    <div>
      {clips.map(clip => (
        <ClipComponent key={clip.id} clip={clip} onUpdate={updateClip} />
      ))}
    </div>
  );
}
```

### Step 4: Implement Presence Awareness

```typescript
function UserPresenceIndicators({ doc }: { doc: CollaborativeDocument }) {
  const [users, setUsers] = useState<UserPresence[]>([]);
  const presence = doc.getPresenceProvider();

  useEffect(() => {
    // Update on presence changes
    const updateUsers = () => setUsers(presence.getActiveUsers());
    updateUsers();

    // Listen for presence updates
    doc.getYDoc().awareness.on('change', updateUsers);
  }, [doc, presence]);

  return (
    <div className="presence-indicators">
      {users.map(user => (
        <UserCursor key={user.userId} user={user} />
      ))}
    </div>
  );
}
```

### Step 5: Implement Server Synchronization

```typescript
// Use with WebSocket or HTTP polling
async function syncToServer(doc: CollaborativeDocument) {
  const state = doc.exportState();

  const response = await fetch('/api/timeline/sync', {
    method: 'POST',
    body: JSON.stringify({ state: Buffer.from(state).toString('base64') }),
  });

  if (response.ok) {
    const { remoteState } = await response.json();
    if (remoteState) {
      doc.importState(Buffer.from(remoteState, 'base64'));
    }
  }
}

// Sync periodically
setInterval(() => syncToServer(doc), 5000); // Every 5 seconds
```

---

## Integration Checklist

- [ ] Environment variables configured
- [ ] Logger initialized and used throughout app
- [ ] Docker dev container working
- [ ] Accessibility tests running in CI/CD
- [ ] WASM processor integrated into video pipeline
- [ ] Collaborative document created and tested
- [ ] Presence awareness UI implemented
- [ ] Server synchronization working
- [ ] All tests passing
- [ ] Documentation updated

---

## Common Issues & Solutions

### WASM Module Not Loading

```typescript
import { isWasmSupported } from '@/video/wasm-bridge';

// Always check support first
if (isWasmSupported()) {
  processor = await getWasmProcessor();
} else {
  // Fallback to JavaScript
  processor = new JavaScriptVideoProcessor();
}
```

### Configuration Errors in Production

```bash
# Validate before deployment:
NODE_ENV=production npm run typecheck
NODE_ENV=production node -e "require('./src/config/environment').getConfig()"
```

### CRDT Sync Issues

```typescript
// Check for conflicts
doc.onUpdate((update, origin) => {
  logger.debug('Document updated', {
    updateSize: update.length,
    origin: origin?.clientID || 'local',
  });
});
```

### Accessibility Test Timeouts

```typescript
// Increase timeout for large pages
test('Accessibility', async ({ page }) => {
  test.setTimeout(30000); // 30 seconds
  const result = await testAccessibility(page);
});
```

---

## Performance Monitoring

Monitor Phase 3 integration:

```typescript
import { MetricsCollector } from '@/monitoring/opentelemetry-setup';

const metrics = new MetricsCollector();

// WASM performance
const startWasm = performance.now();
await processor.processGrayscale(imageData);
metrics.recordMetric('wasm_processing_ms', performance.now() - startWasm);

// CRDT sync
const startSync = performance.now();
await syncToServer(doc);
metrics.recordMetric('crdt_sync_ms', performance.now() - startSync);

// Configuration load
const startConfig = performance.now();
const config = getConfig();
metrics.recordMetric('config_load_ms', performance.now() - startConfig);

// Report
console.log(metrics.getReport());
```

---

## Next Steps

After Phase 3 implementation:
1. Run full test suite: `npm run test:ci`
2. Performance profiling: `npm run profile`
3. Accessibility audit: `npm run test:a11y`
4. Deploy to staging
5. Monitor in production with OpenTelemetry
6. Gather user feedback on collaborative features

---

**Last Updated**: 2025-11-07
**Phase**: 3 - Advanced Features
**Status**: Implementation Complete
