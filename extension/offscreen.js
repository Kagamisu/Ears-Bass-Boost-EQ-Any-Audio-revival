"use strict";
const engine = new EarsAudioEngine((tabId) => {
  chrome.runtime
    .sendMessage({ target: "worker", type: "streamEnded", tabId })
    .catch(() => {});
});
let commands = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (
    message?.target !== "audio" ||
    sender.id !== chrome.runtime.id ||
    (sender.url && sender.url !== chrome.runtime.getURL("service-worker.js"))
  )
    return;
  commands = commands
    .catch(() => {})
    .then(async () => {
      switch (message.type) {
        case "recover":
          if (engine.sessions.size) {
            await engine.prepare(message.settings);
            engine.configure(message.settings);
          }
          return engine.status();
        case "start":
          return engine.start(message.tab, message.streamId, message.settings);
        case "stop":
          return engine.stop(message.tabId);
        case "configure":
          engine.configure(message.settings);
          return engine.status();
        case "status":
          return engine.status();
        case "fft":
          return engine.fft();
        default:
          throw new Error("Unknown audio command");
      }
    });
  commands.then(
    (result) => respond({ ok: true, result }),
    (error) => respond({ ok: false, error: error.message }),
  );
  return true;
});
