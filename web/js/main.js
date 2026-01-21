import { CSVParser } from './core/CSVParser.js';
import { TimelineController } from './core/TimelineController.js';
import { SceneManager } from './rendering/SceneManager.js';
import { GridRenderer } from './rendering/GridRenderer.js';
import { PlatformRenderer } from './rendering/PlatformRenderer.js';
import { SensorRenderer } from './rendering/SensorRenderer.js';
import { TrackRenderer } from './rendering/TrackRenderer.js';
import { FileUpload } from './ui/FileUpload.js';
import { TimeControls } from './ui/TimeControls.js';
import { PlatformDetailsPanel } from './ui/PlatformDetailsPanel.js';
import { PlatformListPanel } from './ui/PlatformListPanel.js';

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
        this.trackRenderer = null;

        // Timeline controller (will be created after data load)
        this.timeline = null;
        this.timeControls = null;

        // Platform selection and details panel
        this.selectedPlatformId = null;
        this.platformDetailsPanel = null;
        this.platformListPanel = null;
        this.simData = null;

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

        // Set up click handler for platform selection
        this.sceneManager.onSceneClick((intersects) => this.onSceneClick(intersects));

        // Show initial message
        this.showMessage('Load a CSV file to begin');

        // Add load button handler
        const loadBtn = document.getElementById('load-btn');
        if (loadBtn) {
            loadBtn.addEventListener('click', () => {
                this.fileUpload.selectFile();
            });
        }

        // Add platform list toggle button handler
        const platformListBtn = document.getElementById('platform-list-btn');
        if (platformListBtn) {
            platformListBtn.addEventListener('click', () => {
                if (this.platformListPanel) {
                    this.platformListPanel.toggle();
                }
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

            // Store simulation data
            this.simData = simData;

            // Create renderers
            this.platformRenderer = new PlatformRenderer(this.sceneManager, simData);
            this.sensorRenderer = new SensorRenderer(this.sceneManager, simData);
            this.trackRenderer = new TrackRenderer(
                this.sceneManager,
                simData,
                this.sensorRenderer,
                this.platformRenderer
            );

            // Set up clickable objects for platform selection
            const platformGroups = this.platformRenderer.getAllPlatformGroups();
            this.sceneManager.setClickableObjects(platformGroups);

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

            // Create or update platform list panel
            if (this.platformListPanel) {
                this.platformListPanel.updatePlatformList(simData);
            } else {
                this.platformListPanel = new PlatformListPanel({
                    simData: simData,
                    sceneManager: this.sceneManager,
                    timeline: this.timeline,
                    onPlatformSelect: (id) => {
                        if (id) {
                            this.selectPlatform(id);
                        }
                    }
                });
            }
            this.platformListPanel.show();

            // Enable platform list toggle button
            const platformListBtn = document.getElementById('platform-list-btn');
            if (platformListBtn) {
                platformListBtn.disabled = false;
            }

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

        if (this.trackRenderer) {
            this.trackRenderer.dispose();
            this.trackRenderer = null;
        }

        // Clear platform selection
        if (this.platformDetailsPanel) {
            this.platformDetailsPanel.dispose();
            this.platformDetailsPanel = null;
        }
        this.selectedPlatformId = null;

        // Clear platform list panel
        if (this.platformListPanel) {
            this.platformListPanel.dispose();
            this.platformListPanel = null;
        }

        this.simData = null;
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

        if (this.trackRenderer) {
            this.trackRenderer.update(currentTime);
        }

        // Update platform details panel
        if (this.platformDetailsPanel && this.platformDetailsPanel.isVisible()) {
            this.platformDetailsPanel.update(currentTime);
        }
    }

    /**
     * Handle scene click for platform selection
     * @param {Array} intersects - Array of raycaster intersections
     */
    onSceneClick(intersects) {
        if (!this.simData) return;

        // Find platformId by traversing up the parent chain
        let platformId = null;

        for (const intersect of intersects) {
            let object = intersect.object;

            // Traverse up to find platformId in userData
            while (object) {
                if (object.userData && object.userData.platformId) {
                    platformId = object.userData.platformId;
                    break;
                }
                object = object.parent;
            }

            if (platformId) break;
        }

        if (platformId) {
            // Platform clicked - show/update panel
            this.selectPlatform(platformId);
        } else {
            // Empty space clicked - hide panel
            this.deselectPlatform();
        }
    }

    /**
     * Select a platform and show details panel
     * @param {string} platformId
     */
    selectPlatform(platformId) {
        // Skip if same platform already selected
        if (this.selectedPlatformId === platformId && this.platformDetailsPanel) {
            return;
        }

        // Dispose existing panel
        if (this.platformDetailsPanel) {
            this.platformDetailsPanel.dispose();
        }

        // Get platform
        const platform = this.simData.getPlatform(platformId);
        if (!platform) return;

        // Create new panel
        this.selectedPlatformId = platformId;
        this.platformDetailsPanel = new PlatformDetailsPanel(platform, this.simData);

        // Update immediately with current time
        if (this.timeline) {
            this.platformDetailsPanel.update(this.timeline.getCurrentTime());
        }
    }

    /**
     * Deselect platform and hide details panel
     */
    deselectPlatform() {
        if (this.platformDetailsPanel) {
            this.platformDetailsPanel.hide();
        }
        this.selectedPlatformId = null;
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new VectorSpaceApp();
});
