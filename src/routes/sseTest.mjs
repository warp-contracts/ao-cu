import crypto from 'node:crypto';
import {getLogger} from "../logger.mjs";

// Map(processId->Map(uuid->sse))
const sseStreams = new Map();
const logger = getLogger("sseTestRoute", "trace");

let counter = 0;

export function broadcast_message() {
  counter++;
  for (let stream of sseStreams.values()) {
    logger.debug(`Sending message`);
    stream.send(counter + '|' + 'x'.repeat(42000));
  }
}

setInterval(broadcast_message, 2000);


export function subscribeTestRoute(request, response) {
  logger.info(`Subscribing in test`);

  response.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST, GET, PUT, DELETE')
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Cache-Control', 'no-cache');
  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Connection',  'keep-alive');
  response.setHeader('X-Accel-Buffering', 'no');


  // Check to ensure that SSE if available for this request
  if (response.sse) {
    // Looks like we're all good, let's open the stream
    response.sse.open();
    // OR you may also send a message which will open the stream automatically
    response.sse.send(`Subscribed for test`);

    // Assign a unique identifier to this stream and store it in our broadcast pool
    response.sse.id = crypto.randomUUID();
    sseStreams.set(response.sse.id, response.sse);
    logger.info(`${response.sse.id} subscribed for test`);

    // Bind a 'close' event handler to cleanup this connection once it disconnects
    response.once('close', () => {
      logger.debug(`Closing test stream`);
      sseStreams.delete(response.sse.id);
    });
  } else {
    // End the response with some kind of error message as this request did not support SSE
    response.send('Server-Sent Events Not Supported!');
  }
}