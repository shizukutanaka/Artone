'use strict';

(function registerTimelineComponents(global) {
  const React = global.React;
  const TimelineCore = global.TimelineCore;

  // Import production logger if available
  let productionLogger = null;
  try {
    if (global.ProductionLogger) {
      productionLogger = global.ProductionLogger;
    }
  } catch (e) {
    productionLogger = { error: console.error };
  }

  if (!React || !TimelineCore) {
    throw new Error('React and TimelineCore must be available before loading timeline-virtualization.js');
  }

  const {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
  } = React;

  const h = React.createElement;

  function useTimelineViewportState(duration, zoom, options = {}) {
    const containerRef = useRef(null);
    const [viewport, setViewport] = useState({ start: 0, end: duration || 0 });
    const onViewportChange = typeof options.onViewportChange === 'function' ? options.onViewportChange : null;

    const updateViewport = useCallback(() => {
      const element = containerRef.current;
      if (!element) {
        return;
      }
      const pixelsPerSecond = TimelineCore.BASE_PIXELS_PER_SECOND * (zoom || 1);
      const start = element.scrollLeft / pixelsPerSecond;
      const widthSeconds = element.clientWidth / pixelsPerSecond;
      const newStart = Number.isFinite(start) ? start : 0;
      const newEnd = Number.isFinite(widthSeconds) ? newStart + widthSeconds : duration || 0;
      const nextViewport = { start: Math.max(0, newStart), end: Math.max(newStart, newEnd) };
      setViewport(nextViewport);
      if (onViewportChange) {
        onViewportChange(nextViewport);
      }
    }, [zoom, duration, onViewportChange]);

    useEffect(() => {
      const element = containerRef.current;
      if (!element) {
        return undefined;
      }

      updateViewport();

      element.addEventListener('scroll', updateViewport, { passive: true });
      window.addEventListener('resize', updateViewport);

      let resizeObserver = null;
      if (typeof ResizeObserver === 'function') {
        resizeObserver = new ResizeObserver(updateViewport);
        resizeObserver.observe(element);
      }

      return () => {
        element.removeEventListener('scroll', updateViewport);
        window.removeEventListener('resize', updateViewport);
        if (resizeObserver) {
          resizeObserver.disconnect();
        }
      };
    }, [updateViewport]);

    useEffect(() => {
      updateViewport();
    }, [duration, zoom, updateViewport]);

    return { containerRef, viewport };
  }

  function ViewportControlPanel(props) {
    const [internalStart, setInternalStart] = useState(() => props.viewport.start);
    const [internalEnd, setInternalEnd] = useState(() => props.viewport.end);
    const zoomAnalytics = useMemo(() => TimelineCore.createZoomAnalytics(), []);

    useEffect(() => {
      setInternalStart(props.viewport.start);
      setInternalEnd(props.viewport.end);
    }, [props.viewport.start, props.viewport.end]);

    const handleApply = useCallback(() => {
      const nextStart = Math.max(0, Math.min(internalStart, props.duration));
      const clampedEnd = Math.max(nextStart, Math.min(internalEnd, props.duration));
      if (props.onViewportRequest) {
        props.onViewportRequest({ start: nextStart, end: clampedEnd });
      }
    }, [internalStart, internalEnd, props.duration, props.onViewportRequest]);

    const handleStartChange = useCallback((event) => {
      const value = Number.parseFloat(event.target.value);
      setInternalStart(Number.isFinite(value) ? value : 0);
    }, []);

    const handleEndChange = useCallback((event) => {
      const value = Number.parseFloat(event.target.value);
      setInternalEnd(Number.isFinite(value) ? value : 0);
    }, []);

    const handleCenterPlayhead = useCallback(() => {
      const playhead = props.playhead;
      const viewportSpan = Math.max(1, props.viewport.end - props.viewport.start);
      const halfSpan = viewportSpan / 2;
      const nextStart = Math.max(0, playhead - halfSpan);
      const nextEnd = Math.min(props.duration, playhead + halfSpan);
      if (props.onViewportRequest) {
        props.onViewportRequest({ start: nextStart, end: nextEnd });
      }
    }, [props.playhead, props.viewport.end, props.viewport.start, props.duration, props.onViewportRequest]);

    // Zoom friction analysis
    const zoomFrictionScore = useMemo(
      () => TimelineCore.getZoomFrictionScore(zoomAnalytics),
      [zoomAnalytics]
    );

    const handleZoomChange = useCallback((newZoom) => {
      const currentZoom = props.state?.zoom || 1;
      TimelineCore.trackZoomChange(zoomAnalytics, currentZoom, newZoom, 'viewport-control');

      if (props.onZoomChange) {
        props.onZoomChange(newZoom);
      }
    }, [props.onZoomChange, zoomAnalytics, props.state?.zoom]);

    return h(
      'div',
      { className: 'rounded-lg border border-slate-800 bg-slate-950/80 px-4 py-3 space-y-3' },
      h(
        'div',
        { className: 'flex items-center justify-between' },
        h('p', { className: 'text-sm font-semibold text-slate-200' }, 'Viewport Controls'),
        h(
          'div',
          { className: 'flex items-center gap-2' },
          h(
            'button',
            {
              className: 'px-3 py-1.5 rounded border border-slate-700 text-xs text-slate-200 hover:border-slate-500',
              onClick: handleCenterPlayhead
            },
            'Center Playhead'
          ),
          h(
            'button',
            {
              className: 'px-3 py-1.5 rounded border border-slate-700 text-xs text-slate-200 hover:border-slate-500',
              onClick: () => handleZoomChange(Math.min((props.state?.zoom || 1) + 0.5, TimelineCore.MAX_ZOOM))
            },
            'Zoom In'
          ),
          h(
            'button',
            {
              className: 'px-3 py-1.5 rounded border border-slate-700 text-xs text-slate-200 hover:border-slate-500',
              onClick: () => handleZoomChange(Math.max((props.state?.zoom || 1) - 0.5, TimelineCore.MIN_ZOOM))
            },
            'Zoom Out'
          )
        )
      ),

      // Zoom friction indicator
      zoomFrictionScore > 2 && h(
        'div',
        { className: 'text-xs text-amber-300 bg-amber-900/20 px-2 py-1 rounded' },
        `Zoom friction detected (${zoomFrictionScore.toFixed(1)})`
      ),

      h(
        'div',
        { className: 'grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-300' },
        h(
          'label',
          { className: 'flex flex-col gap-1' },
          h('span', { className: 'text-xs uppercase tracking-wide text-slate-400' }, 'Start (s)'),
          h('input', {
            type: 'number',
            step: 0.1,
            min: 0,
            max: props.duration,
            value: Number.isFinite(internalStart) ? internalStart : 0,
            onChange: handleStartChange,
            className: 'rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 focus:outline-none focus:ring focus:ring-indigo-500/40'
          })
        ),
        h(
          'label',
          { className: 'flex flex-col gap-1' },
          h('span', { className: 'text-xs uppercase tracking-wide text-slate-400' }, 'End (s)'),
          h('input', {
            type: 'number',
            step: 0.1,
            min: 0,
            max: props.duration,
            value: Number.isFinite(internalEnd) ? internalEnd : 0,
            onChange: handleEndChange,
            className: 'rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 focus:outline-none focus:ring focus:ring-indigo-500/40'
          })
        )
      ),
      h(
        'div',
        { className: 'flex items-center justify-end gap-2' },
        h(
          'button',
          {
            className: 'px-3 py-1.5 rounded border border-slate-700 text-xs text-slate-200 hover:border-slate-500',
            onClick: handleApply
          },
          'Apply'
        )
      ),
      h(
        'div',
        { className: 'text-xs text-slate-400 flex flex-wrap gap-3' },
        h('span', null, `Visible: ${TimelineCore.formatTimecode(props.viewport.start)} - ${TimelineCore.formatTimecode(props.viewport.end)}`),
        h('span', null, `Span: ${(props.viewport.end - props.viewport.start).toFixed(2)}s`)
      )
    );
  }

  function TimelineClip(props) {
    const clipSnapAnalytics = useMemo(() => TimelineCore.createClipSnapAnalytics(), []);
    const [snapGuides, setSnapGuides] = useState([]);
    const [lastSnapAnnouncement, setLastSnapAnnouncement] = useState('');

    const width = Math.max(4, props.clip.duration * props.pixelsPerSecond);
    const left = props.clip.start * props.pixelsPerSecond;
    const clipStyle = {
      left,
      width,
      backgroundColor: props.clip.color,
      cursor: 'grab'
    };

    const timeRange = `${TimelineCore.formatTimecode(props.clip.start)} - ${TimelineCore.formatTimecode(props.clip.start + props.clip.duration)}`;

    // Update snap guides when clip moves
    useEffect(() => {
      const guides = TimelineCore.createSnapGuides(
        props.allClips || [],
        props.clip.start,
        0.5 // 0.5 second tolerance
      );
      setSnapGuides(guides);
    }, [props.clip.start, props.allClips]);

    const handlePointerDown = useCallback((event, clip) => {
      const startX = event.clientX;
      const initialStart = clip.start;
      let hasSnapped = false;

      const handler = (moveEvent) => {
        const deltaPixels = moveEvent.clientX - startX;
        const deltaSeconds = deltaPixels / props.pixelsPerSecond;
        const attemptedPosition = initialStart + deltaSeconds;

        // Find nearest snap point
        let snappedPosition = attemptedPosition;
        let snapGuide = null;

        for (const guide of snapGuides) {
          if (Math.abs(guide.position - attemptedPosition) <= 0.1) {
            snappedPosition = guide.position;
            snapGuide = guide;
            break;
          }
        }

        // Track snap attempt
        TimelineCore.trackClipSnapAttempt(
          clipSnapAnalytics,
          attemptedPosition,
          snappedPosition,
          0.1,
          'timeline-drag'
        );

        if (snapGuide && !hasSnapped) {
          hasSnapped = true;
          setLastSnapAnnouncement(`Snapped to ${snapGuide.label}`);
        } else if (!snapGuide && hasSnapped) {
          hasSnapped = false;
          setLastSnapAnnouncement('');
        }

        props.dispatch({ type: 'MOVE_CLIP', clipId: clip.id, start: TimelineCore.roundToFrame(snappedPosition) });
      };

      const stopHandler = () => {
        window.removeEventListener('pointermove', handler);
        window.removeEventListener('pointerup', stopHandler);
        setLastSnapAnnouncement('');
      };

      window.addEventListener('pointermove', handler);
      window.addEventListener('pointerup', stopHandler, { once: true });
    }, [props.dispatch, props.pixelsPerSecond, snapGuides, clipSnapAnalytics]);

    let waveformStatusElement = null;
    if (props.clip.type === 'audio') {
      const waveform = props.waveform;
      if (waveform && waveform.status === 'ready') {
        const bucketCount = waveform.data?.bucketCount ?? 0;
        waveformStatusElement = h(
          'span',
          { className: 'text-[10px] uppercase tracking-wide text-emerald-300' },
          bucketCount ? `Waveform cached (${bucketCount})` : 'Waveform cached'
        );
      } else if (waveform && waveform.status === 'pending') {
        waveformStatusElement = h(
          'span',
          { className: 'text-[10px] uppercase tracking-wide text-indigo-300 animate-pulse' },
          'Waveform caching'
        );
      } else if (waveform && waveform.status === 'error') {
        waveformStatusElement = h(
          'span',
          { className: 'text-[10px] uppercase tracking-wide text-rose-300' },
          'Waveform error'
        );
      } else {
        waveformStatusElement = h(
          'span',
          { className: 'text-[10px] uppercase tracking-wide text-slate-400' },
          'Waveform idle'
        );
      }
    }

    const snapFrictionScore = useMemo(
      () => TimelineCore.getClipSnapFrictionScore(clipSnapAnalytics),
      [clipSnapAnalytics]
    );

    return h(
      'div',
      {
        className: `absolute top-1 h-[44px] rounded border transition-colors ${props.isSelected ? 'border-slate-50 ring-2 ring-indigo-400/70' : 'border-slate-700'}`,
        style: clipStyle,
        role: 'button',
        tabIndex: props.isSelected ? 0 : -1,
        'aria-label': `${props.clip.name} clip, ${timeRange}, ${props.isSelected ? 'selected' : 'not selected'}${snapFrictionScore > 2 ? ', snap friction detected' : ''}`,
        'aria-describedby': `clip-${props.clip.id}-description`,
        onClick: (event) => {
          event.stopPropagation();
          props.onSelect(props.clip.id);
        },
        onPointerDown: (event) => {
          event.stopPropagation();
          handlePointerDown(event, props.clip);
        },
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            props.onSelect(props.clip.id);
          }
        }
      },
      h(
        'div',
        { className: 'h-full px-2 flex flex-col justify-center text-sm text-white/90 select-none' },
        h('span', { className: 'font-medium truncate' }, props.clip.name),
        h('span', { className: 'text-xs text-white/70' }, timeRange),
        waveformStatusElement,
        snapFrictionScore > 3 && h(
          'span',
          { className: 'text-[9px] text-amber-300' },
          '⚠️ Snap issues'
        )
      ),
      h(
        'div',
        {
          id: `clip-${props.clip.id}-description`,
          className: 'sr-only'
        },
        `${props.clip.type} clip from ${TimelineCore.formatTimecode(props.clip.start)} to ${TimelineCore.formatTimecode(props.clip.start + props.clip.duration)}, duration ${props.clip.duration.toFixed(2)} seconds`
      ),
      // Live region for snap announcements
      lastSnapAnnouncement && h(
        'div',
        {
          'aria-live': 'assertive',
          'aria-atomic': 'true',
          className: 'sr-only'
        },
        lastSnapAnnouncement
      )
    );
  }

  function TrackLane(props) {
    const backgroundStyle = {
      backgroundImage: 'linear-gradient(to right, rgba(148, 163, 184, 0.12) 1px, transparent 1px), linear-gradient(to right, rgba(51, 65, 85, 0.35) 1px, transparent 1px)',
      backgroundSize: `${props.pixelsPerSecond}px 100%, ${Math.max(props.pixelsPerSecond / TimelineCore.FRAME_RATE, 6)}px 100%`
    };

    return h(
      'div',
      {
        className: 'bg-slate-900/40 border border-slate-800 rounded-lg',
        role: 'region',
        'aria-label': `${props.track.name} track, ${props.track.type} type, ${props.clips.length} clips`
      },
      h(
        'div',
        { className: 'flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-950/60' },
        h(
          'div',
          null,
          h('p', { className: 'text-sm font-semibold text-slate-200' }, props.track.name),
          h('p', { className: 'text-xs text-slate-400 uppercase tracking-wide' }, props.track.type)
        )
      ),
      h(
        'div',
        {
          className: 'relative h-16 overflow-hidden',
          style: backgroundStyle,
          role: 'group',
          'aria-label': 'Timeline track lane',
          onDoubleClick: () => props.dispatch({ type: 'SELECT_CLIP', clipId: null })
        },
        props.clips.map((clip) =>
          h(TimelineClip, {
            key: clip.id,
            clip,
            pixelsPerSecond: props.pixelsPerSecond,
            isSelected: props.state.selectedClipId === clip.id,
            onSelect: (clipId) => props.dispatch({ type: 'SELECT_CLIP', clipId }),
            onPointerDown: props.onPointerDown,
            waveform: props.waveforms ? props.waveforms[clip.id] : null
          })
        )
      )
    );
  }

  function TimeRuler(props) {
    const markers = useMemo(() => {
      const totalSeconds = Math.ceil(props.duration || 0);
      const result = [];
      for (let second = 0; second <= totalSeconds; second += 1) {
        result.push({ second, left: second * props.pixelsPerSecond });
      }
      return result;
    }, [props.duration, props.pixelsPerSecond]);

    return h(
      'div',
      {
        className: 'relative h-12 border-b border-slate-800 bg-slate-950/70',
        role: 'navigation',
        'aria-label': 'Timeline time ruler'
      },
      markers.map((marker) =>
        h(
          'div',
          {
            key: marker.second,
            className: 'absolute top-0 h-full border-r border-slate-700/70',
            style: { left: marker.left },
            role: 'mark',
            'aria-label': `Time marker at ${TimelineCore.formatTimecode(marker.second)}`
          },
          h('span', {
            className: 'absolute top-1 left-1 text-xs text-slate-400',
            'aria-hidden': 'true'
          }, TimelineCore.formatTimecode(marker.second))
        )
      )
    );
  }

  function Playhead(props) {
    const left = props.playhead * props.pixelsPerSecond;
    return h(
      'div',
      {
        className: 'absolute top-0 bottom-0 w-px bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.6)]',
        style: { left },
        role: 'img',
        'aria-label': `Playhead at ${TimelineCore.formatTimecode(props.playhead)}`
      },
      h(
        'div',
        {
          className: 'absolute -top-3 -translate-x-1/2 px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-xs font-semibold',
          'aria-live': 'polite'
        },
        TimelineCore.formatTimecode(props.playhead)
      )
    );
  }

  function TimelineViewport(props) {
    const pixelsPerSecond = TimelineCore.BASE_PIXELS_PER_SECOND * props.state.zoom;
    const timelineWidth = TimelineCore.computeTimelineWidth(props.state, pixelsPerSecond);
    const viewportState = useTimelineViewportState(props.state.duration, props.state.zoom, {
      onViewportChange: props.onViewportChange
    });
    const { containerRef, viewport } = viewportState;
    const handleVirtualizationMetrics = useCallback(
      (metrics, stateSnapshot, viewportSnapshot) => {
        if (typeof props.onVirtualizationMetrics === 'function') {
          props.onVirtualizationMetrics(metrics);
        }

        if (
          typeof window !== 'undefined' &&
          typeof window.dispatchEvent === 'function' &&
          typeof window.CustomEvent === 'function'
        ) {
          try {
            window.dispatchEvent(
              new window.CustomEvent('artone:timeline-virtualization-metrics', {
                detail: {
                  metrics,
                  state: stateSnapshot,
                  viewport: viewportSnapshot
                }
              })
            );
          } catch (error) {
            productionLogger.error('TimelineViewport metrics dispatch failed:', error);
          }
        }
      },
      [props.onVirtualizationMetrics]
    );

    const virtualizer = useMemo(
      () =>
        TimelineCore.createClipVirtualizer({
          onMetrics: handleVirtualizationMetrics
        }),
      [handleVirtualizationMetrics]
    );
    const virtualized = useMemo(
      () => virtualizer(props.state, { viewportStart: viewport.start, viewportEnd: viewport.end }),
      [props.state, viewport, virtualizer]
    );

    const onPointerDown = useCallback(
      (event, clip) => {
        const startX = event.clientX;
        const initialStart = clip.start;
        const handler = (moveEvent) => {
          const deltaPixels = moveEvent.clientX - startX;
          const deltaSeconds = deltaPixels / pixelsPerSecond;
          const nextStart = TimelineCore.roundToFrame(initialStart + deltaSeconds);
          props.dispatch({ type: 'MOVE_CLIP', clipId: clip.id, start: nextStart });
        };
        const stopHandler = () => {
          window.removeEventListener('pointermove', handler);
          window.removeEventListener('pointerup', stopHandler);
        };
        window.addEventListener('pointermove', handler);
        window.addEventListener('pointerup', stopHandler, { once: true });
      },
      [props.dispatch, pixelsPerSecond]
    );

    const handleClick = useCallback(
      (event) => {
        const element = event.currentTarget.getBoundingClientRect();
        const offsetX = event.clientX - element.left;
        const seconds = offsetX / pixelsPerSecond;
        props.dispatch({ type: 'SET_PLAYHEAD', seconds });
      },
      [pixelsPerSecond, props.dispatch]
    );

    const handleViewportRequest = useCallback(
      (requestedViewport) => {
        const element = containerRef.current;
        if (!element) {
          return;
        }
        const pixels = requestedViewport.start * pixelsPerSecond;
        element.scrollTo({ left: pixels, behavior: 'smooth' });
      },
      [containerRef, pixelsPerSecond]
    );
    useEffect(() => {
      if (typeof props.onVisibleClips === 'function' && virtualized && Array.isArray(virtualized.visibleClips)) {
        props.onVisibleClips(virtualized.visibleClips);
      }
    }, [virtualized, props.onVisibleClips]);

    const controls = h(ViewportControlPanel, {
      viewport,
      duration: props.state.duration,
      playhead: props.state.playhead,
      onViewportRequest: handleViewportRequest
    });

    const trackList = h(
      'div',
      { className: 'flex flex-col gap-2' },
      virtualized.tracks.map((track) =>
        h(TrackLane, {
          key: track.id,
          track,
          clips: virtualized.clipsByTrack[track.id] || [],
          pixelsPerSecond,
          dispatch: props.dispatch,
          state: props.state,
          onPointerDown,
          waveforms: props.waveforms
        })
      )
    );

    const timelineBody = h(
      'div',
      {
        className: 'relative overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/70',
        ref: containerRef
      },
      h(
        'div',
        {
          className: 'min-w-full',
          style: { width: timelineWidth },
          onClick: handleClick
        },
        h(TimeRuler, { duration: props.state.duration, pixelsPerSecond }),
        h(
          'div',
          { className: 'relative' },
          trackList,
          h(Playhead, { playhead: props.state.playhead, pixelsPerSecond })
        )
      )
    );

    return h('div', {
      className: 'space-y-3',
      role: 'application',
      'aria-label': 'Video timeline editor',
      'aria-describedby': 'timeline-description'
    },
    h('div', {
      id: 'timeline-description',
      className: 'sr-only'
    }, 'Interactive video timeline with multiple tracks, clips, and playback controls'),
    controls, timelineBody);
  }

  global.TimelineComponents = Object.freeze({
    useTimelineViewportState,
    TimelineViewport,
    TimelineClip,
    TimeRuler,
    Playhead,
    ViewportControlPanel
  });
})(typeof window !== 'undefined' ? window : globalThis);
