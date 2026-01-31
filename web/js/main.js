import { CSVParser } from './core/CSVParser.js';
import { SimulationMerger } from './core/SimulationMerger.js';
import { TimelineController } from './core/TimelineController.js';
import { SceneManager } from './rendering/SceneManager.js';
import { GridRenderer } from './rendering/GridRenderer.js';
import { PlatformRenderer } from './rendering/PlatformRenderer.js';
import { SensorRenderer } from './rendering/SensorRenderer.js';
import { TrackRenderer } from './rendering/TrackRenderer.js';
import { TrajectoryRibbonRenderer } from './rendering/TrajectoryRibbonRenderer.js';
import { FileUpload } from './ui/FileUpload.js';
import { TimeControls } from './ui/TimeControls.js';
import { PlatformDetailsPanel } from './ui/PlatformDetailsPanel.js';
import { PlatformListPanel } from './ui/PlatformListPanel.js';
import { CustomDataPanel } from './ui/CustomDataPanel.js';

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
        this.trajectoryRibbonRenderer = null;

        // Timeline controller (will be created after data load)
        this.timeline = null;
        this.timeControls = null;

        // Platform selection and details panel
        this.selectedPlatformId = null;
        this.platformDetailsPanel = null;
        this.platformListPanel = null;
        this.simData = null;

        // Custom data panel
        this.customDataPanel = null;
        this.enabledCustomColumns = new Set();

        // Camera follow mode
        this.followedPlatformId = null;

        // Platform scale slider
        this.platformScaleSlider = null;
        this.platformScaleDisplay = null;

        // Double-click detection
        this.clickTimeout = null;
        this.lastClickedPlatformId = null;
        this.doubleClickDelay = 300; // ms

        // File upload handler
        this.fileUpload = new FileUpload(
            document.getElementById('file-input'),
            (files) => this.onFilesLoaded(files),
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

        // Initialize platform scale slider
        this.platformScaleSlider = document.getElementById('platform-scale-slider');
        this.platformScaleDisplay = document.getElementById('platform-scale-display');
        this.platformScaleSlider.addEventListener('input', () => {
            const scale = parseFloat(this.platformScaleSlider.value);
            if (this.platformRenderer) {
                this.platformRenderer.setScale(scale);
            }
            this.platformScaleDisplay.textContent = `${scale.toFixed(1)}x`;
        });
    }

    /**
     * Handle multiple CSV files loaded
     * @param {Array<{text: string, name: string}>} files - Array of file contents and names
     */
    onFilesLoaded(files) {
        try {
            const fileNames = files.map(f => f.name).join(', ');
            this.showMessage(`Parsing ${fileNames}...`);

            // Parse each CSV independently
            const entries = files.map(({ text, name }) => ({
                simData: CSVParser.parse(text),
                fileName: name
            }));

            // Merge all parsed results
            const simData = SimulationMerger.merge(entries);

            // Validate data
            if (simData.platforms.size === 0) {
                throw new Error('No platforms found in CSV');
            }

            this.showMessage(`Loaded ${simData.platforms.size} platforms, ${simData.sensors.size} sensors from ${files.length} file(s)`);

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

            // Create trajectory ribbon renderer
            this.trajectoryRibbonRenderer = new TrajectoryRibbonRenderer(this.sceneManager, simData);

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
                        this.followedPlatformId = id;
                        if (id) {
                            this.selectPlatform(id);
                        }
                    },
                    onFovToggle: (platformId, enabled) => {
                        if (this.sensorRenderer) {
                            this.sensorRenderer.setPlatformSensorVisibility(platformId, enabled);
                        }
                    },
                    onRibbonToggle: (platformId, enabled) => {
                        if (this.trajectoryRibbonRenderer) {
                            this.trajectoryRibbonRenderer.setRibbonVisibility(platformId, enabled);
                        }
                    },
                    onFullTrailToggle: (platformId, enabled) => {
                        if (this.trajectoryRibbonRenderer) {
                            this.trajectoryRibbonRenderer.setFullTrailMode(platformId, enabled);
                        }
                    }
                });
            }
            this.platformListPanel.show();

            // Set up custom columns panel in left sidebar
            this.setupCustomColumnsPanel(simData);

            // Enable platform list toggle button
            const platformListBtn = document.getElementById('platform-list-btn');
            if (platformListBtn) {
                platformListBtn.disabled = false;
            }

            // Enable platform scale slider
            this.platformScaleSlider.disabled = false;

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

        if (this.trajectoryRibbonRenderer) {
            this.trajectoryRibbonRenderer.dispose();
            this.trajectoryRibbonRenderer = null;
        }

        // Clear platform selection
        if (this.platformDetailsPanel) {
            this.platformDetailsPanel.dispose();
            this.platformDetailsPanel = null;
        }
        if (this.customDataPanel) {
            this.customDataPanel.dispose();
            this.customDataPanel = null;
        }
        this.enabledCustomColumns = new Set();
        const customColumnsPanel = document.getElementById('custom-columns-panel');
        if (customColumnsPanel) {
            customColumnsPanel.style.display = 'none';
        }
        this.selectedPlatformId = null;
        this.followedPlatformId = null;

        // Clear platform list panel
        if (this.platformListPanel) {
            this.platformListPanel.dispose();
            this.platformListPanel = null;
        }

        // Reset platform scale slider
        this.platformScaleSlider.value = 1;
        this.platformScaleSlider.disabled = true;
        this.platformScaleDisplay.textContent = '1.0x';

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

        if (this.trajectoryRibbonRenderer) {
            this.trajectoryRibbonRenderer.update(currentTime);
        }

        // Update camera to follow selected platform
        if (this.followedPlatformId && this.simData) {
            const platform = this.simData.getPlatform(this.followedPlatformId);
            if (platform) {
                const state = platform.getStateAtTime(currentTime);
                if (state) {
                    const position = state.getPosition();
                    this.sceneManager.controls.target.copy(position);
                }
            }
        }

        // Update platform details panel
        if (this.platformDetailsPanel && this.platformDetailsPanel.isVisible()) {
            this.platformDetailsPanel.update(currentTime);
        }

        // Update custom data panel
        if (this.customDataPanel && this.customDataPanel.isVisible()) {
            this.customDataPanel.update(currentTime);
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
            // Check for double-click on same platform
            if (this.clickTimeout && this.lastClickedPlatformId === platformId) {
                // Double-click detected - center camera on platform
                clearTimeout(this.clickTimeout);
                this.clickTimeout = null;
                this.lastClickedPlatformId = null;
                this.focusOnPlatform(platformId);
            } else {
                // First click - start timer for potential double-click
                if (this.clickTimeout) {
                    clearTimeout(this.clickTimeout);
                }
                this.lastClickedPlatformId = platformId;
                this.clickTimeout = setTimeout(() => {
                    // Single click - show details panel
                    this.selectPlatform(platformId);
                    this.clickTimeout = null;
                    this.lastClickedPlatformId = null;
                }, this.doubleClickDelay);
            }
        } else {
            // Empty space clicked - clear any pending click and hide panel
            if (this.clickTimeout) {
                clearTimeout(this.clickTimeout);
                this.clickTimeout = null;
                this.lastClickedPlatformId = null;
            }
            this.deselectPlatform();
        }
    }

    /**
     * Focus camera on a platform's current position
     * @param {string} platformId
     */
    focusOnPlatform(platformId) {
        const platform = this.simData.getPlatform(platformId);
        if (!platform) return;

        const currentTime = this.timeline ? this.timeline.getCurrentTime() : null;
        const state = platform.getStateAtTime(currentTime);
        if (!state) return;

        const position = state.getPosition();
        this.sceneManager.focusOn(position, 1500);
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

        // Create/update custom data panel if columns are enabled
        this.updateCustomDataPanel(platform);
    }

    /**
     * Deselect platform and hide details panel
     */
    deselectPlatform() {
        if (this.platformDetailsPanel) {
            this.platformDetailsPanel.hide();
        }
        if (this.customDataPanel) {
            this.customDataPanel.hide();
        }
        this.selectedPlatformId = null;
    }

    /**
     * Populate the custom columns checkbox panel in the left sidebar
     * @param {SimulationData} simData
     */
    setupCustomColumnsPanel(simData) {
        const panel = document.getElementById('custom-columns-panel');
        const list = document.getElementById('custom-columns-list');
        if (!panel || !list) return;

        list.innerHTML = '';
        this.enabledCustomColumns = new Set();

        if (simData.customColumnNames.length === 0) {
            panel.style.display = 'none';
            return;
        }

        for (const name of simData.customColumnNames) {
            const row = document.createElement('label');
            row.className = 'custom-column-row';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'custom-column-checkbox';
            checkbox.dataset.columnName = name;
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    this.enabledCustomColumns.add(name);
                } else {
                    this.enabledCustomColumns.delete(name);
                }
                this.onCustomColumnsChanged();
            });

            const label = document.createElement('span');
            label.textContent = name;

            row.appendChild(checkbox);
            row.appendChild(label);
            list.appendChild(row);
        }

        panel.style.display = 'block';
    }

    /**
     * Handle custom column selection changes
     */
    onCustomColumnsChanged() {
        if (this.enabledCustomColumns.size === 0) {
            // No columns enabled — dispose panel
            if (this.customDataPanel) {
                this.customDataPanel.dispose();
                this.customDataPanel = null;
            }
            return;
        }

        if (!this.selectedPlatformId || !this.simData) {
            return;
        }

        const platform = this.simData.getPlatform(this.selectedPlatformId);
        if (!platform) return;

        this.updateCustomDataPanel(platform);
    }

    /**
     * Create or update the custom data panel for a platform
     * @param {Platform} platform
     */
    updateCustomDataPanel(platform) {
        if (this.enabledCustomColumns.size === 0) {
            if (this.customDataPanel) {
                this.customDataPanel.dispose();
                this.customDataPanel = null;
            }
            return;
        }

        if (this.customDataPanel) {
            // Update existing panel with new platform or columns
            this.customDataPanel.platform = platform;
            this.customDataPanel.setEnabledColumns(this.enabledCustomColumns);
        } else {
            this.customDataPanel = new CustomDataPanel(
                platform,
                this.simData,
                this.enabledCustomColumns
            );
        }

        this.customDataPanel.show();
        if (this.timeline) {
            this.customDataPanel.update(this.timeline.getCurrentTime());
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new VectorSpaceApp();
});
