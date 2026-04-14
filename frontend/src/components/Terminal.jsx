import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { X, Terminal as TerminalIcon, ZoomIn, ZoomOut, Mic, MicOff } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

const FONT_SIZE_KEY = 'terminal-font-size';

export default function ClaudeTerminal({ visible, onClose }) {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem(FONT_SIZE_KEY);
    return saved ? parseInt(saved, 10) : 14;
  });
  const [recording, setRecording] = useState(false);
  const wsRef = useRef(null);
  const sessionIdRef = useRef(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const mimeTypeRef = useRef('audio/webm');
  const streamRef = useRef(null);

  useEffect(() => {
    if (!visible) return;

    sessionIdRef.current += 1;
    const currentSession = sessionIdRef.current;

    console.log('[Terminal] Creating terminal, session:', currentSession);

    const term = new Terminal({
      cursorBlink: true,
      fontSize,
      fontFamily: '"Fira Code", "Cascadia Code", Consolas, monospace',
      theme: {
        background: '#0f172a',
        foreground: '#e2e8f0',
        cursor: '#a855f7',
      },
      scrollback: 10000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    if (terminalRef.current) {
      terminalRef.current.innerHTML = '';
      term.open(terminalRef.current);
      setTimeout(() => fitAddon.fit(), 100);
    }

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    term.writeln('\x1b[33mInicializando terminal...\x1b[0m');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/terminal`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (currentSession !== sessionIdRef.current) return;
      term.writeln('\x1b[32mConectado al servidor WebSocket\x1b[0m');
      setConnected(true);
      term.focus();
      setTimeout(() => { try { fitAddon.fit(); term.focus(); } catch {} }, 100);
    };

    ws.onmessage = (event) => {
      if (currentSession !== sessionIdRef.current) return;
      term.write(event.data);
    };

    ws.onclose = () => {
      if (currentSession !== sessionIdRef.current) return;
      term.writeln('\x1b[33mConexión cerrada\x1b[0m');
      setConnected(false);
    };

    ws.onerror = () => {
      if (currentSession !== sessionIdRef.current) return;
      term.writeln('\x1b[31mError de conexión\x1b[0m');
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    const handleResize = () => {
      setTimeout(() => { try { fitAddon.fit(); } catch {} }, 100);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      console.log('[Terminal] Cleanup running, session:', currentSession);
      window.removeEventListener('resize', handleResize);
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (xtermRef.current) {
        xtermRef.current.dispose();
      }
      fitAddonRef.current = null;
    };
  }, [visible]);

  useEffect(() => {
    if (xtermRef.current && fontSize) {
      xtermRef.current.options.fontSize = fontSize;
      setTimeout(() => {
        try { fitAddonRef.current?.fit(); } catch {}
      }, 100);
    }
  }, [fontSize]);

  useEffect(() => {
    if (visible && fitAddonRef.current) {
      setTimeout(() => { try { fitAddonRef.current?.fit(); } catch {} }, 100);
    }
  }, [visible]);

  const adjustFontSize = (delta) => {
    const newSize = Math.max(8, Math.min(32, fontSize + delta));
    setFontSize(newSize);
    localStorage.setItem(FONT_SIZE_KEY, newSize.toString());
  };

  const sendText = (text) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(text);
      setTimeout(() => { try { xtermRef.current?.focus(); } catch {} }, 50);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
    }
  };

  const startRecording = async () => {
    // If already recording, stop and send
    if (recording) {
      stopRecording();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Try common formats in order of browser compatibility
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/ogg';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/mp4';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/wav';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = '';
      }

      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      audioChunksRef.current = [];
      mimeTypeRef.current = mimeType || 'audio/webm';

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeTypeRef.current });
        stream.getTracks().forEach(track => track.stop());
        setRecording(false);
        await transcribeAudio(audioBlob);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setRecording(true);
    } catch (err) {
      console.error('[Terminal] Error starting recording:', err);
      if (xtermRef.current) {
        xtermRef.current.writeln('\x1b[31mError: No se pudo acceder al microfono\x1b[0m');
      }
    }
  };

  const transcribeAudio = async (audioBlob) => {
    if (!xtermRef.current) return;

    try {
      const reader = new FileReader();
      const audioBase64 = await new Promise((resolve, reject) => {
        reader.onload = () => {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_base64: audioBase64,
          mimetype: mimeTypeRef.current,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Transcription failed');
      }

      const result = await response.json();
      const transcription = result.text || '';

      if (transcription) {
        sendText(transcription + '\n');
        setTimeout(() => { try { xtermRef.current?.focus(); } catch {} }, 100);
      } else {
        xtermRef.current.writeln('\x1b[33m[Sin texto detectado]\x1b[0m');
      }
    } catch (err) {
      console.error('[Terminal] Transcription error:', err);
      xtermRef.current.writeln(`\x1b[31m[Error: ${err.message}]\x1b[0m`);
    }
  };

  if (!visible) return null;

  return (
    <div className="w-full h-full flex flex-col bg-slate-900 relative select-none" style={{ touchAction: 'none' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <TerminalIcon size={18} className="text-purple-400" />
          <h2 className="text-base font-semibold text-slate-200">Claude Terminal</h2>
          <span className={`px-2 py-0.5 rounded text-xs ${connected ? 'bg-green-600/30 text-green-400' : 'bg-red-600/30 text-red-400'}`}>
            {connected ? 'Conectado' : 'Desconectado'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={startRecording}
            className={`p-2 rounded ${recording ? 'bg-red-600 text-white animate-pulse' : 'hover:bg-slate-700 text-slate-400'}`}
            title={recording ? 'Detener y enviar' : 'Grabar audio'}
          >
            {recording ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded text-slate-400 ml-2">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Zoom controls - below header, upper right corner */}
      <div className="absolute top-14 right-3 z-50 flex items-center gap-1 bg-slate-800/90 backdrop-blur-sm rounded-lg px-2 py-1 border border-slate-700 pointer-events-auto">
        <button onClick={() => adjustFontSize(-2)} className="p-1 hover:bg-slate-700 rounded text-slate-400" title="Reducir">
          <ZoomOut size={14} />
        </button>
        <span className="text-xs text-slate-400 min-w-[2rem] text-center">{fontSize}px</span>
        <button onClick={() => adjustFontSize(2)} className="p-1 hover:bg-slate-700 rounded text-slate-400" title="Aumentar">
          <ZoomIn size={14} />
        </button>
      </div>

      {/* Terminal - FULL height */}
      <div className="flex-1 bg-slate-950 overflow-hidden relative" style={{ touchAction: 'none' }}>
        <div
          ref={terminalRef}
          className="h-full w-full"
          style={{ height: '100%', width: '100%' }}
        />
      </div>
    </div>
  );
}
