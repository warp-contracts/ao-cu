import { Benchmark } from 'warp-contracts';
import {prevResultCache} from "./result.mjs";
import {getLessOrEq} from "../db.mjs";
import {getLogger} from "../logger.mjs";

const logger = getLogger('currentState', 'trace');

export async function currentStateRoute(request, response) {
  const benchmark = Benchmark.measure();

  const processId = request.path_parameters['process-identifier'];
  let cachedResult = prevResultCache.get(processId);
  if (!cachedResult) {
    logger.debug(`Loading state from L2 cache for process ${processId}`);
    cachedResult = await getLessOrEq({ processId, nonce: Number.MAX_SAFE_INTEGER });
  }

  logger.debug(`State for ${processId} loaded in ${benchmark.elapsed()}`);

  response.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST, GET, PUT, DELETE')
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Credentials', 'true');

  return response.json(cachedResult);
}

