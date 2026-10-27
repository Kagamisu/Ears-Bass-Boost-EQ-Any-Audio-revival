/* Revival settings and validation. No dependency on DOM or extension APIs. */
(function (root) {
  "use strict";
  const frequencies = [
    20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240, 20480,
  ];
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  function number(value, min, max) {
    if (typeof value !== "number" || !Number.isFinite(value))
      throw new Error("Invalid numeric setting");
    return Math.min(max, Math.max(min, value));
  }
  function defaults() {
    return {
      schema: 1,
      gain: 1,
      filters: frequencies.map((frequency, i) => ({
        frequency,
        gain: 0,
        q: 0.7071,
        type: i === 0 ? "lowshelf" : i === 10 ? "highshelf" : "peaking",
      })),
      presets: {},
    };
  }
  function filter(value, index) {
    if (!value || !Number.isInteger(index) || index < 0 || index > 10)
      throw new Error("Invalid filter index");
    return {
      frequency: number(value.frequency, 5, 20480),
      gain: number(value.gain, -30, 30),
      q: number(value.q, 0.2, 11),
      type: index === 0 ? "lowshelf" : index === 10 ? "highshelf" : "peaking",
    };
  }
  function name(value) {
    if (
      typeof value !== "string" ||
      !value.trim() ||
      value.trim().length > 100 ||
      ["__proto__", "prototype", "constructor"].includes(value.trim())
    )
      throw new Error("Preset name must contain 1–100 characters");
    return value.trim();
  }
  function preset(value) {
    if (
      !value ||
      !["frequencies", "gains", "qs"].every(
        (k) => Array.isArray(value[k]) && value[k].length === 11,
      )
    )
      throw new Error(
        "A preset must contain 11 frequencies, gains and Q values",
      );
    const filters = value.frequencies.map((frequency, i) =>
      filter({ frequency, gain: value.gains[i], q: value.qs[i] }, i),
    );
    return {
      frequencies: filters.map((f) => f.frequency),
      gains: filters.map((f) => f.gain),
      qs: filters.map((f) => f.q),
    };
  }
  function presets(value) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).length > 200
    )
      throw new Error("Invalid preset file (maximum 200 presets)");
    const result = {};
    for (const key of Object.keys(value))
      result[name(key)] = preset(value[key]);
    return result;
  }
  function load(value) {
    if (!value) return defaults();
    if (
      value.schema !== 1 ||
      !Array.isArray(value.filters) ||
      value.filters.length !== 11
    )
      throw new Error("Unsupported settings format");
    return {
      schema: 1,
      gain: number(value.gain, 0.00316, 10),
      filters: value.filters.map(filter),
      presets: presets(value.presets),
    };
  }
  function toPreset(filters) {
    return {
      frequencies: filters.map((f) => f.frequency),
      gains: filters.map((f) => f.gain),
      qs: filters.map((f) => f.q),
    };
  }
  function apply(settings, message) {
    const next = load(settings);
    switch (message.type) {
      case "modifyFilter":
        // Original live dragging was clamped to 20 kHz; default high shelf is 20480 Hz.
        next.filters[message.index] = filter(
          { ...message, frequency: number(message.frequency, 5, 20000) },
          message.index,
        );
        break;
      case "modifyGain":
        next.gain = number(message.gain, 0.00316, 10);
        break;
      case "resetFilter":
        filter(next.filters[message.index], message.index);
        next.filters[message.index] = defaults().filters[message.index];
        next.filters[message.index].frequency = Math.min(20000, next.filters[message.index].frequency);
        break;
      case "resetFilters":
        next.filters = defaults().filters;
        next.filters[10].frequency = 20000;
        next.gain = 1;
        break;
      case "savePreset":
        next.presets[name(message.preset)] = toPreset(next.filters);
        break;
      case "deletePreset":
        delete next.presets[name(message.preset)];
        break;
      case "importPresets":
        Object.assign(next.presets, presets(message.presets));
        break;
      case "preset": {
        let selected;
        if (message.preset === "bassBoost") {
          const filters = defaults().filters;
          filters[0].frequency = 340;
          filters[0].gain = 5;
          selected = toPreset(filters);
        } else {
          if (!own(next.presets, message.preset))
            throw new Error("Unknown preset");
          selected = next.presets[message.preset];
        }
        next.filters = selected.frequencies.map((frequency, i) =>
          filter({ frequency: Math.min(20000, frequency), gain: selected.gains[i], q: selected.qs[i] }, i),
        );
        break;
      }
      default:
        throw new Error("Unknown settings command");
    }
    if (Object.keys(next.presets).length > 200)
      throw new Error("Maximum 200 presets");
    return next;
  }
  root.EarsSettings = { defaults, load, apply, preset, presets };
  if (typeof module !== "undefined") module.exports = root.EarsSettings;
})(globalThis);
