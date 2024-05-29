import crypto from 'node:crypto';

const sse_streams = {};

/*function broadcast_message(message) {
  // Send the message to each connection in our connections object
  Object.keys(sse_streams).forEach((id) => {
    sse_streams[id].send(message);
  })
}

webserver.get('/news/events', (request, response) => {
  // You may perform some authentication here as this is just a normal HTTP GET request

  // Check to ensure that SSE if available for this request
  if (response.sse) {
    // Looks like we're all good, let's open the stream
    response.sse.open();
    // OR you may also send a message which will open the stream automatically
    response.sse.send('Some initial message');

    // Assign a unique identifier to this stream and store it in our broadcast pool
    response.sse.id = crypto.randomUUID();
    sse_streams[response.sse.id] = response.sse;

    // Bind a 'close' event handler to cleanup this connection once it disconnects
    response.once('close', () => {
      // Delete the stream from our broadcast pool
      delete sse_streams[response.sse.id]
    });
  } else {
    // End the response with some kind of error message as this request did not support SSE
    response.send('Server-Sent Events Not Supported!');
  }
});*/