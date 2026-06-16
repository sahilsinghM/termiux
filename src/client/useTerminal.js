import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

const MIN_DELAY = 1000;
const MAX_DELAY = 30000;

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

export function useTerminal({ containerRef, onStatus }) {
  const termRef = useRef(null);
  const wsRef = useRef(null);
  const fitRef = useRef(null);
  const delayRef = useRef(MIN_DELAY);
  const reconnectTimer = useRef(null);
  const attemptRef = useRef(0);
  const aliveRef = useRef(true); // false when component unmounts

  useEffect(() => {
    const term = new Terminal({
      theme: { background: '#0d1117', foreground: '#e6edf3', cursor: '#58a6ff' },
      fontFamily: 'monospace',
      fontSize: 14,
      scrollback: 1000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    function sendResize() {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    }

    function handleViewportResize() {
      if (!containerRef.current) return;
      const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      document.getElementById('root').style.height = `${vh}px`;
      fit.fit();
      sendResize();
    }

    term.onResize(() => sendResize());

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportResize);
    }
    window.addEventListener('resize', handleViewportResize);

    function connect() {
      if (!aliveRef.current) return;
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        delayRef.current = MIN_DELAY;
        attemptRef.current = 0;
        fit.fit();
        sendResize();
        // Re-attach input now that we're connected
        const disposable = term.onData((data) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(data);
        });
        ws._inputDisposable = disposable;
        onStatus({ connected: true, attempt: 0 });
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'pty-exit') {
            onStatus({ connected: false, ended: true });
            return;
          }
          if (msg.type === 'error') {
            term.writeln(`\r\n\x1b[31mServer error: ${msg.message}\x1b[0m`);
            return;
          }
        } catch (_) {}
        term.write(typeof evt.data === 'string' ? evt.data : new Uint8Array(evt.data));
      };

      ws.onclose = () => {
        // Detach input while disconnected
        if (ws._inputDisposable) {
          ws._inputDisposable.dispose();
          ws._inputDisposable = null;
        }
        if (!aliveRef.current) return;
        attemptRef.current += 1;
        onStatus({ connected: false, attempt: attemptRef.current });
        reconnectTimer.current = setTimeout(() => {
          delayRef.current = Math.min(delayRef.current * 2, MAX_DELAY);
          connect();
        }, delayRef.current);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      aliveRef.current = false;
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', handleViewportResize);
      window.removeEventListener('resize', handleViewportResize);
      term.dispose();
    };
  }, []);

  function sendKey(bytes) {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(bytes);
    }
  }

  return { sendKey, term: termRef };
}
