(function () {
  var STATE_LABEL = { "-1": "LOADING", 0: "ENDED", 1: "PLAYING", 2: "PAUSED", 3: "BUFFERING", 5: "CUED" };
  function paint(self) {
    var hue = 0;
    for (var i = 0; i < self.id.length; i++) hue = (hue * 31 + self.id.charCodeAt(i)) % 360;
    self.mount.style.cssText =
      "width:100%;height:100%;background:hsl(" + hue + ",55%,20%);" +
      "color:#fff;display:grid;place-items:center;text-align:center;" +
      "white-space:pre-line;font:800 30px/1.4 system-ui,sans-serif;letter-spacing:.05em";
    self.mount.textContent = self.id + "\n" + (STATE_LABEL[self.state] || self.state);
  }
  function MockPlayer(mount, opts) {
    var self = this;
    this.opts = opts;
    this.mount = mount;
    this.id = opts.videoId || "no-id";
    this.state = -1;
    this.time = 0;
    this.dur = 3600;
    this.muted = false;
    window.__ctMock = this;
    paint(this);
    setTimeout(function () {
      if (self.destroyed) return;
      self.playing = true;
      self.state = 1;
      paint(self);
      opts.events.onStateChange({ data: 1 });
      self.iv = setInterval(function () {
        if (self.state !== 1) return;
        self.time += 0.25;
        if (self.time >= self.dur) {
          self.time = self.dur;
          self.state = 0;
          paint(self);
          opts.events.onStateChange({ data: 0 });
        }
      }, 250);
    }, 800);
  }
  MockPlayer.prototype.playVideo = function () {
    this.state = 1;
    paint(this);
    this.opts.events.onStateChange({ data: 1 });
  };
  MockPlayer.prototype.pauseVideo = function () {
    this.state = 2;
    paint(this);
    this.opts.events.onStateChange({ data: 2 });
  };
  MockPlayer.prototype.getPlayerState = function () { return this.state; };
  MockPlayer.prototype.seekTo = function (t) {
    this.time = Math.min(t, this.dur - 0.2);
    if (this.state !== 1) {
      this.state = 1;
      paint(this);
      this.opts.events.onStateChange({ data: 1 });
    }
  };
  MockPlayer.prototype.getCurrentTime = function () { return this.time; };
  MockPlayer.prototype.getDuration = function () { return this.dur; };
  MockPlayer.prototype.getVideoLoadedFraction = function () {
    return Math.min(1, this.time / this.dur + 0.1);
  };
  MockPlayer.prototype.isMuted = function () { return this.muted; };
  MockPlayer.prototype.mute = function () { this.muted = true; };
  MockPlayer.prototype.unMute = function () { this.muted = false; };
  MockPlayer.prototype.setVolume = function () {};
  MockPlayer.prototype.getVolume = function () { return 100; };
  MockPlayer.prototype.loadVideoById = function (id) {
    // Legacy path — the app no longer reuses the iframe (it destroys and
    // recreates the player per video), kept for API compatibility.
    this.id = id;
    this.time = 0;
    this.state = -1;
    paint(this);
    this.opts.events.onStateChange({ data: -1 });
    var self = this;
    setTimeout(function () {
      if (self.destroyed) return;
      self.state = 3;
      paint(self);
      self.opts.events.onStateChange({ data: 3 });
    }, 250);
    setTimeout(function () {
      if (self.destroyed) return;
      self.state = 1;
      paint(self);
      self.opts.events.onStateChange({ data: 1 });
    }, 700);
  };
  MockPlayer.prototype.destroy = function () {
    this.destroyed = true;
    if (this.iv) clearInterval(this.iv);
  };
  window.YT = { Player: MockPlayer, PlayerState: {} };
  if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady();
})();
