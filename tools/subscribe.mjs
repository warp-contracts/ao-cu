import EventSource from 'eventsource';

const record_event = (event) => {
  try {
    const message = JSON.parse(event.data);
    console.log('\n ==== new message ==== ', message.nonce);
    if (message.tags) {
      const salt = message.tags.find(t => t.name === 'Salt');
      console.log('\n ==== created      ==== ', new Date(parseInt(salt.value)));
    }
    console.log('\n ==== sent from CU ==== ', message.sent);
    console.log('\n ==== received     ==== ', new Date());
  } catch (e) {
    console.log(event);
  }

};

// const sse = new EventSource("http://localhost:8090/subscribe/Cp_c6eha1-1ZTA4EC0jOKOSg_NYJqbQIqUkBDy5rNag");
const sse = new EventSource("https://cu.warp.cc/subscribe/dP01RXeCnps1ucqu4THK5pKVCoSCKgdxQfrRbARLbrc");
sse.onmessage = record_event;

process.on('SIGINT', () => {
  console.log('closing sse');
  sse.close();
  process.exit();
});
