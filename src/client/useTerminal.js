import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

const MIN_DELAY = 1000;
const MAX_DELAY = 30000;

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

export function useTerminal({ containerRef, onStatus, onInput }) {
  const termRef = useRef(null);
  const wsRef = useRef(null);
  const fitRef = useRef(null);
  const delayRef = useRef(MIN_DELAY);
  const reconnectTimer = useRef(null);
  const attemptRef = useRef(0);
  const aliveRef = useRef(true); // false when component unmounts
  const onInputRef = useRef(onInput);
  onInputRef.current = onInput; // always current, even inside stale closures

  useEffect(() => {
    const term = new Terminal({
      theme: { background: '#0d1117', foreground: '#e6edf3', cursor: '#58a6ff' },
      fontFamily: 'monospace',
      fontSize: 14,
      scrollback: 1000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    const el = containerRef.current;
    term.open(el);
    fit.fit();

    // Let the mobile keyboard offer swipe/gesture typing.
    // xterm sets autocorrect="off" by default — override it once after open.
    if (term.textarea) term.textarea.setAttribute('autocorrect', 'on');
    termRef.current = term;
    fitRef.current = fit;

    // Touch scrolling — capture phase so xterm's own stopPropagation doesn't block us.
    // Use term.scrollLines() (public API) instead of scrollTop; xterm v5 renders to canvas.
    let lastTouchY = null;
    let scrollAccum = 0;
    function onTouchStart(e) {
      if (!el.contains(e.target)) return;
      lastTouchY = e.touches[0].clientY;
      scrollAccum = 0;
    }
    function onTouchMove(e) {
      if (lastTouchY === null || !el.contains(e.target)) return;
      e.preventDefault(); // block pull-to-refresh / browser overscroll
      const dy = e.touches[0].clientY - lastTouchY;
      lastTouchY = e.touches[0].clientY;
      scrollAccum += dy;
      const lineH = term.options.fontSize || 14;
      const lines = Math.trunc(scrollAccum / lineH);
      if (lines !== 0) {
        term.scrollLines(-lines);
        scrollAccum -= lines * lineH;
      }
    }
    function onTouchEnd() { lastTouchY = null; scrollAccum = 0; }
    window.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    // ponytail: non-passive so preventDefault() can block pull-to-refresh on downward swipe
    window.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });

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
        let lineBuffer = '';
        const disposable = term.onData((data) => {
          // Track current line buffer for slash command palette
          if (data === '\r' || data === '\x03' || data === '\x04' || data === '\x1b') {
            lineBuffer = '';
          } else if (data === '\x7f') {
            lineBuffer = lineBuffer.slice(0, -1);
          } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
            lineBuffer += data;
          }
          if (onInputRef.current) onInputRef.current(lineBuffer);
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
      window.removeEventListener('touchstart', onTouchStart, { capture: true });
      window.removeEventListener('touchmove', onTouchMove, { capture: true });
      window.removeEventListener('touchend', onTouchEnd, { capture: true });
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
