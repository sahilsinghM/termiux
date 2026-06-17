import React, { useRef, useState } from 'react';
import { useTerminal } from './useTerminal.js';
import { KeyRow } from './KeyRow.jsx';
import '@xterm/xterm/css/xterm.css';

export function App() {
  const containerRef = useRef(null);
  const [status, setStatus] = useState({ connected: false, attempt: 0, ended: false });

  const { sendKey } = useTerminal({ containerRef, onStatus: setStatus });

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
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

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

      {/* Mobile key row */}
      <KeyRow onKey={sendKey} disabled={disconnected} />
    </div>
  );
}
