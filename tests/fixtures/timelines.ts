/**
 * テスト共通フィクスチャ
 */

import type { ArtoneTimeline } from '../../interchange/otio';

export const sampleTimeline: ArtoneTimeline = {
  name: 'Test Project',
  fps: 30,
  videoTracks: [
    {
      name: 'V1',
      kind: 'video',
      enabled: true,
      clips: [
        {
          id: 'clip-1',
          name: 'Shot 1',
          startFrame: 0,
          durationFrames: 90,
          sourceInFrame: 0,
          mediaUrl: 'file:///tmp/clip1.mp4',
          effects: [],
          markers: [],
          enabled: true,
        },
        {
          id: 'clip-2',
          name: 'Shot 2',
          startFrame: 100,
          durationFrames: 60,
          sourceInFrame: 30,
          mediaUrl: 'file:///tmp/clip2.mp4',
          effects: [
            { type: 'colorGrade', name: 'Cool Look', params: { temp: -10 } },
          ],
          markers: [],
          enabled: true,
        },
      ],
    },
  ],
  audioTracks: [
    {
      name: 'A1',
      kind: 'audio',
      enabled: true,
      clips: [
        {
          id: 'audio-1',
          name: 'Music',
          startFrame: 0,
          durationFrames: 200,
          sourceInFrame: 0,
          mediaUrl: 'file:///tmp/music.wav',
          effects: [],
          markers: [],
          enabled: true,
        },
      ],
    },
  ],
  markers: [
    { frame: 50, duration: 1, color: 'red', name: 'Note', comment: 'Fix here' },
  ],
};
