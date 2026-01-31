import { CoordinateSystem } from '../core/CoordinateSystem.js';

/**
 * MinimapPanel.js
 *
 * A fixed 250x250 canvas minimap showing all platform trajectories as colored
 * polylines with heading-oriented triangles at each platform's current position.
 * North up, East right. Always visible once data is loaded.
 */

const PLOT_COLORS = [
    '#00d4ff', '#ff6b6b', '#51cf66', '#fcc419', '#cc5de8',
    '#ff922b', '#20c997', '#e64980', '#74c0fc', '#a9e34b'
];

const CANVAS_SIZE = 250;

export class MinimapPanel {
    constructor(simData) {
        this.simData = simData;
        this.platformColors = new Map();
        this.trajectories = new Map(); // platformId -> [{north, east, t}, ...]
        this.selectedPlatformId = null;
        this.element = null;
        this.canvas = null;
        this.ctx = null;

        // Bounds for coordinate mapping (square, uniform scale)
        this.minEast = 0;
        this.maxEast = 0;
        this.minNorth = 0;
        this.maxNorth = 0;

        this.assignPlatformColors();
        this.precomputeTrajectories();
        this.computeBounds();
        this.createPanel();
    }

    assignPlatformColors() {
        let i = 0;
        for (const id of this.simData.platforms.keys()) {
            this.platformColors.set(id, PLOT_COLORS[i % PLOT_COLORS.length]);
            i++;
        }
    }

    precomputeTrajectories() {
        for (const [id, platform] of this.simData.platforms) {
            const points = [];
            for (const state of platform.states) {
                points.push({ north: state.posNorth, east: state.posEast, t: state.timestamp });
            }
            if (points.length > 0) {
                this.trajectories.set(id, points);
            }
        }
    }

    computeBounds() {
        let minN = Infinity, maxN = -Infinity;
        let minE = Infinity, maxE = -Infinity;

        for (const points of this.trajectories.values()) {
            for (const p of points) {
                if (p.north < minN) minN = p.north;
                if (p.north > maxN) maxN = p.north;
                if (p.east < minE) minE = p.east;
                if (p.east > maxE) maxE = p.east;
            }
        }

        if (!isFinite(minN)) {
            minN = -100; maxN = 100; minE = -100; maxE = 100;
        }

        // Enforce square aspect ratio: use the larger span for both axes
        const spanN = maxN - minN;
        const spanE = maxE - minE;
        const span = Math.max(spanN, spanE) || 200;

        // 10% padding
        const padding = span * 0.1;
        const centerN = (minN + maxN) / 2;
        const centerE = (minE + maxE) / 2;
        const half = (span / 2) + padding;

        this.minNorth = centerN - half;
        this.maxNorth = centerN + half;
        this.minEast = centerE - half;
        this.maxEast = centerE + half;
    }

    createPanel() {
        this.element = document.createElement('div');
        this.element.id = 'minimap-panel';

        // Title
        const title = document.createElement('div');
        title.className = 'minimap-title';
        title.textContent = 'MAP';
        this.element.appendChild(title);

        // Canvas
        this.canvas = document.createElement('canvas');
        this.canvas.width = CANVAS_SIZE;
        this.canvas.height = CANVAS_SIZE;
        this.canvas.className = 'minimap-canvas';
        this.ctx = this.canvas.getContext('2d');
        this.element.appendChild(this.canvas);

        document.body.appendChild(this.element);
    }

    /** Map East value to canvas X (left to right) */
    mapEastToX(east) {
        return ((east - this.minEast) / (this.maxEast - this.minEast)) * CANVAS_SIZE;
    }

    /** Map North value to canvas Y (north = up, but canvas Y grows down) */
    mapNorthToY(north) {
        return (1 - (north - this.minNorth) / (this.maxNorth - this.minNorth)) * CANVAS_SIZE;
    }

    /**
     * Extract yaw from a state, handling interpolated states with zeroed Euler angles.
     * Same pattern as PlatformDetailsPanel.
     * @param {Object} state
     * @returns {number} yaw in degrees
     */
    getYawFromState(state) {
        if (state.roll !== 0 || state.pitch !== 0 || state.yaw !== 0) {
            return state.yaw;
        }
        const quaternion = state.getQuaternion();
        const euler = CoordinateSystem.quaternionToNedEuler(quaternion);
        return euler.yaw;
    }

    /**
     * Draw a heading triangle at (cx, cy) rotated by yawDeg.
     * NED yaw: 0=North (up on screen), clockwise positive.
     * @param {number} cx - canvas X center
     * @param {number} cy - canvas Y center
     * @param {number} yawDeg - yaw in degrees
     * @param {string} color
     * @param {number} size - triangle half-height
     */
    drawTriangle(cx, cy, yawDeg, color, size) {
        const ctx = this.ctx;
        const angle = yawDeg * Math.PI / 180; // clockwise rotation from north (up)

        // Isoceles triangle pointing up (negative Y) before rotation
        // tip at (0, -size), base at (-size*0.6, size*0.5) and (size*0.6, size*0.5)
        const pts = [
            { x: 0, y: -size },
            { x: -size * 0.6, y: size * 0.5 },
            { x: size * 0.6, y: size * 0.5 }
        ];

        // Rotate clockwise visually on canvas (Y-down).
        // Standard CCW matrix gives visual CW rotation when canvas Y is inverted.
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
            const rx = pts[i].x * cos - pts[i].y * sin;
            const ry = pts[i].x * sin + pts[i].y * cos;
            if (i === 0) ctx.moveTo(cx + rx, cy + ry);
            else ctx.lineTo(cx + rx, cy + ry);
        }
        ctx.closePath();

        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    /**
     * Full redraw each frame.
     * @param {number} currentTime - Unix epoch ms
     */
    update(currentTime) {
        if (!this.ctx) return;

        const ctx = this.ctx;
        const w = CANVAS_SIZE;

        // 1. Background
        ctx.fillStyle = 'rgba(10, 10, 20, 0.95)';
        ctx.fillRect(0, 0, w, w);

        // Border
        ctx.strokeStyle = 'rgba(100, 100, 150, 0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, w, w);

        // "N" indicator at top center
        ctx.fillStyle = '#888';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('N', w / 2, 12);

        // 2. Draw trajectory polylines up to currentTime
        // Non-selected first (dimmer), selected last (on top)
        for (const [id, points] of this.trajectories) {
            if (id === this.selectedPlatformId) continue;
            this.drawTrajectory(id, points, false, currentTime);
        }
        // Draw selected on top
        if (this.selectedPlatformId && this.trajectories.has(this.selectedPlatformId)) {
            this.drawTrajectory(
                this.selectedPlatformId,
                this.trajectories.get(this.selectedPlatformId),
                true,
                currentTime
            );
        }

        // 3. Draw heading triangles at current positions
        ctx.globalAlpha = 1.0;
        for (const [id, platform] of this.simData.platforms) {
            const state = platform.getStateAtTime(currentTime);
            if (!state) continue;

            const cx = this.mapEastToX(state.posEast);
            const cy = this.mapNorthToY(state.posNorth);
            const yaw = this.getYawFromState(state);
            const color = this.platformColors.get(id) || '#888';
            const isSelected = id === this.selectedPlatformId;
            const size = isSelected ? 8 : 6;

            this.drawTriangle(cx, cy, yaw, color, size);
        }
    }

    /**
     * Draw a single platform's trajectory polyline up to currentTime.
     * @param {string} id
     * @param {Array} points - pre-computed {north, east, t} array sorted by time
     * @param {boolean} isSelected
     * @param {number} currentTime - Unix epoch ms
     */
    drawTrajectory(id, points, isSelected, currentTime) {
        if (points.length < 2) return;

        const ctx = this.ctx;
        const color = this.platformColors.get(id) || '#888';

        ctx.strokeStyle = color;
        ctx.globalAlpha = isSelected ? 1.0 : 0.5;
        ctx.lineWidth = isSelected ? 2.5 : 1;

        ctx.beginPath();
        let started = false;
        for (let i = 0; i < points.length; i++) {
            if (points[i].t > currentTime) break;
            const x = this.mapEastToX(points[i].east);
            const y = this.mapNorthToY(points[i].north);
            if (!started) { ctx.moveTo(x, y); started = true; }
            else ctx.lineTo(x, y);
        }
        if (started) ctx.stroke();
        ctx.globalAlpha = 1.0;
    }

    /**
     * Set the selected platform for highlighting.
     * @param {string|null} platformId
     */
    setSelectedPlatform(platformId) {
        this.selectedPlatformId = platformId;
    }

    dispose() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.element = null;
        this.canvas = null;
        this.ctx = null;
        this.trajectories.clear();
        this.platformColors.clear();
    }
}
