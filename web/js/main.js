import { CSVParser } from './core/CSVParser.js';
import { TimelineController } from './core/TimelineController.js';
import { SceneManager } from './rendering/SceneManager.js';
import { GridRenderer } from './rendering/GridRenderer.js';
import { PlatformRenderer } from './rendering/PlatformRenderer.js';
import { SensorRenderer } from './rendering/SensorRenderer.js';
import { FileUpload } from './ui/FileUpload.js';
import { TimeControls } from './ui/TimeControls.js';

/**
 * Main application class
 */
class VectorSpaceApp {
    constructor() {
        // Initialize scene
        const canvas = document.getElementById('canvas');
        this.sceneManager = new SceneManager(canvas);

        // Grid renderer (static)
        this.gridRenderer = new GridRenderer(this.sceneManager);

        // Dynamic renderers (will be created after data load)
        this.platformRenderer = null;
        this.sensorRenderer = null;

        // Timeline controller (will be created after data load)
        this.timeline = null;
        this.timeControls = null;

        // File upload handler
        this.fileUpload = new FileUpload(
            document.getElementById('file-input'),
            (csvText, fileName) => this.onFileLoaded(csvText, fileName),
            (error) => this.onError(error)
        );

        // Start rendering loop
        this.sceneManager.startAnimation();

        // Register animation callback
        this.sceneManager.onAnimate((time) => this.onAnimate(time));

        // Show initial message
        this.showMessage('Load a CSV file to begin');

        // Add load button handler
        const loadBtn = document.getElementById('load-btn');
        if (loadBtn) {
            loadBtn.addEventListener('click', () => {
                this.fileUpload.selectFile();
            });
        }
    }

    /**
     * Handle CSV file load
     * @param {string} csvText - CSV file contents
     * @param {string} fileName - File name
     */
    onFileLoaded(csvText, fileName) {
        try {
            this.showMessage(`Parsing ${fileName}...`);

            // Parse CSV
            const simData = CSVParser.parse(csvText);

            // Validate data
            if (simData.platforms.size === 0) {
                throw new Error('No platforms found in CSV');
            }

            this.showMessage(`Loaded ${simData.platforms.size} platforms, ${simData.sensors.size} sensors`);

            // Clear previous renderers
            this.clearRenderers();

            // Create renderers
            this.platformRenderer = new PlatformRenderer(this.sceneManager, simData);
            this.sensorRenderer = new SensorRenderer(this.sceneManager, simData);

            // Create timeline controller
            this.timeline = new TimelineController(simData);

            // Create time controls UI
            if (this.timeControls) {
                // Remove old controls
                this.timeControls = null;
            }
            this.timeControls = new TimeControls(this.timeline);
            this.timeControls.enable();

            // Focus camera on first platform
            this.focusCameraOnData(simData);

            // Update message
            const timeRange = simData.getTimeRange();
            const duration = (timeRange.end - timeRange.start) / 1000;
            this.showMessage(`Ready! Duration: ${duration.toFixed(1)}s`);

        } catch (error) {
            this.onError(error);
        }
    }

    /**
     * Handle errors
     * @param {Error} error
     */
    onError(error) {
        console.error('Error:', error);
        this.showMessage(`Error: ${error.message}`, true);
    }

    /**
     * Show message to user
     * @param {string} message
     * @param {boolean} isError
     */
    showMessage(message, isError = false) {
        const statusElement = document.getElementById('status-message');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.style.color = isError ? '#ff4444' : '#00ff00';
        }
    }

    /**
     * Clear previous renderers
     */
    clearRenderers() {
        if (this.platformRenderer) {
            this.platformRenderer.dispose();
            this.platformRenderer = null;
        }

        if (this.sensorRenderer) {
            this.sensorRenderer.dispose();
            this.sensorRenderer = null;
        }
    }

    /**
     * Focus camera on loaded data
     * @param {SimulationData} simData
     */
    focusCameraOnData(simData) {
        // Find first platform with states
        for (const platform of simData.platforms.values()) {
            if (platform.states.length > 0) {
                const firstState = platform.states[0];
                const position = firstState.getPosition();
                this.sceneManager.focusOn(position, 1500);
                return;
            }
        }
    }

    /**
     * Animation callback
     * @param {number} time - Performance timestamp
     */
    onAnimate(time) {
        if (!this.timeline) return;

        // Update timeline
        this.timeline.update(time);

        // Update renderers
        const currentTime = this.timeline.getCurrentTime();

        if (this.platformRenderer) {
            this.platformRenderer.update(currentTime);
        }

        if (this.sensorRenderer) {
            this.sensorRenderer.update(currentTime);
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new VectorSpaceApp();
});
