/**
 * VSL Player - Video Sales Letter Player Library
 * A specialized HLS video player with progress tracking and custom controls
 * @version 1.0.0
 */

(function (window) {
  "use strict";

  const VSLPlayer = {
    instances: [],

    /**
     * Initialize a new VSL Player instance
     * @param {string} selector - CSS selector for container element
     * @param {Object} options - Configuration options
     * @returns {Object} Player instance
     */
    init: function (selector, options = {}) {
      const container = document.querySelector(selector);
      if (!container) {
        console.error(`VSLPlayer: Container "${selector}" not found`);
        return null;
      }

      const player = new VSLPlayerInstance(container, options);
      this.instances.push(player);
      return player;
    },
  };

  /**
   * VSL Player Instance Class
   */
  class VSLPlayerInstance {
    constructor(container, options) {
      // Default configuration
      this.config = {
        videoSrc: options.videoSrc || "",
        colorTheme: options.colorTheme || "#5A3FFF",
        autoplay: options.autoplay || false,
        hideControls: options.hideControls || false,
        saveProgress: options.saveProgress !== false,
        distortionFactor: options.distortionFactor || 0.4,
        volumeControl: options.volumeControl !== false,
        fullscreenControl: options.fullscreenControl !== false,
        playbackRate: options.playbackRate || 1.0,
        persistenceKey: options.persistenceKey || null,
        defaultQuality: options.defaultQuality || "auto", // 'auto', 'high', 'medium', 'low', or specific height like 1080, 720, 480, 360
        // Callbacks
        onReady: options.onReady || null,
        onPlay: options.onPlay || null,
        onPause: options.onPause || null,
        onProgress: options.onProgress || null,
        onEnded: options.onEnded || null,
        onError: options.onError || null,
      };

      this.container = container;
      this.videoElement = null;
      this.hls = null;
      this.progressSaveInterval = null;
      this.isCustomFullscreen = false;
      this.savedVolume = 1;
      this.userHasInteracted = false; // Track if user manually clicked play

      // Generate storage key
      this.storageKey =
        this.config.persistenceKey ||
        `vsl_progress_${this.hashCode(this.config.videoSrc)}`;

      this.init();
    }

    /**
     * Initialize the player
     */
    init() {
      this.buildPlayerUI();
      this.setupVideo();
      this.setupControls();
      this.checkSavedProgress();
      this.applyTheme();

      if (this.config.onReady) {
        this.config.onReady(this);
      }
    }

    /**
     * Build the player UI structure
     */
    buildPlayerUI() {
      this.container.className = "vsl-player-container";
      this.container.innerHTML = `
        <div class="vsl-player-wrapper">
          <video class="vsl-video" playsinline webkit-playsinline></video>
          
          <!-- Centered Play/Pause Button -->
          <button class="vsl-center-play-btn show" aria-label="Play">
            <svg class="vsl-center-play-icon" viewBox="0 0 24 24">
              <polygon points="8 5 19 12 8 19 8 5" fill="currentColor"></polygon>
            </svg>
            <svg class="vsl-center-pause-icon" viewBox="0 0 24 24" style="display: none;">
              <rect x="7" y="4" width="4" height="16" fill="currentColor"></rect>
              <rect x="13" y="4" width="4" height="16" fill="currentColor"></rect>
            </svg>
          </button>
          
          <!-- Resume Overlay -->
          <div class="vsl-overlay vsl-resume-overlay" style="display: none;">
            <div class="vsl-overlay-content">
              <h2 class="vsl-overlay-title">You have already started watching this video</h2>
              <div class="vsl-overlay-buttons">
                <button class="vsl-overlay-btn vsl-resume-btn">
                  <svg class="vsl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                  <span>Continue watching?</span>
                </button>
                <button class="vsl-overlay-btn vsl-restart-btn">
                  <svg class="vsl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="1 4 1 10 7 10"></polyline>
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                  </svg>
                  <span>Start from beginning?</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Autoplay Overlay -->
          <div class="vsl-overlay vsl-autoplay-overlay" style="display: none;">
            <div class="vsl-overlay-content">
              <h2 class="vsl-overlay-title">Your video has already started</h2>
              <div class="vsl-muted-icon">
                <svg class="vsl-icon-large" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <line x1="23" y1="9" x2="17" y2="15"></line>
                  <line x1="17" y1="9" x2="23" y2="15"></line>
                </svg>
              </div>
              <button class="vsl-overlay-btn vsl-unmute-btn">Click to listen</button>
            </div>
          </div>

          <!-- Error Overlay -->
          <div class="vsl-overlay vsl-error-overlay" style="display: none;">
            <div class="vsl-overlay-content">
              <svg class="vsl-icon-large" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <h2 class="vsl-overlay-title vsl-error-title">Video Error</h2>
              <p class="vsl-error-message"></p>
            </div>
          </div>
        </div>

        <!-- Progress Bar -->
        <div class="vsl-progress-container">
          <div class="vsl-progress-buffered"></div>
          <div class="vsl-progress-bar"></div>
        </div>

        <!-- Controls -->
        <div class="vsl-controls">
          <button class="vsl-control-btn vsl-play-btn" aria-label="Play">
            <svg class="vsl-icon vsl-play-icon" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <svg class="vsl-icon vsl-pause-icon" viewBox="0 0 24 24" fill="currentColor" style="display: none;">
              <rect x="6" y="4" width="4" height="16"></rect>
              <rect x="14" y="4" width="4" height="16"></rect>
            </svg>
          </button>

          <div class="vsl-time-display" style="display: none;">
            <span class="vsl-current-time">0:00</span>
            <span class="vsl-time-separator">/</span>
            <span class="vsl-duration">0:00</span>
          </div>

          <div class="vsl-controls-right">
            <div class="vsl-volume-control" style="display: none;">
              <button class="vsl-control-btn vsl-volume-btn" aria-label="Mute">
                <svg class="vsl-icon vsl-volume-high" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                </svg>
                <svg class="vsl-icon vsl-volume-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: none;">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <line x1="23" y1="9" x2="17" y2="15"></line>
                  <line x1="17" y1="9" x2="23" y2="15"></line>
                </svg>
              </button>
              <input type="range" class="vsl-volume-slider" min="0" max="100" value="100" aria-label="Volume">
            </div>

            <button class="vsl-control-btn vsl-fullscreen-btn" aria-label="Fullscreen" style="display: none;">
              <svg class="vsl-icon vsl-fullscreen-enter" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
              </svg>
              <svg class="vsl-icon vsl-fullscreen-exit" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: none;">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
              </svg>
            </button>
          </div>
        </div>
      `;

      // Get references to elements
      this.elements = {
        wrapper: this.container.querySelector(".vsl-player-wrapper"),
        video: this.container.querySelector(".vsl-video"),
        centerPlayBtn: this.container.querySelector(".vsl-center-play-btn"),
        centerPlayIcon: this.container.querySelector(".vsl-center-play-icon"),
        centerPauseIcon: this.container.querySelector(".vsl-center-pause-icon"),
        resumeOverlay: this.container.querySelector(".vsl-resume-overlay"),
        autoplayOverlay: this.container.querySelector(".vsl-autoplay-overlay"),
        errorOverlay: this.container.querySelector(".vsl-error-overlay"),
        progressContainer: this.container.querySelector(
          ".vsl-progress-container"
        ),
        progressBar: this.container.querySelector(".vsl-progress-bar"),
        progressBuffered: this.container.querySelector(
          ".vsl-progress-buffered"
        ),
        controls: this.container.querySelector(".vsl-controls"),
        playBtn: this.container.querySelector(".vsl-play-btn"),
        playIcon: this.container.querySelector(".vsl-play-icon"),
        pauseIcon: this.container.querySelector(".vsl-pause-icon"),
        timeDisplay: this.container.querySelector(".vsl-time-display"),
        currentTime: this.container.querySelector(".vsl-current-time"),
        duration: this.container.querySelector(".vsl-duration"),
        volumeControl: this.container.querySelector(".vsl-volume-control"),
        volumeBtn: this.container.querySelector(".vsl-volume-btn"),
        volumeSlider: this.container.querySelector(".vsl-volume-slider"),
        volumeHigh: this.container.querySelector(".vsl-volume-high"),
        volumeMuted: this.container.querySelector(".vsl-volume-muted"),
        fullscreenBtn: this.container.querySelector(".vsl-fullscreen-btn"),
        fullscreenEnter: this.container.querySelector(".vsl-fullscreen-enter"),
        fullscreenExit: this.container.querySelector(".vsl-fullscreen-exit"),
      };

      this.videoElement = this.elements.video;
    }

    /**
     * Setup video player with HLS.js or native
     */
    setupVideo() {
      const video = this.videoElement;
      video.preload = "metadata";

      // Disable native controls
      video.controls = false;

      // iOS specific attributes
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");

      // Prevent iOS native fullscreen
      video.addEventListener("webkitbeginfullscreen", (e) => {
        e.preventDefault();
        if (this.config.fullscreenControl) {
          this.enterCustomFullscreen();
        }
      });

      // Check HLS support
      if (this.config.videoSrc.endsWith(".m3u8")) {
        if (Hls.isSupported()) {
          this.hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
          });

          this.hls.loadSource(this.config.videoSrc);
          this.hls.attachMedia(video);

          this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
            this.setDefaultQuality();
            this.onVideoReady();
          });

          this.hls.on(Hls.Events.ERROR, (event, data) => {
            this.handleError(data);
          });
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          // Native HLS support (Safari)
          video.src = this.config.videoSrc;
          video.addEventListener("loadedmetadata", () => {
            this.onVideoReady();
          });
        } else {
          this.showError("Your browser does not support HLS video playback");
        }
      } else {
        video.src = this.config.videoSrc;
        video.addEventListener("loadedmetadata", () => {
          this.onVideoReady();
        });
      }

      // Video event listeners
      video.addEventListener("play", () => this.onPlay());
      video.addEventListener("pause", () => this.onPause());
      video.addEventListener("timeupdate", () => this.onTimeUpdate());
      video.addEventListener("ended", () => this.onEnded());
      video.addEventListener("volumechange", () => this.onVolumeChange());
      video.addEventListener("error", (e) => this.handleError(e));
      video.addEventListener("progress", () => this.updateBuffered());
    }

    /**
     * Setup control event listeners
     */
    setupControls() {
      const { elements, config } = this;

      // Play/Pause button (in controls bar)
      elements.playBtn.addEventListener("click", () => this.togglePlay());

      // Center play/pause button
      elements.centerPlayBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.togglePlay();
      });

      // Click anywhere on video to toggle play/pause
      elements.video.addEventListener("click", (e) => {
        // Don't toggle if clicking on overlays
        if (e.target.closest(".vsl-overlay")) {
          return;
        }
        this.togglePlay();
      });

      // Mobile touch handling for showing/hiding controls
      let controlsTimeout;
      elements.wrapper.addEventListener("click", (e) => {
        // Don't toggle controls if clicking on a button or control element
        if (
          e.target.closest(".vsl-control-btn") ||
          e.target.closest(".vsl-overlay-btn") ||
          e.target.closest(".vsl-center-play-btn")
        ) {
          return;
        }

        // Toggle controls visibility on mobile
        if (window.innerWidth <= 768) {
          elements.wrapper.classList.toggle("vsl-show-controls");

          // Auto-hide controls after 3 seconds
          clearTimeout(controlsTimeout);
          if (elements.wrapper.classList.contains("vsl-show-controls")) {
            controlsTimeout = setTimeout(() => {
              elements.wrapper.classList.remove("vsl-show-controls");
            }, 3000);
          }
        }
      });

      // Progress bar (only interactive if not hideControls)
      if (!config.hideControls) {
        elements.progressContainer.style.cursor = "pointer";
        elements.progressContainer.addEventListener("click", (e) => {
          const rect = elements.progressContainer.getBoundingClientRect();
          const percent = (e.clientX - rect.left) / rect.width;
          this.seek(percent * this.videoElement.duration);
        });
      } else {
        elements.progressContainer.style.cursor = "default";
        elements.timeDisplay.style.display = "none";
      }

      // Volume controls
      if (config.volumeControl) {
        elements.volumeControl.style.display = "flex";

        elements.volumeBtn.addEventListener("click", () => this.toggleMute());
        elements.volumeSlider.addEventListener("input", (e) => {
          this.setVolume(e.target.value / 100);
        });
      }

      // Fullscreen button
      if (config.fullscreenControl) {
        elements.fullscreenBtn.style.display = "block";
        elements.fullscreenBtn.addEventListener("click", () =>
          this.toggleFullscreen()
        );
      }

      // Overlay buttons
      elements.resumeOverlay
        .querySelector(".vsl-resume-btn")
        .addEventListener("click", () => {
          this.userHasInteracted = true;
          this.hideOverlay("resume");
          this.play();
        });

      elements.resumeOverlay
        .querySelector(".vsl-restart-btn")
        .addEventListener("click", () => {
          this.userHasInteracted = true;
          this.clearProgress();
          this.seek(0);
          this.hideOverlay("resume");
          this.play();
        });

      elements.autoplayOverlay
        .querySelector(".vsl-unmute-btn")
        .addEventListener("click", () => {
          this.userHasInteracted = true;
          this.videoElement.currentTime = 0;
          this.videoElement.muted = false;
          this.hideOverlay("autoplay");

          // Start progress save interval since video is already playing
          if (this.config.saveProgress) {
            console.log(
              "VSLPlayer: Starting progress save interval from autoplay"
            );
            if (this.progressSaveInterval) {
              clearInterval(this.progressSaveInterval);
            }
            this.progressSaveInterval = setInterval(() => {
              this.saveProgress();
            }, 1000);
          }
        });

      // Click anywhere on autoplay overlay to unmute and restart
      elements.autoplayOverlay.addEventListener("click", () => {
        this.userHasInteracted = true;
        this.videoElement.currentTime = 0;
        this.videoElement.muted = false;
        this.hideOverlay("autoplay");

        // Start progress save interval since video is already playing
        if (this.config.saveProgress) {
          console.log(
            "VSLPlayer: Starting progress save interval from autoplay"
          );
          if (this.progressSaveInterval) {
            clearInterval(this.progressSaveInterval);
          }
          this.progressSaveInterval = setInterval(() => {
            this.saveProgress();
          }, 1000);
        }
      });

      // Keyboard controls
      this.container.addEventListener("keydown", (e) => this.handleKeyboard(e));
    }

    /**
     * Apply color theme
     */
    applyTheme() {
      this.container.style.setProperty(
        "--vsl-theme-color",
        this.config.colorTheme
      );
    }

    /**
     * Check for saved progress
     */
    checkSavedProgress() {
      if (!this.config.saveProgress) return;

      const saved = this.getSavedProgress();
      console.log("VSLPlayer: Checking saved progress", saved);

      if (
        saved &&
        saved.currentTime > 3 &&
        saved.currentTime < saved.duration * 0.95
      ) {
        console.log("VSLPlayer: Showing resume overlay");
        this.showOverlay("resume");
        this.videoElement.currentTime = saved.currentTime;
      } else if (this.config.autoplay) {
        this.startAutoplay();
      }
    }

    /**
     * Start autoplay with muted overlay
     */
    startAutoplay() {
      this.videoElement.muted = true;
      this.videoElement
        .play()
        .then(() => {
          this.showOverlay("autoplay");
        })
        .catch((error) => {
          console.warn("Autoplay prevented:", error);
          // Autoplay was prevented, user will need to click play
        });
    }

    /**
     * Video ready callback
     */
    onVideoReady() {
      // Show time display if controls not hidden
      if (!this.config.hideControls) {
        this.elements.timeDisplay.style.display = "flex";
      }

      // Update duration display
      this.updateTimeDisplay();
    }

    /**
     * Play the video
     */
    play() {
      this.videoElement.play();
    }

    /**
     * Play the video (called by user interaction)
     */
    playByUser() {
      this.userHasInteracted = true;
      this.play();
    }

    /**
     * Pause the video
     */
    pause() {
      this.videoElement.pause();
    }

    /**
     * Toggle play/pause
     */
    togglePlay() {
      if (this.videoElement.paused) {
        this.userHasInteracted = true;
        console.log(
          "VSLPlayer: User interaction detected, progress saving enabled"
        );
        this.play();
      } else {
        this.pause();
      }
    }

    /**
     * Seek to specific time
     */
    seek(time) {
      this.videoElement.currentTime = time;
    }

    /**
     * On play event
     */
    onPlay() {
      this.elements.playIcon.style.display = "none";
      this.elements.pauseIcon.style.display = "block";

      // Keep center play icon visible (don't switch to pause)
      this.elements.centerPlayIcon.style.display = "block";
      this.elements.centerPauseIcon.style.display = "none";

      // Add playing class to container
      this.container.classList.add("playing");

      // Start progress save interval only if user has interacted
      if (this.config.saveProgress && this.userHasInteracted) {
        console.log("VSLPlayer: Starting progress save interval");
        // Clear any existing interval first
        if (this.progressSaveInterval) {
          clearInterval(this.progressSaveInterval);
        }

        this.progressSaveInterval = setInterval(() => {
          this.saveProgress();
        }, 1000); // Save every 1 second
      } else {
        console.log(
          "VSLPlayer: NOT saving progress - saveProgress:",
          this.config.saveProgress,
          "userHasInteracted:",
          this.userHasInteracted
        );
      }

      if (this.config.onPlay) {
        this.config.onPlay();
      }
    }

    /**
     * On pause event
     */
    onPause() {
      this.elements.playIcon.style.display = "block";
      this.elements.pauseIcon.style.display = "none";

      // Update center play button
      this.elements.centerPlayIcon.style.display = "block";
      this.elements.centerPauseIcon.style.display = "none";

      // Remove playing class from container
      this.container.classList.remove("playing");

      // Clear progress save interval and save immediately only if user has interacted
      if (this.progressSaveInterval) {
        clearInterval(this.progressSaveInterval);
        if (this.userHasInteracted) {
          this.saveProgress();
        }
      }

      if (this.config.onPause) {
        this.config.onPause();
      }
    }

    /**
     * On time update
     */
    onTimeUpdate() {
      this.updateTimeDisplay();
      this.updateProgressBar();

      if (this.config.onProgress) {
        this.config.onProgress(
          this.videoElement.currentTime,
          this.videoElement.duration
        );
      }
    }

    /**
     * On video ended
     */
    onEnded() {
      this.elements.playIcon.style.display = "block";
      this.elements.pauseIcon.style.display = "none";

      // Clear saved progress when video completes
      if (this.config.saveProgress) {
        this.clearProgress();
      }

      if (this.config.onEnded) {
        this.config.onEnded();
      }
    }

    /**
     * Update time display
     */
    updateTimeDisplay() {
      const current = this.formatTime(this.videoElement.currentTime);
      const duration = this.formatTime(this.videoElement.duration);

      this.elements.currentTime.textContent = current;
      this.elements.duration.textContent = duration;
    }

    /**
     * Update progress bar with distortion
     */
    updateProgressBar() {
      const actualProgress =
        this.videoElement.currentTime / this.videoElement.duration;
      const visualProgress = Math.pow(
        actualProgress,
        this.config.distortionFactor
      );

      this.elements.progressBar.style.width = visualProgress * 100 + "%";
    }

    /**
     * Update buffered progress
     */
    updateBuffered() {
      const video = this.videoElement;
      if (video.buffered.length > 0) {
        const buffered = video.buffered.end(video.buffered.length - 1);
        const duration = video.duration;
        const bufferedPercent = (buffered / duration) * 100;
        this.elements.progressBuffered.style.width = bufferedPercent + "%";
      }
    }

    /**
     * Format time in seconds to MM:SS
     */
    formatTime(seconds) {
      if (isNaN(seconds)) return "0:00";

      const minutes = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${minutes}:${secs.toString().padStart(2, "0")}`;
    }

    /**
     * Toggle mute
     */
    toggleMute() {
      if (this.videoElement.muted) {
        this.videoElement.muted = false;
        this.videoElement.volume = this.savedVolume;
      } else {
        this.savedVolume = this.videoElement.volume;
        this.videoElement.muted = true;
      }
    }

    /**
     * Set volume
     */
    setVolume(volume) {
      this.videoElement.volume = volume;
      this.videoElement.muted = false;
    }

    /**
     * On volume change
     */
    onVolumeChange() {
      const volume = this.videoElement.volume;
      const muted = this.videoElement.muted;

      // Update slider
      this.elements.volumeSlider.value = muted ? 0 : volume * 100;

      // Update icon
      if (muted || volume === 0) {
        this.elements.volumeHigh.style.display = "none";
        this.elements.volumeMuted.style.display = "block";
      } else {
        this.elements.volumeHigh.style.display = "block";
        this.elements.volumeMuted.style.display = "none";
      }
    }

    /**
     * Toggle fullscreen
     */
    toggleFullscreen() {
      if (this.isCustomFullscreen) {
        this.exitCustomFullscreen();
      } else {
        this.enterCustomFullscreen();
      }
    }

    /**
     * Enter custom fullscreen
     */
    enterCustomFullscreen() {
      this.container.classList.add("vsl-fullscreen");
      this.isCustomFullscreen = true;
      this.elements.fullscreenEnter.style.display = "none";
      this.elements.fullscreenExit.style.display = "block";

      // Lock orientation on mobile if available
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock("landscape").catch(() => {});
      }
    }

    /**
     * Exit custom fullscreen
     */
    exitCustomFullscreen() {
      this.container.classList.remove("vsl-fullscreen");
      this.isCustomFullscreen = false;
      this.elements.fullscreenEnter.style.display = "block";
      this.elements.fullscreenExit.style.display = "none";

      // Unlock orientation
      if (screen.orientation && screen.orientation.unlock) {
        screen.orientation.unlock();
      }
    }

    /**
     * Show overlay
     */
    showOverlay(type) {
      if (type === "resume") {
        this.elements.resumeOverlay.style.display = "flex";
      } else if (type === "autoplay") {
        this.elements.autoplayOverlay.style.display = "flex";
      }
    }

    /**
     * Hide overlay
     */
    hideOverlay(type) {
      if (type === "resume") {
        this.elements.resumeOverlay.style.display = "none";
      } else if (type === "autoplay") {
        this.elements.autoplayOverlay.style.display = "none";
      }
    }

    /**
     * Show error overlay
     */
    showError(message) {
      this.elements.errorOverlay.querySelector(
        ".vsl-error-message"
      ).textContent = message;
      this.elements.errorOverlay.style.display = "flex";

      if (this.config.onError) {
        this.config.onError(message);
      }
    }

    /**
     * Handle errors
     */
    handleError(error) {
      console.error("VSLPlayer error:", error);

      let message = "An error occurred while playing the video";

      if (error.type === Hls.ErrorTypes.NETWORK_ERROR) {
        message = "Network error. Please check your connection.";
      } else if (error.type === Hls.ErrorTypes.MEDIA_ERROR) {
        message = "Media error. The video format may not be supported.";
      }

      this.showError(message);
    }

    /**
     * Handle keyboard events
     */
    handleKeyboard(e) {
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          this.togglePlay();
          break;
        case "f":
          e.preventDefault();
          if (this.config.fullscreenControl) {
            this.toggleFullscreen();
          }
          break;
        case "m":
          e.preventDefault();
          if (this.config.volumeControl) {
            this.toggleMute();
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (this.config.volumeControl) {
            this.setVolume(Math.min(1, this.videoElement.volume + 0.1));
          }
          break;
        case "ArrowDown":
          e.preventDefault();
          if (this.config.volumeControl) {
            this.setVolume(Math.max(0, this.videoElement.volume - 0.1));
          }
          break;
      }
    }

    /**
     * Save progress to localStorage
     */
    saveProgress() {
      if (!this.config.saveProgress) return;

      const data = {
        videoSrc: this.config.videoSrc,
        currentTime: this.videoElement.currentTime,
        duration: this.videoElement.duration,
        timestamp: Date.now(),
      };

      try {
        localStorage.setItem(this.storageKey, JSON.stringify(data));
        console.log(
          `VSLPlayer: Progress saved - ${Math.floor(data.currentTime)}s / ${Math.floor(data.duration)}s`
        );
      } catch (e) {
        console.warn("Failed to save progress:", e);
      }
    }

    /**
     * Get saved progress from localStorage
     */
    getSavedProgress() {
      try {
        const data = localStorage.getItem(this.storageKey);
        return data ? JSON.parse(data) : null;
      } catch (e) {
        console.warn("Failed to get saved progress:", e);
        return null;
      }
    }

    /**
     * Clear saved progress
     */
    clearProgress() {
      try {
        localStorage.removeItem(this.storageKey);
      } catch (e) {
        console.warn("Failed to clear progress:", e);
      }
    }

    /**
     * Set default quality level for HLS stream
     */
    setDefaultQuality() {
      if (!this.hls) return;

      const levels = this.hls.levels;
      if (!levels || levels.length === 0) return;

      const quality = this.config.defaultQuality;

      // Auto quality (adaptive bitrate)
      if (quality === "auto") {
        this.hls.currentLevel = -1; // Enable auto quality
        return;
      }

      let targetLevel = -1;

      // Quality presets
      if (quality === "high") {
        targetLevel = levels.length - 1; // Highest quality
      } else if (quality === "medium") {
        targetLevel = Math.floor(levels.length / 2); // Middle quality
      } else if (quality === "low") {
        targetLevel = 0; // Lowest quality
      } else if (typeof quality === "number") {
        // Specific height (e.g., 1080, 720, 480, 360)
        // Find the level closest to the requested height
        targetLevel = levels.reduce((closest, level, index) => {
          const currentDiff = Math.abs(level.height - quality);
          const closestDiff = Math.abs(levels[closest].height - quality);
          return currentDiff < closestDiff ? index : closest;
        }, 0);
      }

      if (targetLevel >= 0 && targetLevel < levels.length) {
        this.hls.currentLevel = targetLevel;
        console.log(
          `VSLPlayer: Set quality to ${levels[targetLevel].height}p (${levels[targetLevel].bitrate} bps)`
        );
      }
    }

    /**
     * Get current time
     */
    getCurrentTime() {
      return this.videoElement.currentTime;
    }

    /**
     * Change quality level
     * @param {string|number} quality - 'auto', 'high', 'medium', 'low', or specific height
     */
    setQuality(quality) {
      this.config.defaultQuality = quality;
      this.setDefaultQuality();
    }

    /**
     * Get available quality levels
     * @returns {Array} Array of quality levels with height and bitrate
     */
    getQualityLevels() {
      if (!this.hls || !this.hls.levels) return [];

      return this.hls.levels.map((level, index) => ({
        index: index,
        height: level.height,
        width: level.width,
        bitrate: level.bitrate,
        label: `${level.height}p`,
      }));
    }

    /**
     * Seek to time
     */
    seekTo(seconds) {
      this.seek(seconds);
    }

    /**
     * Destroy the player
     */
    destroy() {
      // Stop progress saving
      if (this.progressSaveInterval) {
        clearInterval(this.progressSaveInterval);
      }

      // Save final progress
      if (this.config.saveProgress) {
        this.saveProgress();
      }

      // Destroy HLS instance
      if (this.hls) {
        this.hls.destroy();
      }

      // Clear container
      this.container.innerHTML = "";
      this.container.className = "";
    }

    /**
     * Generate hash code from string
     */
    hashCode(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
      }
      return Math.abs(hash).toString(36);
    }
  }

  // Expose to window
  window.VSLPlayer = VSLPlayer;
})(window);
