import { CoordinateSystem } from '../core/CoordinateSystem.js';

/**
 * PlatformDetailsPanel.js
 *
 * Displays live-updating telemetry data for a selected platform.
 */

export class PlatformDetailsPanel {
    constructor(platform, simData) {
        this.platform = platform;
        this.simData = simData;
        this.element = null;
        this.valueElements = {};
        this.onPlotToggle = null;
        this.checkboxElements = {};

        this.createPanel();
    }

    /**
     * Create the panel DOM structure
     */
    createPanel() {
        // Create container
        this.element = document.createElement('div');
        this.element.id = 'platform-details-panel';
        this.element.className = 'panel';

        // Header with close button
        const header = document.createElement('div');
        header.className = 'panel-header';

        const title = document.createElement('h3');
        title.textContent = 'Platform Details';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'close-btn';
        closeBtn.textContent = '\u00D7';
        closeBtn.addEventListener('click', () => this.hide());

        header.appendChild(title);
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        // Platform ID
        const idRow = this.createRow('ID', this.platform.entityId, 'platform-id');
        this.element.appendChild(idRow);

        // Position section
        const posSection = this.createSection('NED Position (m)');
        posSection.appendChild(this.createDataRow('North', '0.0', 'pos-north'));
        posSection.appendChild(this.createDataRow('East', '0.0', 'pos-east'));
        posSection.appendChild(this.createDataRow('Down', '0.0', 'pos-down'));
        posSection.appendChild(this.createDataRow('Altitude', '0.0', 'altitude', true));
        this.element.appendChild(posSection);

        // Orientation section
        const oriSection = this.createSection('Euler Angles (deg)');
        oriSection.appendChild(this.createDataRow('Roll', '0.0', 'roll'));
        oriSection.appendChild(this.createDataRow('Pitch', '0.0', 'pitch'));
        oriSection.appendChild(this.createDataRow('Yaw', '0.0', 'yaw'));
        this.element.appendChild(oriSection);

        // Velocity section
        const velSection = this.createSection('Velocity (m/s)');
        velSection.appendChild(this.createDataRow('V-North', '0.0', 'vel-north'));
        velSection.appendChild(this.createDataRow('V-East', '0.0', 'vel-east'));
        velSection.appendChild(this.createDataRow('V-Down', '0.0', 'vel-down'));
        velSection.appendChild(this.createDataRow('Speed', '0.0', 'speed', true));
        this.element.appendChild(velSection);

        // Add to document
        document.body.appendChild(this.element);
    }

    /**
     * Create a section header
     * @param {string} title
     * @returns {HTMLElement}
     */
    createSection(title) {
        const section = document.createElement('div');
        section.className = 'details-section';

        const header = document.createElement('div');
        header.className = 'section-header';
        header.textContent = title;
        section.appendChild(header);

        return section;
    }

    /**
     * Create a simple row
     * @param {string} label
     * @param {string} value
     * @param {string} key
     * @returns {HTMLElement}
     */
    createRow(label, value, key) {
        const row = document.createElement('div');
        row.className = 'details-row';

        const labelEl = document.createElement('span');
        labelEl.className = 'details-label';
        labelEl.textContent = label;

        const valueEl = document.createElement('span');
        valueEl.className = 'details-value';
        valueEl.textContent = value;

        this.valueElements[key] = valueEl;

        row.appendChild(labelEl);
        row.appendChild(valueEl);

        return row;
    }

    /**
     * Create a data row with value element
     * @param {string} label
     * @param {string} value
     * @param {string} key
     * @param {boolean} highlight
     * @returns {HTMLElement}
     */
    createDataRow(label, value, key, highlight = false) {
        const row = document.createElement('div');
        row.className = 'details-row' + (highlight ? ' highlight' : '');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'plot-checkbox';
        checkbox.title = `Plot ${label}`;
        checkbox.addEventListener('change', () => {
            const plotKey = `standard:${key}`;
            if (this.onPlotToggle) {
                this.onPlotToggle(plotKey, 'standard', key, checkbox.checked);
            }
        });
        this.checkboxElements[key] = checkbox;

        const labelEl = document.createElement('span');
        labelEl.className = 'details-label';
        labelEl.textContent = label;

        const valueEl = document.createElement('span');
        valueEl.className = 'details-value';
        valueEl.textContent = value;

        this.valueElements[key] = valueEl;

        row.appendChild(checkbox);
        row.appendChild(labelEl);
        row.appendChild(valueEl);

        return row;
    }

    /**
     * Set checkbox state for a given key
     * @param {string} key
     * @param {boolean} checked
     */
    setCheckboxState(key, checked) {
        if (this.checkboxElements[key]) {
            this.checkboxElements[key].checked = checked;
        }
    }

    /**
     * Update panel with current time data
     * @param {number} currentTime - Unix epoch milliseconds
     */
    update(currentTime) {
        const state = this.platform.getStateAtTime(currentTime);
        if (!state) return;

        // Position
        this.setValue('pos-north', state.posNorth.toFixed(1));
        this.setValue('pos-east', state.posEast.toFixed(1));
        this.setValue('pos-down', state.posDown.toFixed(1));

        // Altitude is -Down (positive up)
        const altitude = -state.posDown;
        this.setValue('altitude', altitude.toFixed(1));

        // Euler angles - extract from quaternion for interpolated states
        let roll, pitch, yaw;
        if (state.roll !== 0 || state.pitch !== 0 || state.yaw !== 0) {
            // Use stored values if available
            roll = state.roll;
            pitch = state.pitch;
            yaw = state.yaw;
        } else {
            // Extract from quaternion (for interpolated states)
            const quaternion = state.getQuaternion();
            const euler = CoordinateSystem.quaternionToNedEuler(quaternion);
            roll = euler.roll;
            pitch = euler.pitch;
            yaw = euler.yaw;
        }

        this.setValue('roll', roll.toFixed(1));
        this.setValue('pitch', pitch.toFixed(1));
        this.setValue('yaw', yaw.toFixed(1));

        // Velocity
        this.setValue('vel-north', state.velNorth.toFixed(1));
        this.setValue('vel-east', state.velEast.toFixed(1));
        this.setValue('vel-down', state.velDown.toFixed(1));

        // Speed (magnitude)
        const speed = Math.sqrt(
            state.velNorth * state.velNorth +
            state.velEast * state.velEast +
            state.velDown * state.velDown
        );
        this.setValue('speed', speed.toFixed(1));
    }

    /**
     * Set value in panel
     * @param {string} key
     * @param {string} value
     */
    setValue(key, value) {
        if (this.valueElements[key]) {
            this.valueElements[key].textContent = value;
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
        this.valueElements = {};
    }
}
