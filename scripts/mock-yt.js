(function () {
  function MockPlayer(mount, opts) {
    var self = this;
    this.opts = opts;
    this.mount = mount;
    this.state = -1;
    this.time = 0;
    this.dur = 3600;
    this.muted = false;
    window.__ctMock = this;
    // Bright fake "video frame" so any veil leak is visible in screenshots:
    // while playing the frame must be fully visible; while paused/buffering
    // the opaque veil must hide it completely (no color ghosting).
    this.frame = document.createElement("div");
    this.frame.style.cssText =
      "width:100%;height:100%;background:linear-gradient(135deg,#22c55e,#0ea5e9);color:#04140a;font:800 34px sans-serif;display:flex;align-items:center;justify-content:center;letter-spacing:.05em";
    this.frame.textContent = "FAKE VIDEO FRAME";
    mount.appendChild(this.frame);
    setTimeout(function () {
      if (self.destroyed) return;
      self.playing = true;
      self.state = 1;
      opts.events.onStateChange({ data: 1 });
      self.iv = setInterval(function () {
        if (self.state !== 1) return;
        self.time += 0.25;
        if (self.time >= self.dur) {
          self.time = self.dur;
          self.state = 0;
          opts.events.onStateChange({ data: 0 });
        }
      }, 250);
    }, 800);
  }
  MockPlayer.prototype.playVideo = function () {
    this.state = 1;
    this.opts.events.onStateChange({ data: 1 });
  };
  MockPlayer.prototype.pauseVideo = function () {
    this.state = 2;
    this.opts.events.onStateChange({ data: 2 });
  };
  MockPlayer.prototype.getPlayerState = function () { return this.state; };
  MockPlayer.prototype.seekTo = function (t) {
    this.time = Math.min(t, this.dur - 0.2);
    if (this.state !== 1) {
      this.state = 1;
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
    this.time = 0;
    this.state = 3;
    this.opts.events.onStateChange({ data: 3 });
    var self = this;
    setTimeout(function () {
      self.state = 1;
      self.opts.events.onStateChange({ data: 1 });
    }, 400);
  };
  MockPlayer.prototype.destroy = function () {
    this.destroyed = true;
    if (this.iv) clearInterval(this.iv);
  };
  window.YT = { Player: MockPlayer, PlayerState: {} };
  if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady();
})();
