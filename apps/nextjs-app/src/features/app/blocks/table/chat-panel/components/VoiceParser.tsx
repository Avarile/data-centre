'use client';

import { aiTtsStream } from '@teable/openapi';
import { Mic, MicOff, StopCircle, Volume2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PromptInputButton,
  usePromptInputController,
} from '../../../../../../components/ai-elements/prompt-input';

// Browser speech recognition types (not in lib.dom.d.ts for all targets)
interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onstart: ((ev: Event) => void) | null;
  onend: ((ev: Event) => void) | null;
  onresult: ((ev: ISpeechRecognitionEvent) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
}

interface ISpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => ISpeechRecognition;
    webkitSpeechRecognition?: new () => ISpeechRecognition;
  }
}

// Strip markdown and emoji from AI output before sending to TTS.
// Keeps only plain readable prose — tables, code blocks, and decorative
// characters add noise and confuse the speech model.
function stripForTts(raw: string): string {
  return (
    raw
      // Fenced code blocks (``` or ~~~)
      .replace(/```[\s\S]*?```/g, '')
      .replace(/~~~[\s\S]*?~~~/g, '')
      // Markdown table rows: any line fully wrapped in pipes
      .replace(/^\|.+\|$/gm, '')
      // Leftover table separator lines (--|--|-- or :---:)
      .replace(/^[-|: ]+$/gm, '')
      // Inline code
      .replace(/`[^`\n]+`/g, '')
      // ATX headings (# Heading → Heading)
      .replace(/^#{1,6}\s+/gm, '')
      // Bold / italic markers — preserve inner text
      .replace(/\*{1,3}([^*\n]+)\*{1,3}/g, '$1')
      .replace(/_{1,3}([^_\n]+)_{1,3}/g, '$1')
      // Images: ![alt](url) → alt
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      // Links: [label](url) → label
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      // HTML tags
      .replace(/<[^>]+>/g, '')
      // Emojis (Extended_Pictographic covers all standard emoji code points)
      .replace(/\p{Extended_Pictographic}/gu, '')
      // Leftover variation selectors and ZWJ from emoji sequences
      .replace(/[\u{FE00}-\u{FE0F}\u{200D}]/gu, '')
      // Collapse multiple blank lines
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

interface IVoiceParserProps {
  baseId: string;
  isStreaming: boolean;
  lastAssistantMessage: string;
}

export const VoiceParser = ({ baseId, isStreaming, lastAssistantMessage }: IVoiceParserProps) => {
  const controller = usePromptInputController();

  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const prevIsStreamingRef = useRef(false);
  // Stable ref to setInput — avoids re-initialising recognition on every text change
  const setInputRef = useRef(controller.textInput.setInput);
  setInputRef.current = controller.textInput.setInput;

  const sttSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  // ---------------------------------------------------------------------------
  // TTS helpers
  // ---------------------------------------------------------------------------

  const stopSpeaking = useCallback(() => {
    ttsAbortRef.current?.abort();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setIsSpeaking(false);
  }, []);

  const playTts = useCallback(
    async (text: string, fromUserGesture = false) => {
      if (!text.trim()) return;

      stopSpeaking();

      // Unlock the audio element within the current user gesture so that the
      // subsequent play() call after the async fetch is not blocked by autoplay
      // policy (browsers expire transient activation after ~5 s).
      if (fromUserGesture) {
        if (!audioRef.current) {
          audioRef.current = new Audio();
        }
        audioRef.current.src = '';
        audioRef.current.load();
      }

      const cleanText = stripForTts(text);
      if (!cleanText) return;

      const abortCtrl = new AbortController();
      ttsAbortRef.current = abortCtrl;

      try {
        const res = await aiTtsStream(baseId, cleanText, abortCtrl.signal);
        if (!res.ok || !res.body) {
          console.error('[TTS] bad response:', res.status);
          return;
        }

        const blob = await res.blob();
        if (blob.size === 0) {
          console.error('[TTS] received empty audio blob');
          return;
        }

        const url = URL.createObjectURL(blob);

        if (!audioRef.current) {
          audioRef.current = new Audio();
        }
        const audio = audioRef.current;
        audio.onerror = (e) => {
          console.error('[TTS] audio element error:', e);
          URL.revokeObjectURL(url);
          setIsSpeaking(false);
        };
        audio.onended = () => {
          URL.revokeObjectURL(url);
          setIsSpeaking(false);
        };
        audio.src = url;
        setIsSpeaking(true);
        await audio.play();
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('[TTS] play error:', err);
        setIsSpeaking(false);
      }
    },
    [baseId, stopSpeaking]
  );

  // ---------------------------------------------------------------------------
  // Speech recognition
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!sttSupported) return;

    const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';

    recognition.onresult = (event: ISpeechRecognitionEvent) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0]?.transcript ?? '';
      }
      if (transcript.trim()) {
        setInputRef.current(transcript);
      }
    };

    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, [sttSupported]);

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setIsVoiceActive(true);
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch {
        // recognition already started or browser blocked mic
      }
    }
  }, [isListening]);

  // Auto-play TTS after each AI reply when voice mode is active.
  // fromUserGesture is false here — we rely on sticky activation from the
  // prior mic-button click; if the browser blocks it the error is logged.
  useEffect(() => {
    const justFinished = prevIsStreamingRef.current && !isStreaming;
    prevIsStreamingRef.current = isStreaming;

    if (!justFinished || !isVoiceActive) return;
    void playTts(lastAssistantMessage, false);
  }, [isStreaming, isVoiceActive, lastAssistantMessage, playTts]);

  // Cleanup on unmount
  useEffect(
    () => () => {
      ttsAbortRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    },
    []
  );

  const canSpeak = !!lastAssistantMessage && !isStreaming;

  return (
    <div className="flex items-center gap-0.5">
      {/* Read-aloud button — always visible, play/stop toggle */}
      <PromptInputButton
        tooltip={isSpeaking ? 'Stop reading' : 'Read response aloud'}
        disabled={!canSpeak && !isSpeaking}
        onClick={() => (isSpeaking ? stopSpeaking() : void playTts(lastAssistantMessage, true))}
      >
        {isSpeaking ? (
          <StopCircle className="size-4 text-primary" />
        ) : (
          <Volume2 className="size-4" />
        )}
      </PromptInputButton>

      {/* Mic button — only rendered when STT is available */}
      {sttSupported && (
        <div className="relative inline-flex">
          {isListening && (
            <span className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-destructive/25" />
          )}
          <PromptInputButton
            tooltip={isListening ? 'Stop listening' : 'Voice input'}
            onClick={toggleListening}
            className={isListening ? 'text-destructive' : undefined}
          >
            {isListening ? (
              <MicOff className="relative size-4" />
            ) : (
              <Mic className="relative size-4" />
            )}
          </PromptInputButton>
        </div>
      )}
    </div>
  );
};
