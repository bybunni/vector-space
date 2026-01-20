import { TimelineController } from '../core/TimelineController.js';

/**
 * TimeControls.js
 *
 * Manages UI controls for timeline playback.
 */

export class TimeControls {
    constructor(timelineController) {
        this.timeline = timelineController;

        // Get UI elements
        this.playPauseBtn = document.getElementById('play-pause-btn');
        this.resetBtn = document.getElementById('reset-btn');
        this.timeSlider = document.getElementById('time-slider');
        this.speedSelect = document.getElementById('speed-select');
        this.timeDisplay = document.getElementById('time-display');

        this.isUserScrubbing = false;

        this.setupEventListeners();
        this.updateDisplay();
    }

    /**
     * Set up event listeners for controls
     */
    setupEventListeners() {
        // Play/Pause button
        this.playPauseBtn.addEventListener('click', () => {
            this.timeline.togglePlayPause();
            this.updatePlayPauseButton();
        });

        // Reset button
        this.resetBtn.addEventListener('click', () => {
            this.timeline.reset();
        });

        // Time slider
        this.timeSlider.addEventListener('input', () => {
            this.isUserScrubbing = true;
            const percent = parseFloat(this.timeSlider.value) / 100;
            this.timeline.setTimePercent(percent);
        });

        this.timeSlider.addEventListener('change', () => {
            this.isUserScrubbing = false;
        });

        // Speed selector
        this.speedSelect.addEventListener('change', () => {
            const speed = parseFloat(this.speedSelect.value);
            this.timeline.setSpeed(speed);
        });

        // Register timeline callbacks
        this.timeline.onUpdate((time) => {
            this.updateDisplay();
        });

        this.timeline.onTimeChange((time) => {
            this.updateDisplay();
        });
    }

    /**
     * Update play/pause button text
     */
    updatePlayPauseButton() {
        if (this.timeline.isPlaying) {
            this.playPauseBtn.textContent = '⏸ Pause';
        } else {
            this.playPauseBtn.textContent = '▶ Play';
        }
    }

    /**
     * Update time display and slider
     */
    updateDisplay() {
        // Update play/pause button
        this.updatePlayPauseButton();

        // Update time slider (only if user is not currently scrubbing)
        if (!this.isUserScrubbing) {
            const percent = this.timeline.getTimePercent() * 100;
            this.timeSlider.value = percent;
        }

        // Update time display
        const currentTime = this.timeline.getCurrentTime();
        const relativeTime = this.timeline.formatRelativeTime(currentTime);
        const absoluteTime = TimelineController.formatTime(currentTime);

        this.timeDisplay.textContent = `${relativeTime} (${absoluteTime})`;
    }

    /**
     * Enable controls
     */
    enable() {
        this.playPauseBtn.disabled = false;
        this.resetBtn.disabled = false;
        this.timeSlider.disabled = false;
        this.speedSelect.disabled = false;
    }

    /**
     * Disable controls
     */
    disable() {
        this.playPauseBtn.disabled = true;
        this.resetBtn.disabled = true;
        this.timeSlider.disabled = true;
        this.speedSelect.disabled = true;
    }
}
