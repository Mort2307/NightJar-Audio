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
const clampGain = (n: number) => Math.min(12, Math.max(-12, Number.isFinite(n) ? n : 0));
const presetKey = 'nightjar.player.equalizer.v1';
const readStored = (): { preset: EqualizerPreset; levels: Levels } => {
  const fallback = { preset: 'flat' as EqualizerPreset, levels: { ...presets.flat } };
  try {
    const stored = JSON.parse(window.localStorage.getItem(presetKey) || 'null');
    if (!stored || !['flat', 'voice', 'warm', 'bright', 'custom'].includes(stored.preset)) return fallback;
    if (stored.preset !== 'custom') return { preset: stored.preset, levels: { ...presets[stored.preset as Exclude<EqualizerPreset, 'custom'>] } };
    if (!stored.levels || !['bass', 'mid', 'treble'].every((band) => Number.isFinite(stored.levels[band]))) return fallback;
    return { preset: 'custom', levels: { bass: clampGain(stored.levels.bass), mid: clampGain(stored.levels.mid), treble: clampGain(stored.levels.treble) } };
  } catch { return fallback; }
};
const saveStored = (preset: EqualizerPreset, levels: Levels) => {
  try { window.localStorage.setItem(presetKey, JSON.stringify({ preset, levels })); }
  catch { /* private browser: audio processing still works for this session */ }
};

/**
 * Three real BiquadFilterNodes, chained after the protected media element.
 * Playback never has to pass through a broken filter: inactive graphs route
 * through the audio context's direct output.
 *
 * Protected cross-origin GCS URLs need bucket CORS permission for EQ. We
 * check it ONLY when the listener enables EQ (no extra network per play).
 * A failure leaves standard signed-URL playback intact and reports why.
 */
export function useNightjarEqualizer(audioRef: RefObject<HTMLAudioElement | null>) {
  const graph = useRef<Graph | null>(null);
  const configuring = useRef(false);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [settings, setSettings] = useState(readStored);
  const desiredLevelsRef = useRef<Levels>(settings.levels);
  const [message, setMessage] = useState('');

  const updateGains = useCallback((next: Levels) => {
    const g = graph.current;
    if (!g) return;
    for (const band of ['bass', 'mid', 'treble'] as const) {
      g.filters[band].gain.setTargetAtTime(next[band], g.context.currentTime, 0.025);
    }
  }, []);

  const route = useCallback((on: boolean) => {
    const g = graph.current;
    if (!g) return;
    g.source.disconnect();
    for (const filter of Object.values(g.filters)) filter.disconnect();
    if (!on) {
      g.source.connect(g.context.destination);
      return;
    }
    g.source.connect(g.filters.bass);
    g.filters.bass.connect(g.filters.mid);
    g.filters.mid.connect(g.filters.treble);
    g.filters.treble.connect(g.context.destination);
  }, []);

  const resumeProcessing = useCallback(() => {
    const context = graph.current?.context;
    if (context && context.state === 'suspended') void context.resume().catch(() => {
      setMessage('Your browser paused the audio engine. Tap Play to resume.');
    });
  }, []);

  const toggle = useCallback(async (desired?: Levels) => {
    if (configuring.current) return;
    if (enabled) {
      route(false);
      setEnabled(false);
      setMessage('EQ bypassed — original sound restored.');
      return;
    }
    const audio = audioRef.current;
    if (!audio) {
      setMessage('Open a playable Nightjar recording to use the equalizer.');
      return;
    }

    configuring.current = true;
    setBusy(true);
    setMessage('');
    let context: AudioContext | null = null;
    if (desired) desiredLevelsRef.current = desired;
    let switchedToCors = false;
    let position = 0;
    let previouslyPlaying = false;
    try {
      if (!graph.current) {
        if (!('AudioContext' in window)) throw new Error('This device does not support Web Audio equalizers.');
        // Context created and unlocked synchronously from the listener's tap.
        context = new AudioContext();
        void context.resume().catch(() => { /* status is checked below */ });
        const src = audio.currentSrc || audio.src;
        if (!src) throw new Error('Wait for the recording to load before enabling EQ.');
        if (new URL(src, window.location.href).origin !== window.location.origin) {
          // Request a one-byte range to establish CORS without fetching the
          // full audio. Signed URLs are never logged or stored.
          let response: Response;
          try {
            response = await fetch(src, {
              method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store',
              headers: { Range: 'bytes=0-0' },
            });
          } catch {
            throw new Error('This recording cannot be equalized until its audio storage allows browser CORS. Playback is unaffected.');
          }
          void response.body?.cancel().catch(() => {});
          if (!response.ok) throw new Error('EQ is unavailable for this audio source. Standard listening is unaffected.');

          position = audio.currentTime;
          previouslyPlaying = !audio.paused;
          audio.crossOrigin = 'anonymous';
          switchedToCors = true;
          const metadata = new Promise<void>((resolve, reject) => {
            const timeout = window.setTimeout(() => finish(false), 9000);
            const finish = (ok: boolean) => {
              window.clearTimeout(timeout);
              audio.removeEventListener('loadedmetadata', loaded);
              audio.removeEventListener('error', failed);
              if (ok) resolve();
              else reject(new Error('EQ-compatible audio reload failed; returning to standard playback.'));
            };
            const loaded = () => finish(true);
            const failed = () => finish(false);
            audio.addEventListener('loadedmetadata', loaded);
            audio.addEventListener('error', failed);
          });
          audio.load();
          await metadata;
          if (position > 0 && Number.isFinite(audio.duration)) audio.currentTime = Math.min(position, Math.max(0, audio.duration - .5));
        }

        const bass = context.createBiquadFilter();
        bass.type = 'lowshelf'; bass.frequency.value = 180;
        const mid = context.createBiquadFilter();
        mid.type = 'peaking'; mid.frequency.value = 1200; mid.Q.value = .85;
        const treble = context.createBiquadFilter();
        treble.type = 'highshelf'; treble.frequency.value = 4200;
        // Create the source LAST. Immediately connect it directly so even a
        // later routing failure doesn't leave the media node disconnected.
        const source = context.createMediaElementSource(audio);
        source.connect(context.destination);
        graph.current = { context, source, filters: { bass, mid, treble } };
      }

      if (graph.current.context.state !== 'running') await graph.current.context.resume();
      // Presets can change during the asynchronous CORS check; use the
      // latest user-selected levels instead of a stale closure.
      updateGains(desiredLevelsRef.current);
      route(true);
      setEnabled(true);
      setMessage('EQ active · sound processing connected.');
      // Re-activating a cross-origin media element can cost mobile browsers the
      // previous play permission. Make an attempt and explain any interruption.
      if (switchedToCors && previouslyPlaying) {
        try { await audio.play(); }
        catch { setMessage('EQ is ready. Tap Play once to continue this recording.'); }
      }
    } catch (error) {
      if (graph.current) route(false);
      if (context && !graph.current) void context.close().catch(() => {});
      if (switchedToCors && !graph.current) {
        // Restore the original protected request if CORS reload fails.
        audio.crossOrigin = null;
        const restore = () => {
          audio.removeEventListener('error', restore);
          if (position > 0 && Number.isFinite(audio.duration)) audio.currentTime = Math.min(position, Math.max(0, audio.duration - .5));
          if (previouslyPlaying) void audio.play().catch(() => {
            setMessage('Standard playback restored. Tap Play to continue.');
          });
        };
        audio.addEventListener('loadedmetadata', restore, { once: true });
        audio.load();
      }
      setEnabled(false);
      setMessage(error instanceof Error ? error.message : 'Equalizer unavailable; standard playback remains available.');
    } finally {
      configuring.current = false;
      setBusy(false);
    }
  }, [audioRef, enabled, route, updateGains]);

  const applyPreset = (preset: Exclude<EqualizerPreset, 'custom'>) => {
    const levels = { ...presets[preset] };
    desiredLevelsRef.current = levels;
    setSettings({ preset, levels });
    saveStored(preset, levels);
    if (enabled) updateGains(levels);
    else if (!configuring.current) void toggle(levels);
  };
  const updateBand = (band: EqualizerBand, gain: number) => {
    const levels = { ...desiredLevelsRef.current, [band]: clampGain(gain) };
    desiredLevelsRef.current = levels;
    setSettings({ preset: 'custom', levels });
    saveStored('custom', levels);
    if (enabled) updateGains(levels);
    else if (!configuring.current) void toggle(levels);
  };

  useEffect(() => () => {
    if (graph.current) {
      void graph.current.context.close().catch(() => {});
      graph.current = null;
    }
  }, []);

  return { enabled, busy, preset: settings.preset, levels: settings.levels, message, toggle, applyPreset, updateBand, resumeProcessing };
}
