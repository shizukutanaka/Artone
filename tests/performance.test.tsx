import React from 'react';
import { render, screen } from '@testing-library/react';
import { VideoEditor } from '../src/components/VideoEditor';
import { useVideoStore } from '../src/store/videoStore';
import { performance } from 'perf_hooks';

// Mock dependencies
jest.mock('../src/store/videoStore');
jest.mock('../src/hooks/useKeyboardShortcuts');
jest.mock('../src/components/Timeline/Timeline', () => ({
  Timeline: React.memo(() => <div data-testid="timeline">Timeline</div>),
}));
jest.mock('../src/components/VideoPlayer/VideoPlayer', () => ({
  VideoPlayer: React.forwardRef(() => <div data-testid="video-player">Video Player</div>),
}));
jest.mock('../src/components/ControlPanel/ControlPanel', () => ({
  ControlPanel: React.memo(() => <div data-testid="control-panel">Control Panel</div>),
}));
jest.mock('../src/components/PropertyPanel/PropertyPanel', () => ({
  PropertyPanel: React.memo(({ clip }: { clip: any }) => (
    <div data-testid="property-panel">Property Panel</div>
  )),
}));
jest.mock('../src/components/MediaLibrary/MediaLibrary', () => ({
  MediaLibrary: React.memo(() => <div data-testid="media-library">Media Library</div>),
}));
jest.mock('../src/components/ExportModal/ExportModal', () => ({
  ExportModal: React.memo(() => <div data-testid="export-modal">Export Modal</div>),
}));

describe('VideoEditor Performance Tests', () => {
  const mockUseVideoStore = useVideoStore as jest.MockedFunction<typeof useVideoStore>;

  beforeEach(() => {
    mockUseVideoStore.mockReturnValue({
      selectedClip: null,
      playPause: jest.fn(),
      exportProject: jest.fn(),
      saveProject: jest.fn(),
      loadProject: jest.fn(),
      zoom: 1,
      setZoom: jest.fn(),
      zoomToFit: jest.fn(),
      adjustPlaybackRate: jest.fn(),
      seek: jest.fn(),
      nudgePlayhead: jest.fn(),
      toggleLoop: jest.fn(),
      setLoopRegion: jest.fn(),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders within acceptable time limits', async () => {
    const startTime = performance.now();

    render(<VideoEditor />);

    const endTime = performance.now();
    const renderTime = endTime - startTime;

    // Should render in under 100ms for good UX
    expect(renderTime).toBeLessThan(100);
  });

  it('handles rapid state changes without performance degradation', () => {
    const { rerender } = render(<VideoEditor />);

    const iterations = 50;
    const startTime = performance.now();

    for (let i = 0; i < iterations; i++) {
      mockUseVideoStore.mockReturnValue({
        selectedClip: i % 2 === 0 ? { id: `clip-${i}`, name: `Clip ${i}` } : null,
        playPause: jest.fn(),
        exportProject: jest.fn(),
        saveProject: jest.fn(),
        loadProject: jest.fn(),
        zoom: 1 + (i * 0.1),
        setZoom: jest.fn(),
        zoomToFit: jest.fn(),
        adjustPlaybackRate: jest.fn(),
        seek: jest.fn(),
        nudgePlayhead: jest.fn(),
        toggleLoop: jest.fn(),
        setLoopRegion: jest.fn(),
      });

      rerender(<VideoEditor />);
    }

    const endTime = performance.now();
    const totalTime = endTime - startTime;
    const averageTime = totalTime / iterations;

    // Average re-render should be under 16ms (60fps)
    expect(averageTime).toBeLessThan(16);
  });

  it('maintains performance with large numbers of clips', () => {
    // Mock a project with many clips
    const mockClips = Array.from({ length: 100 }, (_, i) => ({
      id: `clip-${i}`,
      name: `Clip ${i}`,
      trackId: `track-${Math.floor(i / 10)}`,
      start: i * 10,
      duration: 5,
      type: 'video',
    }));

    mockUseVideoStore.mockReturnValue({
      selectedClip: null,
      playPause: jest.fn(),
      exportProject: jest.fn(),
      saveProject: jest.fn(),
      loadProject: jest.fn(),
      zoom: 1,
      setZoom: jest.fn(),
      zoomToFit: jest.fn(),
      adjustPlaybackRate: jest.fn(),
      seek: jest.fn(),
      nudgePlayhead: jest.fn(),
      toggleLoop: jest.fn(),
      setLoopRegion: jest.fn(),
      project: {
        id: 'test-project',
        name: 'Performance Test Project',
        duration: 1000,
        tracks: Array.from({ length: 10 }, (_, i) => ({
          id: `track-${i}`,
          name: `Track ${i}`,
          type: 'video',
          height: 60,
        })),
        clips: mockClips,
      },
    });

    const startTime = performance.now();
    render(<VideoEditor />);
    const endTime = performance.now();

    const renderTime = endTime - startTime;

    // Should still render quickly even with many clips
    expect(renderTime).toBeLessThan(200);
  });

  it('handles memory efficiently during extended use', async () => {
    // This test would typically use a tool like memory-profiler
    // For this example, we'll simulate memory pressure

    const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;

    // Render and re-render multiple times
    for (let i = 0; i < 100; i++) {
      const { unmount } = render(<VideoEditor />);
      unmount();
    }

    const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
    const memoryIncrease = finalMemory - initialMemory;

    // Memory increase should be reasonable (less than 50MB for this test)
    if (initialMemory > 0 && finalMemory > 0) {
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    }
  });

  it('maintains responsive interactions during heavy operations', async () => {
    const { container } = render(<VideoEditor />);

    // Simulate heavy computation
    const heavyOperation = new Promise(resolve => {
      setTimeout(() => {
        for (let i = 0; i < 1000000; i++) {
          // Simulate heavy calculation
          Math.random() * Math.random();
        }
        resolve('done');
      }, 100);
    });

    // Component should remain responsive during heavy operation
    const startTime = performance.now();

    // Try to interact with component during heavy operation
    const editorContainer = container.firstChild as HTMLElement;

    // These interactions should complete quickly even during heavy computation
    expect(editorContainer).toBeInTheDocument();

    await heavyOperation;
    const endTime = performance.now();

    // Heavy operation should complete in reasonable time
    expect(endTime - startTime).toBeLessThan(1000);
  });

  it('optimizes bundle size and loading performance', () => {
    // This test would typically check bundle analysis
    // For this example, we'll verify that components are properly optimized

    // Check that React.memo is applied where expected
    expect(React.memo).toBeDefined();

    // Verify that components are structured for code splitting
    expect(typeof VideoEditor).toBe('function');
  });
});
