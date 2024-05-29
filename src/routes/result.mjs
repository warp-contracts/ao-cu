import {getLogger} from "../logger.mjs";
import {QuickJsPlugin} from 'warp-contracts-plugin-quickjs';
import {tagValue} from "../tools.mjs";
import {publish as appSyncPublish, initPubSub as initAppSyncPublish} from 'warp-contracts-pubsub'
import {getForMsgId, getLessOrEq, insertResult} from "../db.mjs";
import {Benchmark} from "warp-contracts";
import {Mutex} from "async-mutex";

initAppSyncPublish()

const suUrl = "https://su-router.ao-testnet.xyz";

const handlersCache = new Map();
const prevResultCache = new Map();
const logger = getLogger("resultRoute", "trace");
const mutexes = new Map();

export async function resultRoute(request, response) {
  const benchmark = Benchmark.measure();

  const messageId = request.path_parameters["message-identifier"];
  const processId = request.query_parameters["process-id"];
  if (!mutexes.has(processId)) {
    mutexes.set(processId, new Mutex());
  }
  const mutex = mutexes.get(processId);
  if (mutex.isLocked()) {
    logger.debug(`Mutex for ${processId} locked`);
    await mutex.waitForUnlock();
  }
  logger.debug('Mutex for ${processId} unlocked, acquiring');
  const releaseMutex = await mutex.acquire();
  try {
    const result = await doReadResult(processId, messageId);
    logger.info(`Result for ${processId}::${messageId} calculated in ${benchmark.elapsed()}`);
    return response.json(result);
  } finally {
    releaseMutex();
  }
}

async function doReadResult(processId, messageId) {
  const messageBenchmark = Benchmark.measure();
  const message = await fetchMessageData(messageId, processId);
  logger.info(`Fetching message info ${messageBenchmark.elapsed()}`);
  // note: this effectively skips the initial process message -
  // which in AO is considered as 'constructor' - we do not need it now
  if (message === null) {
    logger.info('Initial process message - skipping');
    return {
      Error: 'Skipping initial process message',
      Messages: [],
      Spawns: [],
      Output: null
    };
  }
  const nonce = message.Nonce;
  logger.info({messageId, processId, nonce});

  // first try to load from the in-memory cache
  let cachedResult = await prevResultCache.get(processId);
  // and fallback to L2 if not found...
  if (!cachedResult) {
    cachedResult = await getLessOrEq({processId, messageId, nonce});
  }

  if (cachedResult) {
    // (1) exact match = someone requested for the same state twice?
    if (cachedResult.nonce === message.Nonce) {
      logger.debug(`Exact match for nonce ${message.Nonce}`);
      return cachedResult.result
    }

    // (2) most probable case - we need to evaluate the result for the new message,
    // and we have a result cached for the exact previous message
    if (cachedResult.nonce === message.Nonce - 1) {
      const result = await doEvalState(messageId, processId, message, cachedResult.result);
      prevResultCache.set(processId, {
        messageId,
        nonce,
        result
      });
    }

    // (3) for some reason evaluation for some messages was skipped, and
    // we need to first load all the missing messages (cachedResult.nonce, message.Nonce> from the SU.
    if (cachedResult.nonce < message.Nonce - 1) {
      // TODO: load missing messages from SU and eval shit
      throw new Error('Loading missing messages from SU not yet implemented');
    }

    if (cachedResult.nonce > message.Nonce) {
      logger.warn(`${messageId} for ${processId} already evaluated, returning from L2 cache`);
      const result = await getForMsgId({processId, messageId});
      if (!result) {
        throw new Error(`Result for $${processId}:${messageId}:${nonce} not found in L2 cache`);
      }
      return result;
    }
  } else {
    // TODO: eval shit from scratch
    throw new Error('Evaluation from scratch not yet implemented');
  }
}

async function doEvalState(messageId, processId, message, prevState) {
  if (!handlersCache.has(processId)) {
    await cacheProcessHandler(processId);
  }

  const calculationBenchmark = Benchmark.measure();
  const result = await handlersCache.get(message.Target).handle(message, prevState);
  logger.info(`Calculating ${calculationBenchmark.elapsed()}`);
  logger.debug(result.Output);

  // this one needs to by synced, in order to retain order from the clients' perspective
  await publishToAppSync(message, result, processId, messageId);

  // do not await in order not to slow down the processing
  storeResultInDb(processId, messageId, message, result);

  return {
    Error: result.Error,
    Messages: result.Messages,
    Spawns: result.Spawns,
    Output: result.Output,
    State: result.State
  };
}

async function cacheProcessHandler(processId) {
  logger.info('Process handler not cached', processId);
  const processDefinition = await fetchProcessDef(processId);
  const quickJsPlugin = new QuickJsPlugin({});
  const quickJsHandlerApi = await quickJsPlugin.process({
    contractSource: processDefinition.moduleSource,
    binaryType: 'release_sync'
  })
  handlersCache.set(processId, quickJsHandlerApi);
  stateCache.set(processId, processDefinition.initialState);
}

function publishToAppSync(message, result, processId, messageId) {
  return appSyncPublish(
      `results/ao/${message.Target}`,
      JSON.stringify({
        nonce: message.Nonce,
        output: result.Output,
        state: result.State,
        tags: message.Tags,
        sent: new Date()
      }),
      process.env.APPSYNC_KEY
  ).then(() => {
    logger.debug(`Result for ${processId}:${messageId}:${message.Nonce} published`);
  });
}

function storeResultInDb(processId, messageId, message, result) {
  insertResult({processId, messageId, nonce: message.Nonce, result})
      .then(() => {
        logger.debug(`Result for ${processId}:${messageId}:${message.Nonce} stored in db`);
      });
}

async function fetchProcessDef(processId) {
  const response = await fetch(`${suUrl}/processes/${processId}`);
  if (response.ok) {
    return parseProcessData(await response.json());
  } else {
    throw new Error(`${response.statusCode}: ${response.statusMessage}`);
  }
}

async function parseProcessData(message) {
  // TODO: check whether module and process were deployed from our "jnio" wallet
  const moduleTxId = tagValue(message.tags, 'Module');
  return {
    block: message.block,
    owner: message.owner,
    timestamp: message.timestamp,
    initialState: JSON.parse(message.data),
    moduleTxId: tagValue(message.tags, 'Module'),
    moduleSource: await fetchModuleSource(moduleTxId)
  }
}

async function fetchModuleSource(moduleTxId) {
  const response = await fetch(`https://arweave.net/${moduleTxId}`);
  if (response.ok) {
    return await response.text();
  } else {
    throw new Error(`${response.statusCode}: ${response.statusMessage}`);
  }
}

async function fetchMessageData(messageId, processId) {
  const response = await fetch(`${suUrl}/${messageId}?process-id=${processId}`);
  if (response.ok) {
    return parseMessagesData(await response.json(), processId);
  } else {
    throw new Error(`${response.statusCode}: ${response.statusMessage}`);
  }
}

async function parseMessagesData(input, processId) {
  const {message, assignment} = input;
  const type = tagValue(message.tags, 'Type');
  if (type === 'Process') {
    return null;
  }
  return {
    "Id": message.id,
    "Signature": message.signature,
    "Data": message.data,
    "Owner": message.owner.address,
    "Target": processId,
    "Anchor": null,
    "From": processId,
    "Forwarded-By": message.owner.address,
    "Tags": message.tags.concat(assignment.tags),
    "Epoch": parseInt(tagValue(assignment.tags, 'Epoch')),
    "Nonce": parseInt(tagValue(assignment.tags, 'Nonce')),
    "Timestamp": parseInt(tagValue(assignment.tags, 'Timestamp')),
    "Block-Height": parseInt(tagValue(assignment.tags, 'Block-Height')),
    "Hash-Chain": parseInt(tagValue(assignment.tags, 'Hash-Chain')),
    "Cron": false,
    "Read-Only": false
  }
}

function getPrevKeyForNonce(processId, nonce) {
  return `${processId}_${("" + nonce).padStart(16, '0')}`;
}