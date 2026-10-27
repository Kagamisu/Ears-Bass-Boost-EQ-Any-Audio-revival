/* Adapted from Ears 1.3.12 by Kevin King; original UI retained. */ function scope() {
  var e = chrome.runtime.getManifest().version;
  var t = localStorage;
  var N = function () {};
  document.addEventListener("DOMContentLoaded", function (e) {
    _();
    n();
    a();
  });
  document.addEventListener("DOMContentLoaded", function () {
    var n = document.getElementById("presetNameInput");
    var e = document.getElementById("resetFiltersButton");
    e.onclick = function () {
      n.value = "";
      Ears.sendMessage({ type: "resetFilters" });
    };
    var t = document.getElementById("bassBoostButton");
    t.onclick = function () {
      n.value = "";
      Ears.sendMessage({ type: "preset", preset: "bassBoost" });
    };
    var r = document.getElementById("requiresProDiv");
    function a(e) {
      r.textContent = e;
      r.classList.add("show");
      setTimeout(function () {
        r.classList.remove("show");
      }, 5e3);
    }
    var i = document.getElementById("savePresetButton");
    i.onclick = function () {
      var e = n.value.trim();
      if (e != "") {
        Ears.sendMessage({ type: "savePreset", preset: e });
      } else {
        a(
          "Type a name in the Preset Name box, then click Save Preset or press Enter.",
        );
        n.focus();
      }
    };
    var o = document.getElementById("deletePresetButton");
    o.onclick = function () {
      var e = n.value.trim();
      if (e != "") {
        Ears.sendMessage({ type: "deletePreset", preset: e });
      }
    };
    n.onkeypress = function (e) {
      if (!e) e = window.event;
      var t = e.keyCode || e.which;
      if (t == "13" && document.activeElement == n) {
        i.click();
        return false;
      }
    };
    var s = document.getElementById("exportPresetsButton");
    s.onclick = function () {
      Ears.sendMessage({ type: "exportPresets" });
    };
    var c = document.getElementById("importPresetsButton");
    var u = document.getElementById("importPresetsFile");
    c.onclick = function () {
      u.click();
    };
    u.onchange = function () {
      var e = u.files;
      for (var t = 0; t < e.length; t++) {
        if (e[t].size > 1048576) {
          Ears.showError("Preset file is too large (maximum 1 MiB)");
          continue;
        }
        var n = new FileReader();
        n.onload = function (e) {
          try {
            Ears.sendMessage({
              type: "importPresets",
              presets: JSON.parse(e.target.result),
            });
          } catch (error) {
            Ears.showError("Invalid preset JSON: " + error.message);
          }
        };
        n.readAsText(e[t]);
      }
      u.value = "";
    };
    var l = document.getElementById("vizButton");
    function f() {
      if (y()) {
        l.classList.add("on");
      } else {
        l.classList.remove("on");
      }
    }
    f();
    l.onclick = function () {
      H();
      f();
    };
    var v = ["tab-1", "tab-2", "tab-3"];
    for (var d = 0; d < v.length; d++) {
      var h = v[d];
      document.getElementById(h).addEventListener(
        "change",
        (function (e) {
          return function () {
            if (this.checked) {
              localStorage["last-tab"] = e;
            }
          };
        })(h),
      );
    }
    var m = localStorage["last-tab"];
    if (m) {
      var g = document.getElementById(m);
      if (g) {
        g.click();
      }
    }
    if (window.innerWidth && window.innerWidth > 1e3) {
      document.getElementById("fullscreen-link").style.display = "none";
    }
  });
  function n() {
    Ears.sendMessage({ type: "getFullRefresh" });
  }
  function _() {
    Ears.sendMessage({ type: "onPopupOpen" });
  }
  var E = 44100;
  var O = "eqSvg";
  var z = "eqTabButton";
  var i = true;
  var r = function () {
    if (i) {
      n();
      setTimeout(r, 1e3);
    }
  };
  setTimeout(r, 1e3);
  Ears.onMessage.addListener(function (e, t, n) {
    if (e.type == "sendCurrentTabStatus") {
      if (e.streaming) {
        G();
      } else {
        W();
      }
    }
    if (e.type == "sendWorkspaceStatus") {
      i = false;
      J(e);
    }
    if (e.type == "sendSampleRate") {
      E = e.Fs;
      console.log("set sample rate to " + E);
    }
    if (e.type == "sendPresets") {
      j(e);
    }
  });
  function U(e) {
    if (S) {
      var t = 1e3 / 30 - (performance.now() - S);
      if (t > 0) {
        setTimeout(h, t);
        return;
      }
    }
    S = performance.now();
    if (C) {
      C.remove();
    }
    if (!y()) {
      return;
    }
    var n = (e && e.fft) || [];
    if (I && n.length > 0) {
      if (!spectrumGradient || !spectrumGradient.node.isConnected) {
        spectrumGradient = I.gradient("l(.5, 0, .5, 1)" + m + "-" + q);
      }
      var strokeGradient = spectrumGradient;
      var r = [];
      function a(e) {
        return B - 1 - e;
      }
      for (var i in n) {
        var o = (i * E) / (n.length * 2);
        if (o < 10) {
          continue;
        }
        var s = P(o);
        if (s > T) {
          break;
        }
        var c = ((n[i] + 100) / 100) * B;
        r.push([s, c]);
      }
      var u = [];
      for (var i in r) {
        var l = r[i];
        if (u.length == 0) {
          u.push(l);
          continue;
        }
        var f = u[u.length - 1];
        var v = 2;
        if (l[0] - f[0] < v) {
          if (l[1] > f[1]) {
            f[1] = l[1];
          }
        } else {
          u.push(l);
        }
      }
      var d = [];
      for (var i in u) {
        var f = u[i];
        d = d.concat([f[0], a(f[1])]);
      }
      C = I.polyline(d).attr({
        "fill-opacity": "0",
        stroke: strokeGradient,
        "pointer-events": "none",
      });
    }
    h();
  }
  function h() {
    Ears.sendMessage({ type: "getFFT" }, U);
  }
  function j(e) {
    var t = e.presets;
    var n = document.getElementById("userPresetSpan");
    while (n.firstChild) {
      n.removeChild(n.firstChild);
    }
    var r = Object.keys(t);
    for (var a = 0; a < r.length; a++) {
      (function (e) {
        var t = document.createElement("button");
        t.textContent = e;
        n.appendChild(t);
        t.onclick = function () {
          Ears.sendMessage({ type: "preset", preset: e });
          document.getElementById("presetNameInput").value = e;
        };
      })(r[a]);
    }
  }
  function a() {
    Ears.sendMessage({ type: "eqTab", on: true });
  }
  function W() {
    var e = document.getElementById("eqTabButton");
    e.onclick = function () {
      a();
    };
    e.textContent = "EQ This Tab";
  }
  function G() {
    var e = document.getElementById("eqTabButton");
    e.onclick = function () {
      Ears.sendMessage({ type: "eqTab", on: false });
    };
    e.textContent = "Stop EQing This Tab";
  }
  var o = "SHOW_VISUALIZER";
  function y() {
    return localStorage[o] == true;
  }
  function H() {
    t[o] ^= true;
    if (y()) {
      h();
    }
  }
  var s = [];
  function J(e) {
    s = [];
    for (var t = 0; t < e.eqFilters.length; t++) {
      var n = e.eqFilters[t];
      var r = {};
      r.x = P(n.frequency);
      r.y = F(n.gain);
      var a = n.frequency / n.q;
      r.w = n.frequency / n.q;
      r.t = n.type;
      r.gain = n.gain;
      r.q = n.q;
      r.frequency = n.frequency;
      s.push(r);
    }
    var i = {};
    i.gain = e.gain;
    i.y = F(fe(i.gain));
    $(s, i);
    K(e.streams);
  }
  function K(e) {
    var t = document.getElementById("eqTabList");
    t.innerHTML = "";
    if (e.length == 0) {
      t.textContent =
        "No tabs active. Click 'EQ This Tab' below to activate this tab.";
      return;
    }
    var n = document.createElement("table");
    for (var r = 0; r < e.length; r++) {
      n.appendChild(V(e[r]));
    }
    t.appendChild(n);
  }
  function V(e) {
    var t = document.createElement("tr");
    var n = document.createElement("button");
    n.textContent = "Stop EQing";
    n.onclick = function () {
      Ears.sendMessage({ type: "disconnectTab", tab: e });
    };
    var r = document.createElement("img");
    r.className = "tabFavIcon";
    r.src = "ears16.png";
    r.alt = "";
    n.appendChild(r);
    var a = document.createElement("td");
    a.appendChild(n);
    t.appendChild(a);
    var i = document.createElement("td");
    var o = e.title || "Tab " + e.id;
    if (o.length > 45) {
      o = o.substring(0, 45);
    }
    i.textContent = o;
    t.appendChild(i);
    return t;
  }
  function Y(e) {
    return Math.log(e) / Math.log(2);
  }
  var m = "#F0D6A5";
  var q = "#293B4B";
  var b = "#9573A8";
  var w = "#CDF7E1";
  var T = 600;
  var B = 300;
  var g = 30;
  var c = 22050;
  var u = 30;
  var M = 10;
  var k = -30;
  var Z = 0;
  var X = 0;
  var I = null;
  var C = null;
  var spectrumGradient = null;
  var S = null;
  var x = null;
  function $(e, t) {
    if (I) {
      I.clear();
    }
    if (x) {
      x.clear();
    }
    I = Snap("#eqSvg");
    I.attr({ fill: q, height: B, width: T });
    x = Snap("#gainSvg");
    x.attr({ fill: q, height: B, width: g });
    var n = { fill: m, stroke: m };
    var r = I.rect(0, 0, T, B).attr({ stroke: m });
    re(I, e);
    ae(I);
    var a = x
      .line(g / 2, F(k), g / 2, F(M))
      .attr({ stroke: "#F0D6A5", opacity: 0.5 });
    var i = x
      .text(g / 2, F(M) - 10, "volume")
      .attr({ fill: "#F0D6A5", "text-anchor": "middle", "font-size": 8 });
    var o = x.line(g / 2 - 5, F(0), g / 2 + 5, F(0)).attr({ stroke: "#F0D6A5" });
    var s = x
      .line(0, t.y, g, t.y)
      .attr({ stroke: "#F0D6A5" })
      .addClass("gainLine");
    s.drag(oe(s), Q, se(s));
    for (var c = 0; c < e.length; c++) {
      var u = e[c];
      var l = u.x;
      var f = u.y;
      var v = n;
      if (u.t == "peaking") {
        v = { fill: w, stroke: w };
      }
      if (u.t == "highshelf" || u.t == "lowshelf") {
        v = { fill: b, stroke: b };
      }
      var d = I.circle(l, f, 4).attr(v).addClass("filterDot");
      d.drag(ce(u, c, I), Q, he(u, c));
      d.dblclick(ee(u, c));
    }
  }
  function ee(e, t) {
    return function () {
      e.gain = 0;
      e.y = F(0);
      de(t);
      n();
    };
  }
  function l(e) {
    return L(e / T) * c;
  }
  function P(e) {
    return te(e / c) * T;
  }
  function te(e) {
    return Math.pow(e, 1 / 4);
  }
  function L(e) {
    return Math.pow(e, 4);
  }
  function F(e) {
    var t = u - k;
    return B * (1 - (e - k) / t);
  }
  function f(e) {
    var t = u - k;
    return (1 - e / B) * t + k;
  }
  function ne(e, t, n) {
    if (e < t) {
      return t;
    }
    if (e > n) {
      return n;
    }
    return e;
  }
  function v(e) {
    var t = e.node.getClientRects()[0];
    return [t.left, t.top];
  }
  var R = {};
  var responseContext = null;
  var responseNodes = [];
  var curveGradients = {};
  function d(e, t, n) {
    if (!responseContext || responseContext.sampleRate !== E) {
      responseContext = new OfflineAudioContext(1, 1, E);
      responseNodes = [];
    }
    var node =
      responseNodes[n] ||
      (responseNodes[n] = responseContext.createBiquadFilter());
    node.type = t.t;
    node.frequency.value = Math.min(t.frequency, E / 2);
    node.gain.value = t.gain;
    node.Q.value = t.q;
    var frequencies = new Float32Array(300);
    for (var j = 0; j < 300; j++) {
      frequencies[j] = Math.min(l(j * 2), E / 2);
    }
    var magnitudes = new Float32Array(300);
    var phases = new Float32Array(300);
    node.getFrequencyResponse(frequencies, magnitudes, phases);
    var points = [];
    for (var j = 0; j < 300; j++) {
      var db = 20 * Math.log10(magnitudes[j]);
      if (Number.isFinite(db) && Math.abs(db) > 0.2) {
        points.push(j * 2, F(db));
      }
    }
    var color = t.t === "peaking" ? w : b;
    var direction = t.gain >= 0 ? "l(.5, 0, .5, 1)" : "l(.5, 1, .5, 0)";
    var key = n + ":" + (t.gain >= 0);
    var gradient = curveGradients[key];
    if (!gradient || !gradient.node.isConnected) {
      gradient = curveGradients[key] = e.gradient(direction + color + "-" + q);
    }
    if (R[n]) R[n].remove();
    R[n] = e
      .polyline(points)
      .attr({
        stroke: gradient,
        "fill-opacity": "0",
        "pointer-events": "none",
      });
  }
  function re(e, t) {
    var n = [];
    for (var r = 0; r < t.length; r++) {
      var a = t[r];
      d(e, a, r);
    }
  }
  function ae(e) {
    for (var t = 5; t < c; t *= 2) {
      var n = P(t);
      e.line(n, B / 2 + 10, n, B / 2 - 10).attr({
        stroke: "#F0D6A5",
        "stroke-opacity": 0.25,
      });
      e.line(n, B, n, B - 15).attr({ stroke: "#F0D6A5" });
      e.text(n, B - 18, "" + Math.round(l(n))).attr({
        fill: "#F0D6A5",
        "text-anchor": "middle",
        "font-size": 10,
      });
      e.line(n, 0, n, 15).attr({ stroke: "#F0D6A5" });
    }
    var r = 5;
    for (var a = k; a < u; a += r) {
      var i = F(a);
      if (Math.abs(u) - Math.abs(a) > r / 2) {
        e.line(0, i, 5, i).attr({ stroke: "#F0D6A5" });
        e.text(7, i, "" + a).attr({
          fill: "#F0D6A5",
          "font-size": 10,
          "dominant-baseline": "middle",
        });
      }
    }
  }
  function ie(e) {
    if (e < 0.2) {
      e = 0.2;
    }
    if (e > 11) {
      e = 11;
    }
    return e;
  }
  function oe(o) {
    return function (e, t, n, r, a) {
      var i = v(x);
      r = r - i[1];
      if (r < 0 || r >= B) {
        return;
      }
      if (f(r) > M) {
        t -= r - F(M);
        r = F(M);
      }
      o.y = r;
      o.gain = le(f(r));
      this.attr({
        transform:
          this.data("origTransform") +
          (this.data("origTransform") ? "T" : "t") +
          [0, t],
      });
      ve(o);
    };
  }
  function se(e) {
    return function () {
      this.attr({ fill: q });
      Ears.sendMessage({ type: "gainUpdated", gain: e.gain });
      n();
    };
  }
  function ce(o, s, c) {
    return function (e, t, n, r, a) {
      if (a.shiftKey) {
        o.q = ie(o.q + (a.movementY || 0) / 10);
      } else {
        var i = v(I);
        n = n - i[0];
        r = r - i[1];
        if (n < 0 || n >= T || r < 0 || r >= B) {
          return;
        }
        o.x = n;
        o.y = r;
        o.gain = f(r);
        o.frequency = l(n);
        this.attr({
          transform:
            this.data("origTransform") +
            (this.data("origTransform") ? "T" : "t") +
            [e, t],
        });
      }
      d(c, o, s);
      ue(o, s);
    };
  }
  function ue(e, t) {
    Ears.sendMessage({
      type: "modifyFilter",
      index: t,
      frequency: l(e.x),
      gain: f(e.y),
      q: e.q,
    });
  }
  function le(e) {
    return Math.pow(10, e / 10);
  }
  function fe(e) {
    return 10 * Math.log10(e);
  }
  function ve(e) {
    Ears.sendMessage({ type: "modifyGain", gain: e.gain });
  }
  function de(e) {
    Ears.sendMessage({ type: "resetFilter", index: e });
  }
  var Q = function () {
    this.data("origTransform", this.transform().local);
    this.attr({ fill: "black" });
  };
  function he(e, t) {
    return function () {
      this.attr({ fill: q });
      Ears.sendMessage({
        type: "filterUpdated",
        filterType: e.t,
        frequency: e.frequency,
        gain: e.gain,
        q: e.q,
      });
      n();
    };
  }
  if (y()) {
    h();
  }
}
(function () {
  scope();
})();
