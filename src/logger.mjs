import { pino } from 'pino';

export function getLogger(name, level) {
  return pino({
    level,
    name,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true
      }
    },
  });
}