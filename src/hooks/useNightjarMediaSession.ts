import { useEffect } from 'react';

export type MediaSessionTrack = {
  id: string;
  title: string;
  creator: string;
  artworkUrl?: string | null;
};

type Settings = {
  track: MediaSessionTrack | null;
  previousTrack: MediaSessionTrack | null;
  nextTrack: MediaSessionTrack | null;
  enabled: boolean;
  playing: boolean;
  position: number;
  duration: number;
  audio: () => HTMLAudioElement | null;
  onSelectTrack?: (track: MediaSessionTrack) => void;
  onClose: () => void;
};

const actions = [
  'play', 'pause', 'stop', 'previoustrack', 'nexttrack', 'seekbackward', 'seekforward', 'seekto',
] as const;

/** Native Android/Chrome/PWA notification, headphone and lock-screen actions.
 * Handlers always act on the single authorised Nightjar playback element.
 * The OS decides which controls it displays; no phone/OS permissions are bypassed.
 */
export function useNightjarMediaSession({
  track, previousTrack, nextTrack, enabled, playing, position, duration, audio, onSelectTrack, onClose,
}: Settings) {
  useEffect(() => {
    if (!enabled || !track || !('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    if (typeof MediaMetadata !== 'undefined') {
      session.metadata = new MediaMetadata({
        title: track.title || 'Nightjar audio',
        artist: track.creator || 'Nightjar creator',
        album: 'Nightjar · Audio after dark',
        artwork: [{ src: track.artworkUrl || '/nightjar-home-512.png', sizes: '512x512', type: 'image/png' }],
      });
    }

    const safeRegister = (action: MediaSessionAction, callback: MediaSessionActionHandler | null) => {
      try { session.setActionHandler(action, callback); }
      catch { /* Some Android browsers omit certain hardware actions. */ }
    };
    const seek = (target: number) => {
      const node = audio();
      if (!node) return;
      const end = Number.isFinite(node.duration) ? node.duration : Math.max(duration, target);
      node.currentTime = Math.max(0, Math.min(target, end));
    };
    safeRegister('play', () => { const node = audio(); if (node) void node.play().catch(() => {}); });
    safeRegister('pause', () => audio()?.pause());
    safeRegister('stop', () => { audio()?.pause(); onClose(); });
    safeRegister('previoustrack', previousTrack && onSelectTrack
      ? () => onSelectTrack(previousTrack)
      : () => seek(0));
    safeRegister('nexttrack', nextTrack && onSelectTrack
      ? () => onSelectTrack(nextTrack)
      : null);
    safeRegister('seekbackward', (details) => { const node = audio(); if (node) seek(node.currentTime - (details.seekOffset || 15)); });
    safeRegister('seekforward', (details) => { const node = audio(); if (node) seek(node.currentTime + (details.seekOffset || 15)); });
    safeRegister('seekto', (details) => {
      if (typeof details.seekTime !== 'number' || !Number.isFinite(details.seekTime)) return;
      const node = audio();
      if (node && details.fastSeek && 'fastSeek' in node) node.fastSeek(details.seekTime);
      else seek(details.seekTime);
    });

    return () => {
      for (const action of actions) safeRegister(action, null);
      session.playbackState = 'none';
      session.metadata = null;
    };
  }, [enabled, track?.id, track?.title, track?.creator, track?.artworkUrl, previousTrack?.id, nextTrack?.id, onSelectTrack, onClose, duration]);

  useEffect(() => {
    if (!enabled || !('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }, [enabled, playing, track?.id]);

  useEffect(() => {
    if (!enabled || !('mediaSession' in navigator) || !Number.isFinite(duration) || duration <= 1) return;
    try {
      navigator.mediaSession.setPositionState({
        duration, playbackRate: audio()?.playbackRate || 1, position: Math.max(0, Math.min(position, duration)),
      });
    } catch { /* Media position is optional in older WebView versions. */ }
  }, [enabled, position, duration, track?.id]);
}
