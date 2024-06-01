import dotenv from "dotenv";
import * as HyperExpress from "hyper-express";
import {api_v1_router} from "./router.mjs";
import {closePool, createTables} from "./db.mjs";
import {getLogger} from "./logger.mjs";
import {THE_BEAVER} from "./beaver.mjs";
import exitHook from 'async-exit-hook';

dotenv.config();
// const exitHook = pkg;

const logger = getLogger("server", "trace");

runServer().catch((e) => {
  logger.error(e);
});

const useCORS = () => {
  return async (request, response) => {
    response.header('vary', 'Origin')
    response.header('Access-Control-Allow-Headers', 'content-type')
    response.header('Access-Control-Allow-Methods', 'OPTIONS, POST, GET')
    response.header('Access-Control-Allow-Origin', '*')
    response.header('Access-Control-Allow-Credentials', true)
  }
}

async function runServer() {
  await createTables();
  logger.debug("Tables created");
  const webserver = new HyperExpress.Server();
  webserver.use(useCORS());
  webserver.options('/*', useCORS());

  webserver.use('/', api_v1_router);
  const port = parseInt(process.env.PORT) || 8090;
  await webserver.listen(port);
  logger.info(THE_BEAVER);
  logger.info(`Listening on ${port} port`);
}

async function cleanup(callback) {
  logger.warn('Interrupted');
  await closePool();
  logger.info('Clean up finished');
  callback();
}

exitHook(cleanup);
