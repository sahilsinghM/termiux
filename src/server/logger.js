const DEBUG = process.env.LOG_LEVEL === 'debug';

function log(msg) {
  console.log(`[termiux] ${msg}`);
}

function debug(msg) {
  if (DEBUG) console.log(`[termiux:debug] ${msg}`);
}

function err(msg) {
  console.error(`[termiux] ${msg}`);
}

module.exports = { log, debug, err };
