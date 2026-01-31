/**
 * LinePlotPanel.js
 *
 * Manages a fixed-position panel with stacked canvas mini-plots.
 * Each plot shows one value over time for all platforms with colored lines
 * and a vertical time cursor that moves during playback.
 */

const PLOT_COLORS = [
    '#00d4ff', '#ff6b6b', '#51cf66', '#fcc419', '#cc5de8',
    '#ff922b', '#20c997', '#e64980', '#74c0fc', '#a9e34b'
];

const STANDARD_FIELD_MAP = {
    'pos-north': (s) => s.posNorth,
    'pos-east':  (s) => s.posEast,
    'pos-down':  (s) => s.posDown,
    'altitude':  (s) => -s.posDown,
    'roll':      (s) => s.roll,
    'pitch':     (s) => s.pitch,
    'yaw':       (s) => s.yaw,
    'vel-north': (s) => s.velNorth,
    'vel-east':  (s) => s.velEast,
    'vel-down':  (s) => s.velDown,
    'speed':     (s) => Math.sqrt(s.velNorth ** 2 + s.velEast ** 2 + s.velDown ** 2),
};

const CANVAS_WIDTH = 280;
const CANVAS_HEIGHT = 100;

export class LinePlotPanel {
    constructor(simData) {
        this.simData = simData;
        this.activePlots = new Map(); // plotKey -> {canvas, ctx, cachedData, label}
        this.platformColors = new Map();
        this.selectedPlatformId = null;
        this.element = null;
        this.plotContainer = null;
        this.legendStrip = null;

        this.assignPlatformColors();
        this.createPanel();
    }

    assignPlatformColors() {
        let i = 0;
        for (const id of this.simData.platforms.keys()) {
            this.platformColors.set(id, PLOT_COLORS[i % PLOT_COLORS.length]);
            i++;
        }
    }

    createPanel() {
        this.element = document.createElement('div');
        this.element.id = 'line-plot-panel';
        this.element.className = 'panel';

        // Header
        const header = document.createElement('div');
        header.className = 'panel-header';

        const title = document.createElement('h3');
        title.textContent = 'Line Plots';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'close-btn';
        closeBtn.textContent = '\u00D7';
        closeBtn.addEventListener('click', () => this.hide());

        header.appendChild(title);
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        // Legend strip
        this.legendStrip = document.createElement('div');
        this.legendStrip.className = 'plot-legend';
        this.buildLegend();
        this.element.appendChild(this.legendStrip);

        // Scrollable plot container
        this.plotContainer = document.createElement('div');
        this.plotContainer.className = 'plot-container';
        this.element.appendChild(this.plotContainer);

        document.body.appendChild(this.element);
        this.element.style.display = 'none';
    }

    buildLegend() {
        this.legendStrip.innerHTML = '';
        for (const [id, color] of this.platformColors) {
            const item = document.createElement('div');
            item.className = 'plot-legend-item';

            const swatch = document.createElement('span');
            swatch.className = 'plot-legend-swatch';
            swatch.style.background = color;

            const name = document.createElement('span');
            name.className = 'plot-legend-name';
            name.textContent = id;

            item.appendChild(swatch);
            item.appendChild(name);
            this.legendStrip.appendChild(item);
        }
    }

    /**
     * Pre-compute plot data for all platforms for a given field.
     * @param {string} fieldType - 'standard' or 'custom'
     * @param {string} fieldName - field key
     * @returns {Map<string, Array<{t: number, v: number}>>}
     */
    precomputePlotData(fieldType, fieldName) {
        const result = new Map();
        const accessor = fieldType === 'standard'
            ? STANDARD_FIELD_MAP[fieldName]
            : (s) => s.customFields[fieldName];

        if (!accessor) return result;

        for (const [id, platform] of this.simData.platforms) {
            const points = [];
            for (const state of platform.states) {
                const v = accessor(state);
                if (typeof v === 'number' && isFinite(v)) {
                    points.push({ t: state.timestamp, v });
                }
            }
            if (points.length > 0) {
                result.set(id, points);
            }
        }
        return result;
    }

    /**
     * Add a plot for a given field.
     * @param {string} plotKey - unique key (e.g. 'standard:altitude' or 'custom:sensor_range')
     * @param {string} fieldType - 'standard' or 'custom'
     * @param {string} fieldName - field key
     */
    addPlot(plotKey, fieldType, fieldName) {
        if (this.activePlots.has(plotKey)) return;

        const cachedData = this.precomputePlotData(fieldType, fieldName);

        // Compute label
        const label = fieldName;

        // Create canvas wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'plot-canvas-wrapper';
        wrapper.dataset.plotKey = plotKey;

        const canvas = document.createElement('canvas');
        canvas.width = CANVAS_WIDTH;
        canvas.height = CANVAS_HEIGHT;
        const ctx = canvas.getContext('2d');

        wrapper.appendChild(canvas);
        this.plotContainer.appendChild(wrapper);

        this.activePlots.set(plotKey, { canvas, ctx, cachedData, label, wrapper });

        this.show();
        this.drawPlot(plotKey);
    }

    /**
     * Remove a plot.
     * @param {string} plotKey
     */
    removePlot(plotKey) {
        const plot = this.activePlots.get(plotKey);
        if (!plot) return;

        plot.wrapper.remove();
        this.activePlots.delete(plotKey);

        if (this.activePlots.size === 0) {
            this.hide();
        }
    }

    /**
     * Draw a single plot (lines + optional time cursor).
     * @param {string} plotKey
     * @param {number} [currentTime] - optional time cursor position
     */
    drawPlot(plotKey, currentTime) {
        const plot = this.activePlots.get(plotKey);
        if (!plot) return;

        const { ctx, cachedData, label } = plot;
        const w = CANVAS_WIDTH;
        const h = CANVAS_HEIGHT;
        const pad = { top: 16, right: 8, bottom: 16, left: 40 };
        const plotW = w - pad.left - pad.right;
        const plotH = h - pad.top - pad.bottom;

        // Clear
        ctx.fillStyle = 'rgba(10, 10, 20, 0.95)';
        ctx.fillRect(0, 0, w, h);

        // No data check
        if (cachedData.size === 0) {
            ctx.fillStyle = '#888';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No numeric data', w / 2, h / 2);
            return;
        }

        // Compute global time and value ranges
        const timeRange = this.simData.getTimeRange();
        let tMin = timeRange.start;
        let tMax = timeRange.end;
        if (tMin === tMax) tMax = tMin + 1;

        let vMin = Infinity, vMax = -Infinity;
        for (const points of cachedData.values()) {
            for (const p of points) {
                if (p.v < vMin) vMin = p.v;
                if (p.v > vMax) vMax = p.v;
            }
        }
        // Add padding to value range
        const vRange = vMax - vMin || 1;
        vMin -= vRange * 0.05;
        vMax += vRange * 0.05;

        // Map functions
        const mapX = (t) => pad.left + ((t - tMin) / (tMax - tMin)) * plotW;
        const mapY = (v) => pad.top + (1 - (v - vMin) / (vMax - vMin)) * plotH;

        // Grid lines
        ctx.strokeStyle = 'rgba(100, 100, 150, 0.2)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= 4; i++) {
            const y = pad.top + (i / 4) * plotH;
            ctx.beginPath();
            ctx.moveTo(pad.left, y);
            ctx.lineTo(w - pad.right, y);
            ctx.stroke();
        }

        // Y-axis labels
        ctx.fillStyle = '#666';
        ctx.font = '9px monospace';
        ctx.textAlign = 'right';
        for (let i = 0; i <= 4; i += 2) {
            const v = vMax - (i / 4) * (vMax - vMin);
            const y = pad.top + (i / 4) * plotH;
            ctx.fillText(this.formatValue(v), pad.left - 3, y + 3);
        }

        // Draw polylines for each platform
        for (const [id, points] of cachedData) {
            const color = this.platformColors.get(id) || '#888';
            const isSelected = id === this.selectedPlatformId;

            ctx.strokeStyle = color;
            ctx.globalAlpha = isSelected ? 1.0 : 0.5;
            ctx.lineWidth = isSelected ? 2 : 1;

            ctx.beginPath();
            for (let i = 0; i < points.length; i++) {
                const x = mapX(points[i].t);
                const y = mapY(points[i].v);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        // Draw selected platform last (on top)
        if (this.selectedPlatformId && cachedData.has(this.selectedPlatformId)) {
            const points = cachedData.get(this.selectedPlatformId);
            const color = this.platformColors.get(this.selectedPlatformId) || '#888';
            ctx.strokeStyle = color;
            ctx.globalAlpha = 1.0;
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i < points.length; i++) {
                const x = mapX(points[i].t);
                const y = mapY(points[i].v);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        ctx.globalAlpha = 1.0;

        // Field label
        ctx.fillStyle = '#aaa';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(label, pad.left + 4, pad.top + 10);

        // Time cursor
        if (currentTime !== undefined) {
            const cx = mapX(currentTime);
            if (cx >= pad.left && cx <= w - pad.right) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(cx, pad.top);
                ctx.lineTo(cx, pad.top + plotH);
                ctx.stroke();
            }
        }

        // Border
        ctx.strokeStyle = 'rgba(100, 100, 150, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(pad.left, pad.top, plotW, plotH);
    }

    formatValue(v) {
        const abs = Math.abs(v);
        if (abs >= 1000) return v.toFixed(0);
        if (abs >= 1) return v.toFixed(1);
        return v.toFixed(2);
    }

    /**
     * Update all plots with current time cursor. Called each frame.
     * @param {number} currentTime - Unix epoch ms
     */
    update(currentTime) {
        if (!this.isVisible()) return;
        for (const plotKey of this.activePlots.keys()) {
            this.drawPlot(plotKey, currentTime);
        }
    }

    /**
     * Set selected platform for highlighting.
     * @param {string|null} id
     */
    setSelectedPlatform(id) {
        this.selectedPlatformId = id;
    }

    /**
     * Get active plot keys.
     * @returns {Set<string>}
     */
    getActivePlotKeys() {
        return new Set(this.activePlots.keys());
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
        this.activePlots.clear();
        this.platformColors.clear();
    }
}
