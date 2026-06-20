import { info as pluginInfo, warn as pluginWarn, error as pluginError } from "@tauri-apps/plugin-log";

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SID = Date.now().toString(16);

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const COLORS: Record<LogLevel, string> = {
  debug: 'color:#888;font-weight:lighter',
  info: 'color:#0ea5e9;font-weight:600',
  warn: 'color:#f59e0b;font-weight:600',
  error: 'color:#ef4444;font-weight:600',
};

const currentLevel: LogLevel =
  (typeof import.meta !== 'undefined' && import.meta.env?.DEV)
    ? 'debug'
    : 'info';

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[currentLevel];
}

function callerLoc(): string {
  const stack = new Error().stack;
  if (!stack) return '';
  const lines = stack.split('\n');
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i].trim();
    const m = line.match(/src[\\/][^:]+:\d+/);
    if (m) return m[0].replace(/\\/g, '/');
  }
  return '';
}

function log(level: LogLevel, module: string, ...args: unknown[]) {
  if (!shouldLog(level)) return;
  const time = new Date().toISOString().slice(11, 23);
  const loc = callerLoc();
  const prefix = `%c${time} [${SID}] ${loc} [${module}]`;
  const style = COLORS[level];
  switch (level) {
    case 'error':
      console.error(prefix, style, ...args);
      break;
    case 'warn':
      console.warn(prefix, style, ...args);
      break;
    case 'debug':
      console.debug(prefix, style, ...args);
      break;
    default:
      console.log(prefix, style, ...args);
  }
}

export const logger = {
  debug: (module: string, ...args: unknown[]) => log('debug', module, ...args),
  info: (module: string, ...args: unknown[]) => log('info', module, ...args),
  warn: (module: string, ...args: unknown[]) => log('warn', module, ...args),
  error: (module: string, ...args: unknown[]) => log('error', module, ...args),
};

function safePluginCall<T>(fn: () => Promise<T>): void {
  fn().catch(() => { /* Tauri 未就绪时静默忽略 */ });
}

export const backendLog = {
  info: (msg: string) => safePluginCall(() => pluginInfo(`[${SID}] ${msg}`)),
  warn: (msg: string) => safePluginCall(() => pluginWarn(`[${SID}] ${msg}`)),
  error: (msg: string) => safePluginCall(() => pluginError(`[${SID}] ${msg}`)),
};
