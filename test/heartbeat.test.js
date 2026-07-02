import { describe, it, expect, vi, afterEach } from 'vitest';
import { startHeartbeat } from '../src/server/heartbeat.js';

// Behavior spec: keep the tunnel alive by pinging the socket on an interval
// below Cloudflare's ~100s idle timeout, and stop cleanly.

afterEach(() => vi.useRealTimers());

describe('startHeartbeat', () => {
  it('pings an open socket once per interval', () => {
    vi.useFakeTimers();
    const ws = { readyState: 1, OPEN: 1, ping: vi.fn() };
    startHeartbeat(ws, 1000);
    vi.advanceTimersByTime(3000);
    expect(ws.ping).toHaveBeenCalledTimes(3);
  });

  it('stops pinging after the returned stop() is called', () => {
    vi.useFakeTimers();
    const ws = { readyState: 1, OPEN: 1, ping: vi.fn() };
    const stop = startHeartbeat(ws, 1000);
    vi.advanceTimersByTime(2000);
    stop();
    vi.advanceTimersByTime(5000);
    expect(ws.ping).toHaveBeenCalledTimes(2);
  });

  it('does not ping a socket that is no longer open', () => {
    vi.useFakeTimers();
    const ws = { readyState: 3, OPEN: 1, ping: vi.fn() };
    startHeartbeat(ws, 1000);
    vi.advanceTimersByTime(3000);
    expect(ws.ping).not.toHaveBeenCalled();
  });
});
