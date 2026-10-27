"use strict";
importScripts("settings.js");
let creating,
  commands = Promise.resolve();
const offscreenUrl = chrome.runtime.getURL("offscreen.html");
const popupUrl = chrome.runtime.getURL("popup.html");
async function hasAudioDocument() {
  return (
    (
      await chrome.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
        documentUrls: [offscreenUrl],
      })
    ).length > 0
  );
}
async function ensureAudioDocument() {
  if (!chrome.offscreen || !chrome.runtime.getContexts)
    throw new Error(
      "This browser lacks the required offscreen audio API (Chromium 116+).",
    );
  if (await hasAudioDocument()) return;
  if (!creating)
    creating = chrome.offscreen
      .createDocument({
        url: "offscreen.html",
        reasons: ["USER_MEDIA"],
        justification:
          "Process tab audio locally with Web Audio while the Ears popup is closed.",
      })
      .finally(() => {
        creating = null;
      });
  await creating;
}
async function audio(message) {
  const reply = await chrome.runtime.sendMessage({
    ...message,
    target: "audio",
  });
  if (!reply?.ok)
    throw new Error(reply?.error || "The audio document did not respond");
  return reply.result;
}
async function audioStatus() {
  if (!(await hasAudioDocument()))
    return { streams: [], sampleRate: 44100, contextState: "closed" };
  return audio({ type: "status" });
}
async function settings() {
  const stored = await chrome.storage.local.get("earsSettings");
  return EarsSettings.load(stored.earsSettings);
}
async function updateBadge(status) {
  const tabs = await chrome.tabs.query({});
  const captured = new Set(status.streams.map((s) => s.id));
  await Promise.all(
    tabs.map((t) =>
      chrome.action
        .setBadgeText({ tabId: t.id, text: captured.has(t.id) ? "EQ" : "" })
        .catch(() => {}),
    ),
  );
  await chrome.action.setBadgeBackgroundColor({ color: "#9573A8" });
}
async function releaseIfIdle(status) {
  if (!status.streams.length && (await hasAudioDocument()))
    await chrome.offscreen.closeDocument();
  await updateBadge(status);
}
async function events(tabId, config) {
  const status = await audioStatus();
  return [
    { type: "sendSampleRate", Fs: status.sampleRate },
    {
      type: "sendWorkspaceStatus",
      eqFilters: config.filters,
      gain: config.gain,
      streams: status.streams,
    },
    {
      type: "sendCurrentTabStatus",
      streaming: status.streams.some((t) => t.id === tabId),
    },
    { type: "sendPresets", presets: config.presets },
  ];
}
const settingCommands = new Set([
  "modifyFilter",
  "modifyGain",
  "resetFilters",
  "resetFilter",
  "preset",
  "savePreset",
  "deletePreset",
  "importPresets",
]);
async function dispatch(message) {
  const config = await settings();
  const tabId = message.tabId;
  if (message.type === "onPopupOpen" && await hasAudioDocument()) {
    await audio({type: "recover", settings: config});
  }
  if (message.type === "getFFT")
    return {
      result: (await hasAudioDocument())
        ? await audio({ type: "fft" })
        : { type: "fft", fft: [] },
    };
  if (message.type === "exportPresets") return { result: config.presets };
  if (message.type === "eqTab") {
    if (!Number.isInteger(tabId))
      throw new Error(
        "Select an audio tab and open Ears from the browser toolbar.",
      );
    if (message.on) {
      const current = await audioStatus();
      if (!current.streams.some((t) => t.id === tabId)) {
        // The action grants this tab access. Never auto-recapture at browser startup.
        const tab = await chrome.tabs.get(tabId);
        if (
          /^(chrome|browser|edge|about|chrome-extension):/.test(tab.url || "")
        )
          throw new Error("Open Ears on an ordinary web page playing audio.");
        await ensureAudioDocument();
        try {
          const streamId = await chrome.tabCapture.getMediaStreamId({
            targetTabId: tabId,
          });
          await audio({
            type: "start",
            streamId,
            tab: { id: tabId, title: tab.title },
            settings: config,
          });
        } catch (error) {
          await releaseIfIdle(await audioStatus());
          throw error;
        }
      }
      await updateBadge(await audioStatus());
    } else {
      if (await hasAudioDocument())
        await releaseIfIdle(await audio({ type: "stop", tabId }));
    }
  } else if (message.type === "disconnectTab") {
    if (!Number.isInteger(message.tab?.id)) throw new Error("Invalid tab");
    if (await hasAudioDocument())
      await releaseIfIdle(await audio({ type: "stop", tabId: message.tab.id }));
  } else if (settingCommands.has(message.type)) {
    const next = EarsSettings.apply(config, message);
    // Commit each change before acknowledging it; no worker timer can lose settings.
    await chrome.storage.local.set({ earsSettings: next });
    if (await hasAudioDocument())
      await audio({ type: "configure", settings: next });
    // Original UI draws while dragging; do not replace its SVG during a drag.
    if (
      message.type === "modifyFilter" ||
      message.type === "modifyGain" ||
      message.type === "resetFilter"
    )
      return {};
    return { events: await events(tabId, next) };
  } else if (
    ![
      "getFullRefresh",
      "getCurrentTabStatus",
      "getWorkspaceStatus",
      "onPopupOpen",
      "gainUpdated",
      "filterUpdated",
    ].includes(message.type)
  )
    throw new Error("Unknown Ears command");
  return { events: await events(tabId, config) };
}
function enqueue(task) {
  const result = commands.catch(() => {}).then(task);
  commands = result;
  return result;
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.target !== "worker" || sender.id !== chrome.runtime.id) return;
  if (message.type === "streamEnded" && sender.url === offscreenUrl) {
    enqueue(async () => {
      const status = await audioStatus();
      await releaseIfIdle(status);
    }).then(
      () => respond({ ok: true }),
      (e) => respond({ ok: false, error: e.message }),
    );
    return true;
  }
  if (!sender.url || sender.url.split("?")[0] !== popupUrl) return;
  enqueue(() => dispatch(message)).then(
    (result) => respond({ ok: true, ...result }),
    (error) => respond({ ok: false, error: error.message }),
  );
  return true;
});
chrome.tabs.onRemoved.addListener((tabId) => {
  enqueue(async () => {
    if (await hasAudioDocument())
      await releaseIfIdle(await audio({ type: "stop", tabId }));
  }).catch(console.error);
});
chrome.runtime.onStartup.addListener(() =>
  enqueue(async () => updateBadge(await audioStatus())).catch(console.error),
);
