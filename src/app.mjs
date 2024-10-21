import dotenv from "dotenv";
import * as HyperExpress from "hyper-express";
import {api_v1_router} from "./router.mjs";
import {closePool, createTables} from "./db.mjs";
import {getLogger} from "./logger.mjs";
import exitHook from 'async-exit-hook';

dotenv.config();

const logger = getLogger("server", "trace");

runServer().catch((e) => {
  logger.error(e);
});

async function runServer() {
  await createTables();
  logger.debug("Tables created");
  const webserver = new HyperExpress.Server();
  webserver.use('/', api_v1_router);
  const port = parseInt(process.env.PORT) || 8090;
  await webserver.listen(port);
  logger.info(`Listening on ${port} port`);
}

async function cleanup(callback) {
  logger.warn('Interrupted');
  await closePool();
  logger.info('Clean up finished');
  callback();
}

exitHook(cleanup);
