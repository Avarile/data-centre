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
    async (text: string) => {
      if (!text.trim()) return;

      stopSpeaking();

      const abortCtrl = new AbortController();
      ttsAbortRef.current = abortCtrl;

      try {
        const res = await aiTtsStream(baseId, text, abortCtrl.signal);
        if (!res.ok || !res.body) return;

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        if (!audioRef.current) {
          audioRef.current = new Audio();
        }
        audioRef.current.src = url;
        audioRef.current.onended = () => {
          URL.revokeObjectURL(url);
          setIsSpeaking(false);
        };
        setIsSpeaking(true);
        await audioRef.current.play();
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
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

  // Auto-play TTS after each AI reply when voice mode is active
  useEffect(() => {
    const justFinished = prevIsStreamingRef.current && !isStreaming;
    prevIsStreamingRef.current = isStreaming;

    if (!justFinished || !isVoiceActive) return;
    void playTts(lastAssistantMessage);
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
        onClick={() => (isSpeaking ? stopSpeaking() : void playTts(lastAssistantMessage))}
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
