import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VideoEditor } from '../../components/VideoEditor';
import { useVideoStore } from '../../store/videoStore';

// Mock zustand store
jest.mock('../../store/videoStore');
const mockUseVideoStore = useVideoStore as jest.MockedFunction<typeof useVideoStore>;

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    aside: ({ children, ...props }: any) => <aside {...props}>{children}</aside>,
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>
  },
  AnimatePresence: ({ children }: any) => <>{children}</>
}));

// Mock child components
jest.mock('../../components/Timeline/Timeline', () => ({
  Timeline: () => <div data-testid="timeline">Timeline</div>
}));

jest.mock('../../components/VideoPlayer/VideoPlayer', () => ({
  VideoPlayer: React.forwardRef<HTMLVideoElement>((props, ref) => (
    <video ref={ref} data-testid="video-player">Video Player</video>
  ))
}));

jest.mock('../../components/ControlPanel/ControlPanel', () => ({
  ControlPanel: () => <div data-testid="control-panel">Control Panel</div>
}));

jest.mock('../../components/PropertyPanel/PropertyPanel', () => ({
  PropertyPanel: ({ clip }: any) => (
    <div data-testid="property-panel">Property Panel: {clip?.id}</div>
  )
}));

jest.mock('../../components/MediaLibrary/MediaLibrary', () => ({
  MediaLibrary: () => <div data-testid="media-library">Media Library</div>
}));

jest.mock('../../components/ExportModal/ExportModal', () => ({
  ExportModal: ({ onClose, onExport }: any) => (
    <div data-testid="export-modal">
      <button onClick={onClose}>Close</button>
      <button onClick={() => onExport({ format: 'mp4' })}>Export</button>
    </div>
  )
}));

jest.mock('../../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: jest.fn()
}));

describe('VideoEditor', () => {
  const mockStore = {
    project: {
      id: 'test-project',
      name: 'Test Project',
      tracks: []
    },
    selectedClip: null,
    isPlaying: false,
    playPause: jest.fn(),
    exportProject: jest.fn(),
    saveProject: jest.fn(),
    loadProject: jest.fn()
  };

  beforeEach(() => {
    mockUseVideoStore.mockReturnValue(mockStore);
    jest.clearAllMocks();
  });

  it('renders the main editor interface', () => {
    render(<VideoEditor />);

    expect(screen.getByText('Artone Editor')).toBeInTheDocument();
    expect(screen.getByTestId('timeline')).toBeInTheDocument();
    expect(screen.getByTestId('video-player')).toBeInTheDocument();
    expect(screen.getByTestId('control-panel')).toBeInTheDocument();
    expect(screen.getByTestId('media-library')).toBeInTheDocument();
  });

  it('shows property panel when clip is selected', () => {
    const storeWithSelectedClip = {
      ...mockStore,
      selectedClip: { id: 'test-clip' }
    };
    mockUseVideoStore.mockReturnValue(storeWithSelectedClip);

    render(<VideoEditor />);

    expect(screen.getByTestId('property-panel')).toBeInTheDocument();
    expect(screen.getByText('Property Panel: test-clip')).toBeInTheDocument();
  });

  it('opens export modal when export button is clicked', () => {
    render(<VideoEditor />);

    const exportButton = screen.getByText('Export Video');
    fireEvent.click(exportButton);

    expect(screen.getByTestId('export-modal')).toBeInTheDocument();
  });

  it('closes export modal when close button is clicked', () => {
    render(<VideoEditor />);

    // Open modal
    const exportButton = screen.getByText('Export Video');
    fireEvent.click(exportButton);

    // Close modal
    const closeButton = screen.getByText('Close');
    fireEvent.click(closeButton);

    expect(screen.queryByTestId('export-modal')).not.toBeInTheDocument();
  });

  it('calls exportProject when export is triggered', async () => {
    render(<VideoEditor />);

    // Open modal
    const exportButton = screen.getByText('Export Video');
    fireEvent.click(exportButton);

    // Trigger export
    const exportModalButton = screen.getByText('Export');
    fireEvent.click(exportModalButton);

    await waitFor(() => {
      expect(mockStore.exportProject).toHaveBeenCalledWith({ format: 'mp4' });
    });
  });

  it('calls saveProject when save button is clicked', () => {
    render(<VideoEditor />);

    const saveButton = screen.getByText('Save Project');
    fireEvent.click(saveButton);

    expect(mockStore.saveProject).toHaveBeenCalled();
  });

  it('handles file upload for project loading', async () => {
    render(<VideoEditor />);

    const fileInput = screen.getByDisplayValue('');
    const file = new File([JSON.stringify({ test: 'data' })], 'project.json', {
      type: 'application/json'
    });

    Object.defineProperty(fileInput, 'files', {
      value: [file],
      writable: false
    });

    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(mockStore.loadProject).toHaveBeenCalledWith({ test: 'data' });
    });
  });

  it('handles export error gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    mockStore.exportProject.mockRejectedValueOnce(new Error('Export failed'));

    render(<VideoEditor />);

    // Open modal and trigger export
    const exportButton = screen.getByText('Export Video');
    fireEvent.click(exportButton);

    const exportModalButton = screen.getByText('Export');
    fireEvent.click(exportModalButton);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Export failed:', expect.any(Error));
    });

    consoleErrorSpy.mockRestore();
  });

  it('applies correct CSS classes for styling', () => {
    const { container } = render(<VideoEditor />);

    // Check if styled components are rendered
    expect(container.firstChild).toHaveStyle({
      display: 'flex',
      'flex-direction': 'column',
      height: '100vh'
    });
  });

  it('supports keyboard shortcuts integration', () => {
    const { useKeyboardShortcuts } = require('../../hooks/useKeyboardShortcuts');

    render(<VideoEditor />);

    expect(useKeyboardShortcuts).toHaveBeenCalledWith({
      onPlayPause: mockStore.playPause,
      onSave: mockStore.saveProject,
      onExport: expect.any(Function),
      onToggleLeftPanel: expect.any(Function),
      onToggleRightPanel: expect.any(Function)
    });
  });
});