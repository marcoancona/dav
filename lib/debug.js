export default function debug(topic) {
  return function (message) {
    if (debug.enabled) {
      console.log(`[${topic}] ${message}`);
    }
    if (debug.callback) {
      debug.callback(topic, message);
    }
  };
}
