/**
 * CustomDataPanel.js
 *
 * Displays live-updating custom column values for a selected platform.
 */

export class CustomDataPanel {
    constructor(platform, simData, enabledColumns) {
        this.platform = platform;
        this.simData = simData;
        this.enabledColumns = enabledColumns; // Set<string>
        this.element = null;
        this.valueElements = {};
        this.rowContainer = null;
        this.onPlotToggle = null;
        this.activePlotKeys = new Set();

        this.createPanel();
    }

    createPanel() {
        this.element = document.createElement('div');
        this.element.id = 'custom-data-panel';
        this.element.className = 'panel';

        // Header with close button
        const header = document.createElement('div');
        header.className = 'panel-header';

        const title = document.createElement('h3');
        title.textContent = 'Custom Data';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'close-btn';
        closeBtn.textContent = '\u00D7';
        closeBtn.addEventListener('click', () => this.hide());

        header.appendChild(title);
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        // Row container
        this.rowContainer = document.createElement('div');
        this.element.appendChild(this.rowContainer);

        this.buildRows();

        document.body.appendChild(this.element);
    }

    buildRows() {
        this.rowContainer.innerHTML = '';
        this.valueElements = {};

        for (const name of this.enabledColumns) {
            const row = document.createElement('div');
            row.className = 'details-row';

            const plotKey = `custom:${name}`;
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'plot-checkbox';
            checkbox.title = `Plot ${name}`;
            checkbox.checked = this.activePlotKeys.has(plotKey);
            checkbox.addEventListener('change', () => {
                if (this.onPlotToggle) {
                    this.onPlotToggle(plotKey, 'custom', name, checkbox.checked);
                }
            });

            const label = document.createElement('span');
            label.className = 'details-label';
            label.textContent = name;

            const value = document.createElement('span');
            value.className = 'details-value';
            value.textContent = '--';

            this.valueElements[name] = value;

            row.appendChild(checkbox);
            row.appendChild(label);
            row.appendChild(value);
            this.rowContainer.appendChild(row);
        }
    }

    update(currentTime) {
        const state = this.platform.getStateAtTime(currentTime);
        if (!state) return;

        for (const name of this.enabledColumns) {
            const val = state.customFields[name];
            let display;
            if (val === undefined || val === null) {
                display = '--';
            } else if (typeof val === 'number') {
                display = val.toFixed(2);
            } else {
                display = val;
            }
            if (this.valueElements[name]) {
                this.valueElements[name].textContent = display;
            }
        }
    }

    setEnabledColumns(enabledColumns) {
        this.enabledColumns = enabledColumns;
        this.buildRows();
    }

    show() {
        if (this.element) {
            this.element.style.display = 'block';
        }
    }

    hide() {
        if (this.element) {
            this.element.style.display = 'none';
        }
    }

    isVisible() {
        return this.element && this.element.style.display !== 'none';
    }

    dispose() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.element = null;
        this.valueElements = {};
    }
}
