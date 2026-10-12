import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export type EqualizerBand = 'bass' | 'mid' | 'treble';
export type EqualizerPreset = 'flat' | 'voice' | 'warm' | 'bright' | 'custom';
type Levels = Record<EqualizerBand, number>;
const presets: Record<Exclude<EqualizerPreset, 'custom'>, Levels> = {
  flat: { bass: 0, mid: 0, treble: 0 },
  voice: { bass: -3, mid: 4, treble: 2 },
  warm: { bass: 4, mid: 1, treble: -2 },
  bright: { bass: -1, mid: 1, treble: 4 },
};
type Graph = {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  filters: Record<EqualizerBand, BiquadFilterNode>;
};

// Audio routing is only created following an explicit listener action. Browser
// media security requires a CORS-enabled source for cross-origin EQ processing.
// If it is not available the original unprocessed audio remains unaffected.
export function useNightjarEqualizer(audioRef: RefObject<HTMLAudioElement | null>) {
  const graph = useRef<Graph | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [preset, setPreset] = useState<EqualizerPreset>('flat');
  const [levels, setLevels] = useState<Levels>(presets.flat);
  const [message, setMessage] = useState('');

  const route = useCallback((on: boolean, input?: Levels) => {
    const g = graph.current;
    if (!g) return;
    const values = input ?? levels;
    g.source.disconnect();
    for (const filter of Object.values(g.filters)) filter.disconnect();
    if (!on) {
      g.source.connect(g.context.destination);
    } else {
      g.filters.bass.gain.value = values.bass;
      g.filters.mid.gain.value = values.mid;
      g.filters.treble.gain.value = values.treble;
      g.source.connect(g.filters.bass);
      g.filters.bass.connect(g.filters.mid);
      g.filters.mid.connect(g.filters.treble);
      g.filters.treble.connect(g.context.destination);
    }
  }, [levels]);

  const toggle = useCallback(async () => {
    if (enabled) {
      route(false);
      setEnabled(false);
      setMessage('Equalizer bypassed; original audio unchanged.');
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    setMessage('');
    let switchedToCors = false;
    let resumeTime = 0;
    let wasPlaying = false;
    try {
      if (!graph.current) {
        if (!('AudioContext' in window)) throw new Error('Web Audio is not available on this device.');
        const src = audio.currentSrc || audio.src;
        if (src && new URL(src, window.location.href).origin !== window.location.origin) {
          // Never replace an actively playing track with an unverified
          // crossorigin request: it could turn a playable track into an error.
          // Signed Firebase/GCS playback URLs commonly permit GET, not HEAD.
          // Request one byte, then cancel the body immediately to avoid
          // downloading the entire recording merely to check CORS support.
          const response = await fetch(src, {
            method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store',
            headers: { Range: 'bytes=0-0' },
          });
          void response.body?.cancel().catch(() => {});
          if (!response.ok) throw new Error('This audio source does not permit EQ processing in your browser.');
          wasPlaying = !audio.paused;
          resumeTime = audio.currentTime;
          audio.crossOrigin = 'anonymous';
          switchedToCors = true;
          audio.load();
          await new Promise<void>((resolve, reject) => {
            const id = window.setTimeout(() => reject(new Error('Audio processing setup timed out.')), 8000);
            const done = () => { window.clearTimeout(id); audio.removeEventListener('loadedmetadata', ok); audio.removeEventListener('error', fail); };
            const ok = () => { done(); resolve(); };
            const fail = () => { done(); reject(new Error('Audio source could not be reloaded for EQ.')); };
            audio.addEventListener('loadedmetadata', ok);
            audio.addEventListener('error', fail);
          });
          if (resumeTime > 0 && Number.isFinite(audio.duration)) audio.currentTime = Math.min(resumeTime, Math.max(0, audio.duration - 0.5));
          if (wasPlaying) void audio.play().catch(() => {});
        }
        const context = new AudioContext();
        const source = context.createMediaElementSource(audio);
        const bass = context.createBiquadFilter();
        bass.type = 'lowshelf'; bass.frequency.value = 180;
        const mid = context.createBiquadFilter();
        mid.type = 'peaking'; mid.frequency.value = 1200; mid.Q.value = 0.85;
        const treble = context.createBiquadFilter();
        treble.type = 'highshelf'; treble.frequency.value = 4200;
        graph.current = { context, source, filters: { bass, mid, treble } };
      }
      await graph.current.context.resume();
      route(true);
      setEnabled(true);
      setMessage('EQ processing active.');
    } catch (error) {
      if (graph.current) route(false);
      // If the source cannot reload with CORS, restore the original media
      // request so signed/private audio remains playable without EQ.
      if (switchedToCors && !graph.current) {
        audio.crossOrigin = null;
        audio.load();
        audio.addEventListener('loadedmetadata', () => {
          if (resumeTime > 0 && Number.isFinite(audio.duration)) audio.currentTime = Math.min(resumeTime, Math.max(0, audio.duration - .5));
          if (wasPlaying) void audio.play().catch(() => {});
        }, { once: true });
      }
      setEnabled(false);
      setMessage(error instanceof Error ? error.message : 'EQ is not supported for this audio source.');
    }
  }, [audioRef, enabled, route]);

  const applyPreset = (value: Exclude<EqualizerPreset, 'custom'>) => {
    const next = { ...presets[value] };
    setPreset(value);
    setLevels(next);
    if (enabled) route(true, next);
  };
  const updateBand = (band: EqualizerBand, gain: number) => {
    const next = { ...levels, [band]: Math.min(12, Math.max(-12, gain)) };
    setPreset('custom');
    setLevels(next);
    if (enabled) route(true, next);
  };
  useEffect(() => () => {
    if (graph.current) {
      void graph.current.context.close().catch(() => {});
      graph.current = null;
    }
  }, []);

  return { enabled, preset, levels, message, toggle, applyPreset, updateBand };
}
