import crypto from 'node:crypto';
import {getLogger} from "../logger.mjs";

// Map(processId->Map(uuid->sse))
const sseStreams = new Map();
const logger = getLogger("sseRoute", "trace");

export function broadcast_message(processId, message) {
  if (!sseStreams.has(processId)) {
    logger.warn(`No subscribers for ${processId} process`);
    return;
  }
  const processStreams = sseStreams.get(processId);
  for (let stream of processStreams.values()) {
    stream.send(message);
  }
}


setInterval(() => {
  for (const [key, value] of sseStreams) {
    logger.debug(`Process ${key} subscribers: ${value.size}`);
  }
}, 10000);

export function subscribeRoute(request, response) {
  const processId = request.path_parameters["process-identifier"];
  logger.info(`Subscribing for ${processId}`);
  if (!sseStreams.has(processId)) {
    sseStreams.set(processId, new Map());
  }
  const processStreams = sseStreams.get(processId);

  response.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST, GET, PUT, DELETE')
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Cache-Control', 'no-cache');
  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Connection',  'keep-alive');
  response.setHeader('X-Accel-Buffering',  'no');


  // Check to ensure that SSE if available for this request
  if (response.sse) {
    // Looks like we're all good, let's open the stream
    response.sse.open();
    // OR you may also send a message which will open the stream automatically
    response.sse.send(`Subscribed for ${processId}`);

    // Assign a unique identifier to this stream and store it in our broadcast pool
    response.sse.id = crypto.randomUUID();
    processStreams.set(response.sse.id, response.sse);
    logger.info(`${response.sse.id} subscribed for ${processId}`);

    // Bind a 'close' event handler to cleanup this connection once it disconnects
    response.once('close', () => {
      logger.debug(`Closing for ${processId}:${response.sse.id}`);
      if (sseStreams.has(processId)) {
        sseStreams.get(processId).delete(response.sse.id);
      }
    });
  } else {
    // End the response with some kind of error message as this request did not support SSE
    response.send('Server-Sent Events Not Supported!');
  }
}