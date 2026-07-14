/**
 * Tests for app/sw-manager.ts — ServiceWorkerManager
 *
 * navigator.serviceWorker is stubbed with a real EventTarget-based fake
 * registration so addEventListener/removeEventListener (and AbortSignal-based
 * removal) behave exactly like the real ServiceWorkerRegistration/Worker.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServiceWorkerManager, shouldRegisterServiceWorker } from '../app/sw-manager';

describe('shouldRegisterServiceWorker', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');

  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(navigator, 'serviceWorker', originalDescriptor);
    } else {
      delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
    }
  });

  it('REGRESSION: returns false outside production (dev builds must not register the SW)', () => {
    // Before this feature existed, nothing gated registration on env at
    // all -- entry.tsx simply never called register(), so "offline-capable"
    // never actually held. This guard exists so dev's HMR-served modules
    // aren't intercepted by the SW's cache-first strategy.
    Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });
    expect(shouldRegisterServiceWorker(false)).toBe(false);
  });

  it('returns true in production when the browser supports Service Workers', () => {
    Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });
    expect(shouldRegisterServiceWorker(true)).toBe(true);
  });

  it('returns false in production when the browser has no Service Worker support', () => {
    delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
    expect(shouldRegisterServiceWorker(true)).toBe(false);
  });
});

class FakeWorker extends EventTarget {
  state: string = 'installing';
}

class FakeRegistration extends EventTarget {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
}

function makeFakeServiceWorkerContainer(registration: FakeRegistration) {
  return {
    register: vi.fn(async () => registration),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    controller: null as unknown,
  };
}

describe('ServiceWorkerManager — updatefound listener cleanup', () => {
  let registration: FakeRegistration;
  let swContainer: ReturnType<typeof makeFakeServiceWorkerContainer>;

  beforeEach(() => {
    registration = new FakeRegistration();
    swContainer = makeFakeServiceWorkerContainer(registration);
    vi.stubGlobal('navigator', {
      ...navigator,
      serviceWorker: swContainer,
      onLine: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('an updatefound firing after destroy() does not notify listeners', async () => {
    const manager = new ServiceWorkerManager();
    await manager.register();

    const onUpdated = vi.fn();
    manager.onStateChange((state) => { if (state === 'updated') onUpdated(); });

    manager.destroy();

    // REGRESSION: before the fix, the 'updatefound' listener was registered
    // without the AbortController's signal, so destroy()'s abort() couldn't
    // remove it -- this event would still be processed and could still
    // reach onStateChange via any listener not yet cleared.
    const worker = new FakeWorker();
    registration.installing = worker;
    registration.dispatchEvent(new Event('updatefound'));
    worker.state = 'installed';
    Object.assign(swContainer, { controller: {} });
    worker.dispatchEvent(new Event('statechange'));

    expect(manager.hasUpdate()).toBe(false);
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it('a normal updatefound (before destroy) still notifies listeners', async () => {
    const manager = new ServiceWorkerManager();
    await manager.register();

    const onUpdated = vi.fn();
    manager.onStateChange((state) => { if (state === 'updated') onUpdated(); });

    const worker = new FakeWorker();
    registration.installing = worker;
    registration.dispatchEvent(new Event('updatefound'));
    worker.state = 'installed';
    Object.assign(swContainer, { controller: {} });
    worker.dispatchEvent(new Event('statechange'));

    expect(manager.hasUpdate()).toBe(true);
    expect(onUpdated).toHaveBeenCalledTimes(1);
  });

  it('REGRESSION: repeated register() calls do not accumulate updatefound listeners past destroy()', async () => {
    // Simulate a re-created manager re-registering against the SAME
    // underlying registration object (as would happen across app reloads
    // sharing one browser-level ServiceWorkerRegistration).
    const managerA = new ServiceWorkerManager();
    await managerA.register();
    managerA.destroy();

    const managerB = new ServiceWorkerManager();
    // Manager B registers against the same fake registration instance.
    swContainer.register.mockResolvedValueOnce(registration as unknown as ServiceWorkerRegistration);
    await managerB.register();

    const worker = new FakeWorker();
    // Each 'updatefound' handler that's still attached calls
    // worker.addEventListener('statechange', ...) once on the newly-installing
    // worker. If manager A's handler leaked past destroy(), this spy would
    // observe 2 calls (A's stale handler + B's live one) instead of 1.
    const addEventListenerSpy = vi.spyOn(worker, 'addEventListener');
    registration.installing = worker;
    registration.dispatchEvent(new Event('updatefound'));

    expect(addEventListenerSpy).toHaveBeenCalledTimes(1);
  });
});
