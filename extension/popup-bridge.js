/* Adapter keeps the original popup message vocabulary and SVG interactions. */
"use strict";
const Ears = (() => {
  const listeners = [];
  let tabId = null,
    fftInFlight = false;
  const ready = chrome.tabs
    .query({ active: true, currentWindow: true })
    .then((tabs) => {
      const requested = Number(
        new URL(location.href).searchParams.get("tabId"),
      );
      const tab = tabs[0];
      tabId = requested > 0 ? requested :
        (tab && !tab.url?.startsWith(chrome.runtime.getURL("")) ? tab.id : null);
      const link = document.getElementById("fullscreen-link");
      if (link)
        link.href =
          chrome.runtime.getURL("popup.html") +
          (tabId ? "?tabId=" + tabId : "");
    });
  function showError(message) {
    const element = document.getElementById("requiresProDiv");
    if (!element) return;
    element.textContent = message;
    element.classList.add("show");
    clearTimeout(showError.timer);
    showError.timer = setTimeout(() => element.classList.remove("show"), 10000);
  }
  async function sendMessage(message, callback) {
    const fft = message.type === "getFFT";
    if (fft && fftInFlight) return;
    if (fft) fftInFlight = true;
    try {
      await ready;
      const reply = await chrome.runtime.sendMessage({
        ...message,
        tabId,
        target: "worker",
      });
      if (!reply?.ok)
        throw new Error(
          reply?.error ||
            "Ears background is unavailable. Reload the extension.",
        );
      for (const event of reply.events || [])
        for (const listener of listeners) listener(event);
      if (message.type === "exportPresets") {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(reply.result, null, 2)], {
            type: "application/json",
          }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = "EarsAudioToolkitPresets.json";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      if (fft) fftInFlight = false;
      callback?.(reply.result);
    } catch (error) {
      if (fft) fftInFlight = false;
      else showError(error.message);
      callback?.({ type: "fft", fft: [] });
    }
  }
  // Only refresh capture status, never redraw filters while a user is dragging.
  let lastStatus;
  setInterval(async () => {
    if (document.hidden) return;
    try {
      await ready;
      const reply = await chrome.runtime.sendMessage({
        target: "worker",
        type: "getCurrentTabStatus",
        tabId,
      });
      if (!reply?.ok) return;
      const workspace = reply.events.find(
        (e) => e.type === "sendWorkspaceStatus",
      );
      const status = JSON.stringify(workspace.streams);
      for (const event of reply.events.filter(
        (e) => e.type === "sendCurrentTabStatus",
      ))
        for (const listener of listeners) listener(event);
      if (lastStatus !== undefined && lastStatus !== status)
        window.dispatchEvent(new Event("ears-streams-changed"));
      lastStatus = status;
    } catch {
      /* The next explicit action displays failures. */
    }
  }, 1500);
  return {
    sendMessage,
    onMessage: { addListener: (listener) => listeners.push(listener) },
    showError,
  };
})();
window.addEventListener("ears-streams-changed", () =>
  Ears.sendMessage({ type: "getFullRefresh" }),
);
