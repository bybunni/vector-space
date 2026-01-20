/**
 * TimelineController.js
 *
 * Manages timeline playback and animation for the simulation.
 */

export class TimelineController {
    constructor(simulationData) {
        this.simData = simulationData;
        this.currentTime = 0;
        this.isPlaying = false;
        this.playbackSpeed = 1.0; // 1.0 = real-time
        this.lastUpdateTime = null;

        // Get time range
        const timeRange = this.simData.getTimeRange();
        this.startTime = timeRange.start;
        this.endTime = timeRange.end;
        this.currentTime = this.startTime;

        // Callbacks
        this.updateCallbacks = [];
        this.timeChangeCallbacks = [];
    }

    /**
     * Register a callback for update events (called each frame)
     * @param {Function} callback - Function to call with (currentTime)
     */
    onUpdate(callback) {
        this.updateCallbacks.push(callback);
    }

    /**
     * Register a callback for time change events (user scrubbing)
     * @param {Function} callback - Function to call with (currentTime)
     */
    onTimeChange(callback) {
        this.timeChangeCallbacks.push(callback);
    }

    /**
     * Start playback
     */
    play() {
        if (this.isPlaying) return;

        this.isPlaying = true;
        this.lastUpdateTime = performance.now();
    }

    /**
     * Pause playback
     */
    pause() {
        this.isPlaying = false;
        this.lastUpdateTime = null;
    }

    /**
     * Toggle play/pause
     */
    togglePlayPause() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    /**
     * Set playback speed
     * @param {number} speed - Speed multiplier (1.0 = real-time)
     */
    setSpeed(speed) {
        this.playbackSpeed = speed;
    }

    /**
     * Set current time (for scrubbing)
     * @param {number} time - Unix epoch milliseconds
     */
    setTime(time) {
        this.currentTime = Math.max(this.startTime, Math.min(this.endTime, time));
        this.notifyTimeChange();
    }

    /**
     * Get current time
     * @returns {number} Unix epoch milliseconds
     */
    getCurrentTime() {
        return this.currentTime;
    }

    /**
     * Get time range
     * @returns {Object} {start, end} in Unix epoch milliseconds
     */
    getTimeRange() {
        return {
            start: this.startTime,
            end: this.endTime
        };
    }

    /**
     * Get duration in milliseconds
     * @returns {number}
     */
    getDuration() {
        return this.endTime - this.startTime;
    }

    /**
     * Get current time as percentage (0 to 1)
     * @returns {number}
     */
    getTimePercent() {
        if (this.getDuration() === 0) return 0;
        return (this.currentTime - this.startTime) / this.getDuration();
    }

    /**
     * Set time from percentage (0 to 1)
     * @param {number} percent
     */
    setTimePercent(percent) {
        const time = this.startTime + percent * this.getDuration();
        this.setTime(time);
    }

    /**
     * Update loop - call this each animation frame
     * @param {number} now - Current time from performance.now()
     */
    update(now) {
        if (this.isPlaying) {
            if (this.lastUpdateTime === null) {
                this.lastUpdateTime = now;
            }

            // Calculate elapsed time since last update
            const deltaMs = (now - this.lastUpdateTime) * this.playbackSpeed;
            this.lastUpdateTime = now;

            // Advance current time
            this.currentTime += deltaMs;

            // Loop or stop at end
            if (this.currentTime >= this.endTime) {
                this.currentTime = this.startTime; // Loop
                // Or pause at end:
                // this.currentTime = this.endTime;
                // this.pause();
            }
        }

        // Notify update callbacks
        this.notifyUpdate();
    }

    /**
     * Notify all update callbacks
     */
    notifyUpdate() {
        for (const callback of this.updateCallbacks) {
            callback(this.currentTime);
        }
    }

    /**
     * Notify all time change callbacks
     */
    notifyTimeChange() {
        for (const callback of this.timeChangeCallbacks) {
            callback(this.currentTime);
        }
    }

    /**
     * Reset to start
     */
    reset() {
        this.pause();
        this.currentTime = this.startTime;
        this.notifyTimeChange();
    }

    /**
     * Get platform states at current time
     * @returns {Map<string, PlatformState>} platformId -> state
     */
    getPlatformStates() {
        const states = new Map();

        for (const [id, platform] of this.simData.platforms) {
            const state = platform.getStateAtTime(this.currentTime);
            if (state) {
                states.set(id, state);
            }
        }

        return states;
    }

    /**
     * Get all sensors (sensors are static, not time-dependent)
     * @returns {Map<string, Sensor>}
     */
    getSensors() {
        return this.simData.sensors;
    }

    /**
     * Format time for display
     * @param {number} timestamp - Unix epoch milliseconds
     * @returns {string} Formatted time string
     */
    static formatTime(timestamp) {
        const date = new Date(timestamp);
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        const seconds = String(date.getUTCSeconds()).padStart(2, '0');
        const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
        return `${hours}:${minutes}:${seconds}.${ms}`;
    }

    /**
     * Format time as relative seconds from start
     * @param {number} timestamp - Unix epoch milliseconds
     * @returns {string} Formatted time string
     */
    formatRelativeTime(timestamp) {
        const seconds = (timestamp - this.startTime) / 1000;
        return `${seconds.toFixed(3)}s`;
    }
}
