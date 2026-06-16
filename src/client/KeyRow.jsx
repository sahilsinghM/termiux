import React from 'react';

const KEYS = [
  { label: 'Ctrl+C', ariaLabel: 'Control C',  bytes: '\x03' },
  { label: 'Esc',    ariaLabel: 'Escape',      bytes: '\x1b' },
  { label: 'Tab',    ariaLabel: 'Tab',          bytes: '\x09' },
  { label: '↑',      ariaLabel: 'Up arrow',     bytes: '\x1b[A' },
  { label: '↓',      ariaLabel: 'Down arrow',   bytes: '\x1b[B' },
  { label: '←',      ariaLabel: 'Left arrow',   bytes: '\x1b[D' },
  { label: '→',      ariaLabel: 'Right arrow',  bytes: '\x1b[C' },
];

export function KeyRow({ onKey, disabled }) {
  return (
    <div style={{
      display: 'flex',
      gap: '4px',
      padding: '6px',
      background: '#1a1a1a',
      borderTop: '1px solid #30363d',
      overflowX: 'auto',
      flexShrink: 0,
    }}>
      {KEYS.map(({ label, ariaLabel, bytes }) => (
        <button
          key={label}
          aria-label={ariaLabel}
          disabled={disabled}
          onPointerDown={(e) => {
            e.preventDefault(); // prevent virtual keyboard from appearing
            onKey(bytes);
          }}
          style={{
            background: '#0d1117',
            border: '1px solid #444',
            borderRadius: '4px',
            color: disabled ? '#666' : '#e6edf3',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontFamily: 'monospace',
            fontSize: '13px',
            minHeight: '44px',
            minWidth: '44px',
            opacity: disabled ? 0.5 : 1,
            padding: '0 8px',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
