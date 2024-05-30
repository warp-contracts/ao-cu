import dotenv from "dotenv";
dotenv.config();
import * as HyperExpress from "hyper-express";
import {api_v1_router} from "./router.mjs";
import {createTables} from "./db.mjs";
import {getLogger} from "./logger.mjs";
import {THE_BEAVER} from "./beaver.mjs";

const logger = getLogger("server", "trace");

runServer().catch((e) => {
  logger.error(e);
});

async function runServer() {
  await createTables();
  logger.debug("Tables created");
  const webserver = new HyperExpress.Server();
  webserver.use('/', api_v1_router);
  const port = process.env.PORT || 6667;
  await webserver.listen(port);
  logger.info(THE_BEAVER);
  logger.info(`Listening on ${port} port`);
}


