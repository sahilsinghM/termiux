// Keep a websocket alive across cloudflared's idle timeout (~100s) by pinging
// on an interval. Returns a stop() to clear it (call on ws close).
function startHeartbeat(ws, intervalMs = 30000) {
  const timer = setInterval(() => {
    if (ws.readyState !== ws.OPEN) return;
    try {
      ws.ping();
    } catch (_) {
      // socket went away between the check and the ping
    }
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return function stop() {
    clearInterval(timer);
  };
}

module.exports = { startHeartbeat };
