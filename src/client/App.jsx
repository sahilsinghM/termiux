import React, { useRef, useState } from 'react';
import { useTerminal } from './useTerminal.js';
import { KeyRow } from './KeyRow.jsx';
import '@xterm/xterm/css/xterm.css';

const COMMANDS = [
  'ls -la', 'ls', 'cd ..', 'cd ~', 'pwd',
  'git status', 'git pull', 'git log --oneline', 'git diff', 'git add .', 'git commit -m ""',
  'cat', 'nano', 'vim', 'less',
  'ps aux', 'top', 'htop', 'kill',
  'sudo', 'sudo -s',
  'npm install', 'npm run dev', 'npm start', 'npm test',
  'python3', 'pip install',
  'clear', 'history', 'which', 'echo', 'env',
];

export function App() {
  const containerRef = useRef(null);
  const [status, setStatus] = useState({ connected: false, attempt: 0, ended: false });
  const [inputBuffer, setInputBuffer] = useState('');

  const { sendKey } = useTerminal({ containerRef, onStatus: setStatus, onInput: setInputBuffer });

  const showPalette = inputBuffer.startsWith('/') && inputBuffer.length >= 2;
  const paletteQuery = showPalette ? inputBuffer.slice(1).toLowerCase() : '';
  const filteredCmds = showPalette
    ? COMMANDS.filter(c => c.toLowerCase().includes(paletteQuery))
    : [];

  function runCommand(cmd) {
    sendKey('\x7f'.repeat(inputBuffer.length) + cmd + '\r');
    setInputBuffer('');
  }

  const disconnected = !status.connected;
  const overlayVisible = disconnected && !status.ended;

  function logout() {
    fetch('/logout', { method: 'POST' }).then(() => {
      // /cdn-cgi/access/logout clears the CF Access JWT, then redirects to the CF login page
      location.href = '/cdn-cgi/access/logout';
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Terminal viewport */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Logout button — top-right corner */}
        <button
          onClick={logout}
          aria-label="Log out"
          style={{
            background: 'rgba(0,0,0,0.45)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '4px',
            color: 'rgba(255,255,255,0.55)',
            cursor: 'pointer',
            fontSize: '0.7rem',
            padding: '6px 12px',
            touchAction: 'manipulation',
            position: 'absolute',
            right: '8px',
            top: '8px',
            zIndex: 10,
          }}
        >
          logout
        </button>
        {/* cursor:pointer + onClick make iOS Safari dispatch touch events to non-interactive divs */}
        <div ref={containerRef} style={{ width: '100%', height: '100%', cursor: 'pointer', touchAction: 'none' }} onClick={() => {}} />

        {/* Reconnect overlay */}
        {overlayVisible && (
          <div style={{
            alignItems: 'center',
            background: 'rgba(0,0,0,0.75)',
            bottom: 0,
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            justifyContent: 'center',
            left: 0,
            position: 'absolute',
            right: 0,
            top: 0,
          }}>
            <div>Reconnecting... (attempt {status.attempt})</div>
          </div>
        )}

        {/* Session ended overlay */}
        {status.ended && (
          <div style={{
            alignItems: 'center',
            background: 'rgba(0,0,0,0.75)',
            bottom: 0,
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            justifyContent: 'center',
            left: 0,
            position: 'absolute',
            right: 0,
            top: 0,
          }}>
            <div>Session ended — tap to reconnect</div>
            <button
              onClick={() => location.reload()}
              style={{ background: '#238636', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', padding: '10px 20px' }}
            >
              Reconnect
            </button>
          </div>
        )}
      </div>

      {/* Slash command palette — appears when typing /xx */}
      {showPalette && filteredCmds.length > 0 && (
        <div style={{
          display: 'flex',
          gap: '4px',
          padding: '4px 6px',
          background: '#0d1117',
          borderTop: '1px solid #1f6feb',
          overflowX: 'auto',
          flexShrink: 0,
        }}>
          {filteredCmds.map(cmd => (
            <button
              key={cmd}
              onPointerDown={(e) => { e.preventDefault(); runCommand(cmd); }}
              style={{
                background: '#161b22',
                border: '1px solid #1f6feb',
                borderRadius: '4px',
                color: '#58a6ff',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '12px',
                minHeight: '36px',
                padding: '0 10px',
                whiteSpace: 'nowrap',
              }}
            >
              {cmd}
            </button>
          ))}
        </div>
      )}

      {/* Mobile key row */}
      <KeyRow onKey={sendKey} disabled={disconnected} />
    </div>
  );
}
