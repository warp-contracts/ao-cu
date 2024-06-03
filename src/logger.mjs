import {LoggerFactory} from "warp-contracts";

export function getLogger(name, level) {
  const logger = LoggerFactory.INST.create(name);
  LoggerFactory.INST.logLevel(level, name);
  return logger;
  /*return pino({
    level,
    name,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true
      }
    },
  });*/
}