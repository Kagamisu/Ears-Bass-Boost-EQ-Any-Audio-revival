/* Same Web Audio filter topology and parameters as Ears 1.3.12.
 * The document owns streams; the service worker can be discarded at any time. */
(function (root) {
  "use strict";
  class EarsAudioEngine {
    constructor(onEnded = () => {}) {
      this.sessions = new Map();
      this.context = null;
      this.filters = [];
      this.settings = EarsSettings.defaults();
      this.onEnded = onEnded;
    }
    ramp(param, value, immediate) {
      const now = this.context.currentTime;
      if (immediate) {
        param.value = value;
        return;
      }
      if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
      else {
        param.cancelScheduledValues(now);
        param.setValueAtTime(param.value, now);
      }
      param.setTargetAtTime(value, now, 0.008);
    }
    async prepare(settings) {
      if (!this.context || this.context.state === "closed") {
        this.context = new AudioContext({ latencyHint: "playback" });
        this.input = this.context.createGain();
        this.output = this.context.createGain();
        this.filters = settings.filters.map((f) => {
          const node = this.context.createBiquadFilter();
          node.type = f.type;
          return node;
        });
        let previous = this.input;
        for (const node of this.filters) {
          previous.connect(node);
          previous = node;
        }
        previous.connect(this.output);
        this.output.connect(this.context.destination);
        this.configure(settings, true);
      }
      await this.context.resume();
      if (this.context.state !== "running")
        throw new Error("Audio output is suspended. Open Ears and try again.");
    }
    configure(settings, immediate = false) {
      this.settings = EarsSettings.load(settings);
      if (!this.context) return;
      this.filters.forEach((node, i) => {
        const f = this.settings.filters[i];
        this.ramp(
          node.frequency,
          Math.min(f.frequency, this.context.sampleRate / 2),
          immediate,
        );
        this.ramp(node.gain, f.gain, immediate);
        this.ramp(node.Q, f.q, immediate);
      });
      this.ramp(this.output.gain, this.settings.gain, immediate);
    }
    async start(tab, streamId, settings) {
      if (this.sessions.has(tab.id)) return this.status();
      let stream, source;
      try {
        // Establish an audible destination before consuming the capture token.
        await this.prepare(settings);
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: "tab",
              chromeMediaSourceId: streamId,
            },
          },
          video: false,
        });
        if (!stream.getAudioTracks().some((t) => t.readyState === "live"))
          throw new Error("The tab supplied no live audio track");
        source = this.context.createMediaStreamSource(stream);
        source.connect(this.input);
        this.sessions.set(tab.id, {
          tab: { id: tab.id, title: tab.title || "Tab " + tab.id },
          stream,
          source,
        });
        stream.getTracks().forEach((track) =>
          track.addEventListener(
            "ended",
            () => {
              void this.stop(tab.id).then(() => this.onEnded(tab.id));
            },
            { once: true },
          ),
        );
        await this.context.resume();
        if (this.context.state !== "running")
          throw new Error("Audio output could not resume");
        return this.status();
      } catch (error) {
        source?.disconnect();
        stream?.getTracks().forEach((t) => t.stop());
        this.sessions.delete(tab.id);
        if (!this.sessions.size) await this.close();
        throw error;
      }
    }
    async stop(tabId) {
      const entry = this.sessions.get(tabId);
      if (entry) {
        this.sessions.delete(tabId);
        entry.source.disconnect();
        entry.stream.getTracks().forEach((t) => t.stop());
      }
      if (!this.sessions.size) await this.close();
      return this.status();
    }
    async close() {
      clearTimeout(this.analyserTimer);
      this.detachAnalyser();
      if (!this.context) return;
      const context = this.context;
      this.input.disconnect();
      this.output.disconnect();
      this.filters.forEach((f) => f.disconnect());
      this.context = null;
      this.filters = [];
      this.input = null;
      this.output = null;
      await context.close();
    }
    detachAnalyser() {
      if (this.analyser) {
        this.output?.disconnect(this.analyser);
        this.analyser.disconnect();
        this.analyser = null;
      }
    }
    fft() {
      if (!this.context || !this.sessions.size) return { type: "fft", fft: [] };
      if (!this.analyser) {
        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = 8192;
        this.analyser.smoothingTimeConstant = 0.5;
        this.output.connect(this.analyser);
      }
      clearTimeout(this.analyserTimer);
      this.analyserTimer = setTimeout(() => this.detachAnalyser(), 1100);
      const bins = new Float32Array(this.analyser.frequencyBinCount);
      this.analyser.getFloatFrequencyData(bins);
      // Chrome messages use JSON; silence (-Infinity) must not turn into null.
      return {
        type: "fft",
        fft: Array.from(bins, (n) => (Number.isFinite(n) ? n : -160)),
      };
    }
    status() {
      return {
        streams: [...this.sessions.values()].map((s) => s.tab),
        sampleRate: this.context?.sampleRate || 44100,
        contextState: this.context?.state || "closed",
      };
    }
  }
  root.EarsAudioEngine = EarsAudioEngine;
})(globalThis);
