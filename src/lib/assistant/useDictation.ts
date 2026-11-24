'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { fixName, heard, joinSaid } from './dictation';

/*
 * Metis's mic: the browser's speech-to-text (Chrome, and the Android app, which is Chrome) into the
 * message box. Shared by the Metis page in the app (/admin/assistant) and the full-screen chat
 * (/admin/metis).
 */

/* Browser speech-to-text. Not in TypeScript's DOM types yet. */
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
/** A dictation in progress: `keep` — carry on to the next sentence; `live` — its words still go in the box. */
type Mic = { r: Recognition; keep: boolean; live: boolean };

function hush(m: Mic | null) {
  if (!m) return;
  m.keep = false;
  m.live = false;
  try {
    m.r.abort();
  } catch {}
}
/** Whether this browser has speech-to-text. False on the server, so the first render matches it. */
const noSubscribe = () => () => {};
function hasSpeech() {
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}
function makeRecognition(): Recognition | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const C = w.SpeechRecognition || w.webkitSpeechRecognition;
  return C ? new C() : null;
}

/**
 * `text`/`setText`: the message box. Returns whether the browser can listen, whether it is listening,
 * `toggle` (start, or stop and keep what was heard) and `hush` (stop and drop anything still coming,
 * e.g. once the message is sent).
 */
export function useDictation(text: string, setText: (t: string) => void) {
  const canListen = useSyncExternalStore(noSubscribe, hasSpeech, () => false);
  const [listening, setListening] = useState(false);
  const mic = useRef<Mic | null>(null);
  const current = useRef(text);
  useEffect(() => {
    current.current = text;
  }, [text]);

  // Leaving the page mid-dictation switches the mic off.
  useEffect(() => () => hush(mic.current), []);

  const stopAll = useCallback(() => {
    hush(mic.current);
    mic.current = null;
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (mic.current) {
      mic.current.keep = false;
      mic.current.r.stop();
      return;
    }
    // Chrome on Android can't listen continuously (see dictation.ts), so there it hears one sentence at a time.
    // Big Android tablets ask for desktop sites and call themselves Linux; a touchscreen gives them away.
    const ua = navigator.userAgent;
    const oneSentence = /Android/i.test(ua) || (/\bLinux\b/.test(ua) && !/CrOS/.test(ua) && navigator.maxTouchPoints > 0);
    let said = current.current;
    const m: Mic = { r: null as unknown as Recognition, keep: true, live: true };
    const done = () => {
      if (mic.current !== m) return; // already sent, or a newer dictation has the mic
      mic.current = null;
      setListening(false);
    };
    const begin = () => {
      const r = makeRecognition();
      if (!r) return done();
      r.lang = 'en-GB';
      r.continuous = !oneSentence;
      r.interimResults = true;
      let now = '';
      r.onresult = (e) => {
        if (!m.live) return;
        now = heard(Array.from(e.results, (x) => x[0]?.transcript ?? ''), oneSentence);
        setText(fixName(joinSaid(said, now)));
      };
      // Any error (no speech for a while, no permission, no signal) ends it; onend still runs.
      r.onerror = () => {
        m.keep = false;
      };
      r.onend = () => {
        if (!m.live) return done();
        said = joinSaid(said, now);
        if (oneSentence && m.keep && now) begin();
        else done();
      };
      m.r = r;
      try {
        r.start();
      } catch {
        done();
      }
    };
    mic.current = m;
    setListening(true);
    begin();
  }, [setText]);

  return { canListen, listening, toggle, hush: stopAll };
}
