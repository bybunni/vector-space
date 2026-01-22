import * as THREE from 'three';

/**
 * PlatformListPanel.js
 *
 * Displays a list of all platforms with clickable items to focus the camera.
 */

export class PlatformListPanel {
    constructor({ simData, sceneManager, timeline, onPlatformSelect, onFovToggle, onRibbonToggle }) {
        this.simData = simData;
        this.sceneManager = sceneManager;
        this.timeline = timeline;
        this.onPlatformSelect = onPlatformSelect;
        this.onFovToggle = onFovToggle;
        this.onRibbonToggle = onRibbonToggle;
        this.element = null;
        this.listContainer = null;
        this.selectedId = null;           // Currently followed platform ID
        this.itemElements = new Map();    // Map of platform ID -> DOM element
        this.originElement = null;        // Origin item DOM element
        this.fovStates = new Map();       // platformId -> boolean (default true)
        this.ribbonStates = new Map();    // platformId -> boolean (default false)

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

        // Add column headers
        this.addColumnHeaders();

        // Add origin item
        this.addOriginItem();

        // Populate platform list
        this.populatePlatformList();

        // Add to document
        document.body.appendChild(this.element);
    }

    /**
     * Add column headers for checkboxes
     */
    addColumnHeaders() {
        const headerRow = document.createElement('div');
        headerRow.className = 'platform-list-header';

        const nameLabel = document.createElement('span');
        nameLabel.className = 'platform-header-name';
        nameLabel.textContent = 'Platform';

        const checkboxLabels = document.createElement('div');
        checkboxLabels.className = 'platform-header-checkboxes';

        const fovLabel = document.createElement('span');
        fovLabel.className = 'platform-header-label';
        fovLabel.textContent = 'FOV';
        fovLabel.title = 'Show sensor FOV';

        const ribbonLabel = document.createElement('span');
        ribbonLabel.className = 'platform-header-label';
        ribbonLabel.textContent = 'Trail';
        ribbonLabel.title = 'Show trajectory ribbon';

        checkboxLabels.appendChild(fovLabel);
        checkboxLabels.appendChild(ribbonLabel);
        headerRow.appendChild(nameLabel);
        headerRow.appendChild(checkboxLabels);

        this.listContainer.appendChild(headerRow);
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
        this.originElement = item;
    }

    /**
     * Populate list with all platforms from simData
     */
    populatePlatformList() {
        if (!this.simData || !this.simData.platforms) return;

        for (const [id, platform] of this.simData.platforms) {
            const item = document.createElement('div');
            item.className = 'platform-list-item';

            // Platform name (clickable)
            const nameSpan = document.createElement('span');
            nameSpan.className = 'platform-name';
            nameSpan.textContent = id;

            // Checkbox container
            const checkboxContainer = document.createElement('div');
            checkboxContainer.className = 'platform-checkboxes';

            // FOV checkbox (default checked)
            const fovCheckbox = document.createElement('input');
            fovCheckbox.type = 'checkbox';
            fovCheckbox.className = 'platform-fov-checkbox';
            fovCheckbox.checked = true;
            fovCheckbox.title = 'Show sensor FOV';
            fovCheckbox.addEventListener('click', (e) => e.stopPropagation());
            fovCheckbox.addEventListener('change', (e) => {
                this.fovStates.set(id, e.target.checked);
                if (this.onFovToggle) this.onFovToggle(id, e.target.checked);
            });
            this.fovStates.set(id, true);

            // Ribbon checkbox (default unchecked)
            const ribbonCheckbox = document.createElement('input');
            ribbonCheckbox.type = 'checkbox';
            ribbonCheckbox.className = 'platform-ribbon-checkbox';
            ribbonCheckbox.checked = false;
            ribbonCheckbox.title = 'Show trajectory ribbon';
            ribbonCheckbox.addEventListener('click', (e) => e.stopPropagation());
            ribbonCheckbox.addEventListener('change', (e) => {
                this.ribbonStates.set(id, e.target.checked);
                if (this.onRibbonToggle) this.onRibbonToggle(id, e.target.checked);
            });
            this.ribbonStates.set(id, false);

            // Assemble: name | checkboxes
            checkboxContainer.appendChild(fovCheckbox);
            checkboxContainer.appendChild(ribbonCheckbox);
            item.appendChild(nameSpan);
            item.appendChild(checkboxContainer);

            item.addEventListener('click', () => this.focusOnPlatform(id));
            this.listContainer.appendChild(item);
            this.itemElements.set(id, item);
        }
    }

    /**
     * Focus camera on origin (0, 0, 0) and clear selection
     */
    focusOnOrigin() {
        const origin = new THREE.Vector3(0, 0, 0);
        this.sceneManager.focusOn(origin, 1500);

        // Clear selection
        this.setSelected(null);

        if (this.onPlatformSelect) {
            this.onPlatformSelect(null);
        }
    }

    /**
     * Select a platform to follow with the camera
     * @param {string} id - Platform ID
     */
    focusOnPlatform(id) {
        const platform = this.simData.getPlatform(id);
        if (!platform) return;

        // Set selection (camera following will be handled in main.js onAnimate)
        this.setSelected(id);

        if (this.onPlatformSelect) {
            this.onPlatformSelect(id);
        }
    }

    /**
     * Set the selected platform and update visual highlighting
     * @param {string|null} id - Platform ID or null to clear selection
     */
    setSelected(id) {
        // Remove highlight from previous selection
        if (this.selectedId && this.itemElements.has(this.selectedId)) {
            this.itemElements.get(this.selectedId).classList.remove('selected');
        }

        this.selectedId = id;

        // Add highlight to new selection
        if (id && this.itemElements.has(id)) {
            this.itemElements.get(id).classList.add('selected');
        }
    }

    /**
     * Get the currently selected platform ID
     * @returns {string|null}
     */
    getSelectedId() {
        return this.selectedId;
    }

    /**
     * Update platform list when new CSV is loaded
     * @param {SimulationData} newSimData
     */
    updatePlatformList(newSimData) {
        this.simData = newSimData;

        // Save current selection to restore if platform still exists
        const previousSelectedId = this.selectedId;

        // Clear existing list and element references
        this.listContainer.innerHTML = '';
        this.itemElements.clear();
        this.originElement = null;
        this.selectedId = null;

        // Clear state maps on reload
        this.fovStates.clear();
        this.ribbonStates.clear();

        // Re-add column headers, origin and platforms
        this.addColumnHeaders();
        this.addOriginItem();
        this.populatePlatformList();

        // Restore selection if the same platform ID exists
        if (previousSelectedId && this.itemElements.has(previousSelectedId)) {
            this.setSelected(previousSelectedId);
        }
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
        this.itemElements.clear();
        this.fovStates.clear();
        this.ribbonStates.clear();
        this.originElement = null;
        this.selectedId = null;
    }
}
