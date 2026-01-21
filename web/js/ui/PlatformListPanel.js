import * as THREE from 'three';

/**
 * PlatformListPanel.js
 *
 * Displays a list of all platforms with clickable items to focus the camera.
 */

export class PlatformListPanel {
    constructor({ simData, sceneManager, timeline, onPlatformSelect }) {
        this.simData = simData;
        this.sceneManager = sceneManager;
        this.timeline = timeline;
        this.onPlatformSelect = onPlatformSelect;
        this.element = null;
        this.listContainer = null;

        this.createPanel();
    }

    /**
     * Create the panel DOM structure
     */
    createPanel() {
        // Create container
        this.element = document.createElement('div');
        this.element.id = 'platform-list-panel';
        this.element.className = 'panel';

        // Header with close button
        const header = document.createElement('div');
        header.className = 'panel-header';

        const title = document.createElement('h3');
        title.textContent = 'Platforms';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'close-btn';
        closeBtn.textContent = '\u00D7';
        closeBtn.addEventListener('click', () => this.hide());

        header.appendChild(title);
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        // List container
        this.listContainer = document.createElement('div');
        this.listContainer.className = 'platform-list-container';
        this.element.appendChild(this.listContainer);

        // Add origin item
        this.addOriginItem();

        // Populate platform list
        this.populatePlatformList();

        // Add to document
        document.body.appendChild(this.element);
    }

    /**
     * Add "Origin" as first clickable item
     */
    addOriginItem() {
        const item = document.createElement('div');
        item.className = 'platform-list-item origin-item';
        item.textContent = 'Origin';
        item.addEventListener('click', () => this.focusOnOrigin());
        this.listContainer.appendChild(item);
    }

    /**
     * Populate list with all platforms from simData
     */
    populatePlatformList() {
        if (!this.simData || !this.simData.platforms) return;

        for (const [id, platform] of this.simData.platforms) {
            const item = document.createElement('div');
            item.className = 'platform-list-item';
            item.textContent = id;
            item.addEventListener('click', () => this.focusOnPlatform(id));
            this.listContainer.appendChild(item);
        }
    }

    /**
     * Focus camera on origin (0, 0, 0)
     */
    focusOnOrigin() {
        const origin = new THREE.Vector3(0, 0, 0);
        this.sceneManager.focusOn(origin, 1500);

        if (this.onPlatformSelect) {
            this.onPlatformSelect(null);
        }
    }

    /**
     * Focus camera on a platform's current position
     * @param {string} id - Platform ID
     */
    focusOnPlatform(id) {
        const platform = this.simData.getPlatform(id);
        if (!platform) return;

        // Get current time from timeline
        const currentTime = this.timeline ? this.timeline.getCurrentTime() : null;

        // Get platform state at current time
        const state = platform.getStateAtTime(currentTime);
        if (!state) return;

        // Get position and focus camera
        const position = state.getPosition();
        this.sceneManager.focusOn(position, 1500);

        if (this.onPlatformSelect) {
            this.onPlatformSelect(id);
        }
    }

    /**
     * Update platform list when new CSV is loaded
     * @param {SimulationData} newSimData
     */
    updatePlatformList(newSimData) {
        this.simData = newSimData;

        // Clear existing list
        this.listContainer.innerHTML = '';

        // Re-add origin and platforms
        this.addOriginItem();
        this.populatePlatformList();
    }

    /**
     * Show the panel
     */
    show() {
        if (this.element) {
            this.element.style.display = 'block';
        }
    }

    /**
     * Hide the panel
     */
    hide() {
        if (this.element) {
            this.element.style.display = 'none';
        }
    }

    /**
     * Toggle panel visibility
     */
    toggle() {
        if (this.isVisible()) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Check if panel is visible
     * @returns {boolean}
     */
    isVisible() {
        return this.element && this.element.style.display !== 'none';
    }

    /**
     * Remove panel from DOM
     */
    dispose() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.element = null;
        this.listContainer = null;
    }
}
