import EventSource from 'eventsource';

const record_event = (event) => {
  try {
    const message = event.data;
    const counter = message.split('|')[0];
    console.log(`\n ==== new message ==== ${counter}`, message.length);
  } catch (e) {
    console.log(event);
  }

};

//const sse = new EventSource("http://localhost:8090/subscribe-test/");
const sse = new EventSource("https://cu.warp.cc/subscribe-test/");
sse.onmessage = record_event;

process.on('SIGINT', () => {
  console.log('closing sse');
  sse.close();
  process.exit();
});
