export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  component: string;
  correlationId?: string;
  org?: string;
  repo?: string;
  message: string;
  data?: Record<string, unknown>;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

export function createLogger(component: string) {
  const service = 'security-jira-app';

  function log(
    level: LogLevel,
    message: string,
    context?: {
      correlationId?: string;
      org?: string;
      repo?: string;
      data?: Record<string, unknown>;
    },
  ): void {
    if (!shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service,
      component,
      message,
      ...context,
    };

    const output = JSON.stringify(entry);
    if (level === 'error') {
      console.error(output);
    } else {
      console.log(output);
    }
  }

  return {
    debug: (msg: string, ctx?: Parameters<typeof log>[2]) => log('debug', msg, ctx),
    info: (msg: string, ctx?: Parameters<typeof log>[2]) => log('info', msg, ctx),
    warn: (msg: string, ctx?: Parameters<typeof log>[2]) => log('warn', msg, ctx),
    error: (msg: string, ctx?: Parameters<typeof log>[2]) => log('error', msg, ctx),
  };
}

export type Logger = ReturnType<typeof createLogger>;
