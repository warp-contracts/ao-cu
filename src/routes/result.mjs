import {getLogger} from "../logger.mjs";
import {QuickJsPlugin} from 'warp-contracts-plugin-quickjs';
import {tagValue} from "../tools.mjs";
import {getForMsgId, getLessOrEq, insertResult} from "../db.mjs";
import {Benchmark} from "warp-contracts";
import {Mutex} from "async-mutex";
import {broadcast_message} from "./sse.mjs";
import {backOff} from "exponential-backoff";


const logger = getLogger("resultRoute", "trace");
const suUrl = "http://127.0.0.1:9000";

const handlersCache = new Map();
const prevResultCache = new Map();
const mutexes = new Map();
const maxNonce = new Map();

const messages = {};

const backOffOptions = {
  delayFirstAttempt: false,
  jitter: "none",
  maxDelay: 1000,
  numOfAttempts: 5,
  timeMultiple: 2,
  startingDelay: 100
};

export async function resultRoute(request, response) {
  const benchmark = Benchmark.measure();

  const msgWithAssignment = await request.json();

  const messageId = request.path_parameters["message-identifier"];
  const processId = request.query_parameters["process-id"];

  messages[messageId] = performance.now();

  const message = parseMessagesData(msgWithAssignment, processId);

  const mutexBenchmark = Benchmark.measure();
  if (!mutexes.has(processId)) {
    logger.debug(`Storing mutex for ${processId}`);
    mutexes.set(processId, new Mutex());
  }
  const mutex = mutexes.get(processId);
  const release = await mutex.acquire();

  try {
    logger.debug(`Acquired mutex in ${mutexBenchmark.elapsed()}`);
    const currentMaxNonce = maxNonce.get(processId);
    if (currentMaxNonce >= message.Nonce) {
      throw new Error(`Already evaluating state with higher nonce (${currentMaxNonce}, ${message.Nonce})`);
    }
    maxNonce.set(processId, message.Nonce);
    const result = await doReadResult(processId, messageId, message);
    logger.info(`Result for ${messageId} calculated in ${benchmark.elapsed()}`);
    return response.json(result);
  } finally {
    release();
    // logger.debug(`Releasing mutex for ${processId}`);
    delete messages[messageId];
  }
}

async function doReadResult(processId, messageId, message) {
  const messageBenchmark = Benchmark.measure();
  message.CuReceived = messages[messageId];
  message.benchmarks = {
    fetchMessage: messageBenchmark.elapsed()
  }
  // note: this effectively skips the initial process message -
  // which in AO is considered as a 'constructor' - we do not need it now
  if (message === null) {
    logger.info('Initial process message - skipping');
    return {
      Error: '',
      Messages: [],
      Spawns: [],
      Assignments: [],
      Output: null,
      State: {}
    };
  }
  const nonce = message.Nonce;
  if (!handlersCache.has(processId)) {
    await cacheProcessHandler(processId);
  }

  const cacheLookupBenchmark = Benchmark.measure();
  // first try to load from the in-memory cache...
  let cachedResult = prevResultCache.get(processId);
  // ...fallback to L2 (DB) cache
  if (!cachedResult) {
    cachedResult = await getLessOrEq({processId, nonce});
  }
  message.benchmarks.cacheLookup = cacheLookupBenchmark.elapsed();

  if (nonce === 0 && !cachedResult) {
    logger.debug('First message for the process');
    const initialState = handlersCache.get(processId).def.initialState;
    const result = await doEvalState(messageId, processId, message, initialState, true);
    prevResultCache.set(processId, {
      messageId,
      nonce,
      timestamp: message.Timestamp,
      result
    });
    return result;
  }

  if (cachedResult) {
    // (1) exact match = someone requested the same state twice?
    if (cachedResult.nonce === nonce) {
      logger.trace(`cachedResult.nonce === message.Nonce`);
      logger.debug(`Exact match for nonce ${message.Nonce}`);
      await publish(message, cachedResult.result, processId, messageId);
      return cachedResult.result
    }

    // (2) most probable case - we need to evaluate the result for the new message,
    // and we have a result cached for the exact previous message
    if (cachedResult.nonce === nonce - 1) {
      // logger.trace(`cachedResult.nonce === message.Nonce - 1`);
      const result = await doEvalState(messageId, processId, message, cachedResult.result.State, true);
      prevResultCache.set(processId, {
        messageId,
        nonce,
        timestamp: message.Timestamp,
        result
      });
      return result;
    }

    // (3) for some reason evaluation for some messages was skipped, and
    // we need to first load all the missing messages(cachedResult.nonce, message.Nonce> from the SU.
    if (cachedResult.nonce < nonce - 1) {
      logger.trace(`cachedResult.nonce (${cachedResult.nonce}) < message.Nonce - 1 (${message.Nonce - 1})`);
      const expectedMessagesLength = nonce - cachedResult.nonce;
      const loadedMessages = await loadMessages(processId, cachedResult.timestamp, message.Timestamp);
      if (loadedMessages?.length !== expectedMessagesLength) {
        throw new Error(`Not enough messages loaded ${loadedMessages?.length} / ${expectedMessagesLength}`);
      }
      /*const messages = await backOff(async () => {
        const loaded = await loadMessages(processId, cachedResult.timestamp, message.Timestamp);
        if (loaded?.length !== expectedMessagesLength) {
          throw new Error(`Not enough messages loaded ${loaded?.length} / ${expectedMessagesLength}`);
        }
        return loaded;
      }, backOffOptions);*/

      const {result, lastMessage} = await evalMessages(processId, loadedMessages, cachedResult.result.State);
      prevResultCache.set(processId, {
        messageId: lastMessage.Id,
        nonce: lastMessage.Nonce,
        timestamp: lastMessage.Timestamp,
        result
      });
      return result;
    }

    if (cachedResult.nonce > nonce) {
      logger.trace(`cachedResult.nonce > message.Nonce`);
      logger.warn(`${messageId} for ${processId} already evaluated, returning from L2 cache`);
      const result = await getForMsgId({processId, messageId});
      if (!result) {
        throw new Error(`Result for $${processId}:${messageId}:${nonce} not found in L2 cache`);
      }
      return result;
    }
  } else {
    const messages = await loadMessages(processId, 0, message.Timestamp);
    const initialState = handlersCache.get(processId).def.initialState;
    const {result, lastMessage} = await evalMessages(processId, messages, initialState);
    prevResultCache.set(processId, {
      messageId: lastMessage.Id,
      nonce: lastMessage.Nonce,
      timestamp: lastMessage.Timestamp,
      result
    });
    return result;
  }
}

async function evalMessages(processId, messages, prevState) {
  const messagesLength = messages.length;
  if (messagesLength === 0) {
    return {
      Error: '',
      Messages: [],
      Spawns: [],
      Assignments: [],
      Output: null,
      State: prevState
    };
  }
  let result;
  let lastMessage;
  for (let i = 0; i < messagesLength; i++) {
    lastMessage = parseMessagesData(messages[i].node, processId);
    result = await doEvalState(lastMessage.Id, processId, lastMessage, prevState, false);
    prevState = result.State;
  }

  await publish(lastMessage, result, processId, lastMessage.Id);
  // do not await in order not to slow down the processing
  storeResultInDb(processId, lastMessage.Id, lastMessage, result)
    .finally();

  return {
    lastMessage,
    result
  };
}

async function doEvalState(messageId, processId, message, prevState, store) {
  const calculationBenchmark = Benchmark.measure();
  const cachedProcess = handlersCache.get(processId);
  const result = await cachedProcess.api.handle(message, cachedProcess.env, prevState);
  logger.info(`Calculating [${processId}:${messageId}:${message.Nonce}]: ${calculationBenchmark.elapsed()}`);
  if (!message.benchmarks) {
    message.benchmarks = {};
  }
  message.benchmarks.calculation = calculationBenchmark.elapsed();

  if (store) {
    calculationBenchmark.reset();
    publish(message, result, processId, messageId);
    // logger.debug(`Published in ${calculationBenchmark.elapsed()}`);

    calculationBenchmark.reset();
    storeResultInDb(processId, messageId, message, result)
      .finally(() => {
        // logger.debug(`Stored in ${calculationBenchmark.elapsed()}`);
      });

  }

  return {
    Error: result.Error,
    Messages: result.Messages,
    Spawns: result.Spawns,
    Output: result.Output,
    State: result.State,
    Assignments: []
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
  handlersCache.set(processId, {
    api: quickJsHandlerApi,
    def: processDefinition,
    env: {
      Process: {
        Id: processId,
        Owner: processDefinition.owner.address,
        Tags: processDefinition.tags
      },
      Module: {
        Id: processDefinition.moduleTxId,
        Owner: null, // TODO: load from gql..
        Tags: null // TODO: load from gql...
      }
    }
  });
}

function publish(message, result, processId, messageId) {

  const messageToPublish = JSON.stringify({
    txId: messageId,
    nonce: message.Nonce,
    output: result.Output,
    // state: result.State,
    tags: message.Tags,
    cuReceived: messages[messageId],
    cuSent: performance.now(),
    benchmarks: message.benchmarks
  });

  broadcast_message(processId, messageToPublish);
}

async function storeResultInDb(processId, messageId, message, result) {
  try {
    await insertResult({processId, messageId, result, nonce: message.Nonce, timestamp: message.Timestamp});
    logger.debug(`Result for ${processId}:${messageId}:${message.Nonce} stored in db`);
  } catch (e) {
    logger.error(e);
  }
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
  if (message.owner.address !== "jnioZFibZSCcV8o-HkBXYPYEYNib4tqfexP0kCBXX_M") {
    logger.error(`Only processes from "jnioZFibZSCcV8o-HkBXYPYEYNib4tqfexP0kCBXX_M" address are allowed, used: ${message.owner.address}`);
    throw new Error(`Only processes from "jnioZFibZSCcV8o-HkBXYPYEYNib4tqfexP0kCBXX_M" address are allowed`);
  }
  const moduleTxId = tagValue(message.tags, 'Module');
  return {
    block: message.block,
    owner: message.owner,
    timestamp: message.timestamp,
    initialState: JSON.parse(message.data),
    tags: message.tags,
    moduleTxId: tagValue(message.tags, 'Module'),
    moduleSource: await fetchModuleSource(moduleTxId)
  }
}

async function fetchModuleSource(moduleTxId) {
  const response = await fetch(`https://arweave.net/${moduleTxId}`);
  console.log(`Fetching module ${moduleTxId}`);
  if (response.ok) {
    return await response.text();
  } else {
    throw new Error(`${response.statusCode}: ${response.statusMessage}`);
  }
}

function parseMessagesData(input, processId) {
  const {message, assignment} = input;

  const type = tagValue(message.tags, 'Type');
  if (type === 'Process') {
    logger.debug("Process deploy message");
    logger.debug("=== message ===");
    logger.debug(message);
    logger.debug("=== assignment ===");
    logger.debug(assignment);
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

// TODO: lame implementation "for now", stream messages, or at least whole pages.
async function loadMessages(processId, fromExclusive, toInclusive) {
  const benchmark = Benchmark.measure();
  const result = [];
  logger.info(`Loading messages from su ${processId}:${fromExclusive}:${toInclusive}`);
  let hasNextPage = true;
  while (hasNextPage) {
    const url = `${suUrl}/${processId}?from=${fromExclusive}&to=${toInclusive}`;
    const response = await fetch(url);
    if (response.ok) {
      const pageResult = await response.json();
      result.push(...pageResult.edges);
      hasNextPage = pageResult.page_info.has_next_page;
      if (hasNextPage) {
        fromExclusive = result[result.length - 1].cursor;
        logger.debug(`New from ${fromExclusive}`);
      }
    } else {
      throw new Error(`${response.statusCode}: ${response.statusMessage}`);
    }
  }
  logger.debug(`Messages loaded in: ${benchmark.elapsed()}`);
  logger.info(`Found ${result.length} messages for ${processId}`);

  return result;
}