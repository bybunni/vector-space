// TrajectoryRibbonRenderer.js - Renders wing-shaped trajectory ribbons for platforms
import * as THREE from 'three';

/**
 * TrajectoryRibbonRenderer
 *
 * Renders wing-shaped ribbons along flight paths showing trajectory history.
 * Ribbons extend perpendicular to the direction of travel, creating a "wing" effect.
 * The ribbon rotates with the platform's roll angle, tracing the path of the
 * aircraft's wings through space.
 */

export class TrajectoryRibbonRenderer {
    constructor(sceneManager, simulationData) {
        this.sceneManager = sceneManager;
        this.simData = simulationData;

        // Map of platform ID to ribbon state
        this.ribbonStates = new Map();  // platformId -> { enabled: boolean, mesh: THREE.Mesh }

        // Ribbon configuration
        this.historyDuration = 60000;   // 60 seconds of history in milliseconds
        this.ribbonWidth = 50;          // Half-width of ribbon (meters)
        this.sampleInterval = 100;      // Sample every 100ms for smooth ribbons
        this.maxVertices = 1200;        // Max vertices (600 samples * 2 sides)

        // Initialize all platforms as disabled
        for (const [platformId] of this.simData.platforms) {
            this.ribbonStates.set(platformId, {
                enabled: false,
                mesh: null
            });
        }
    }

    /**
     * Set ribbon visibility for a specific platform
     * @param {string} platformId - Platform ID
     * @param {boolean} visible - Whether ribbon should be visible
     */
    setRibbonVisibility(platformId, visible) {
        const state = this.ribbonStates.get(platformId);
        if (!state) return;

        state.enabled = visible;

        if (visible && !state.mesh) {
            // Create ribbon mesh when first enabled
            state.mesh = this.createRibbonMesh(platformId);
            this.sceneManager.add(state.mesh);
        } else if (!visible && state.mesh) {
            // Hide but keep the mesh
            state.mesh.visible = false;
        } else if (visible && state.mesh) {
            state.mesh.visible = true;
        }
    }

    /**
     * Create ribbon mesh for a platform
     * @param {string} platformId
     * @returns {THREE.Mesh}
     */
    createRibbonMesh(platformId) {
        // Create buffer geometry with pre-allocated vertices
        const geometry = new THREE.BufferGeometry();

        // Pre-allocate position buffer (2 vertices per sample point for ribbon width)
        const positions = new Float32Array(this.maxVertices * 3);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setDrawRange(0, 0);  // Start with nothing drawn

        // Get platform color or use default
        const platform = this.simData.getPlatform(platformId);
        const color = platform && platform.color ? platform.color : 0x00ffff;

        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.platformId = platformId;
        mesh.frustumCulled = false;  // Always render (trajectory may span large area)

        return mesh;
    }

    /**
     * Compute perpendicular "wing" direction from flight direction
     * @param {THREE.Vector3} flightDir - Direction of travel (will be normalized)
     * @param {number} rollDegrees - Roll angle in degrees (positive = right wing down)
     * @returns {THREE.Vector3} - Unit vector perpendicular to flight direction, rotated by roll
     */
    computeWingDirection(flightDir, rollDegrees = 0) {
        // Normalize flight direction
        const dir = flightDir.clone();
        if (dir.lengthSq() < 0.001) {
            return new THREE.Vector3(1, 0, 0);
        }
        dir.normalize();

        // Compute horizontal wing direction (perpendicular to flight in horizontal plane)
        const up = new THREE.Vector3(0, 1, 0);
        const wing = new THREE.Vector3().crossVectors(dir, up);

        // Handle case where flight direction is nearly vertical
        if (wing.lengthSq() < 0.001) {
            wing.set(1, 0, 0);
        } else {
            wing.normalize();
        }

        // Apply roll rotation around the flight direction axis
        if (Math.abs(rollDegrees) > 0.01) {
            const rollRad = THREE.MathUtils.degToRad(rollDegrees);
            const quaternion = new THREE.Quaternion().setFromAxisAngle(dir, rollRad);
            wing.applyQuaternion(quaternion);
        }

        return wing;
    }

    /**
     * Update ribbon geometry for current time
     * @param {number} currentTime - Unix epoch milliseconds
     */
    update(currentTime) {
        for (const [platformId, state] of this.ribbonStates) {
            if (!state.enabled || !state.mesh) continue;

            const platform = this.simData.getPlatform(platformId);
            if (!platform) continue;

            this.updateRibbonGeometry(state.mesh, platform, currentTime);
        }
    }

    /**
     * Update ribbon geometry for a single platform
     * @param {THREE.Mesh} mesh
     * @param {Platform} platform
     * @param {number} currentTime
     */
    updateRibbonGeometry(mesh, platform, currentTime) {
        const geometry = mesh.geometry;
        const positions = geometry.attributes.position.array;

        const startTime = currentTime - this.historyDuration;
        const samples = [];

        // Collect position samples within time window
        for (let t = startTime; t <= currentTime; t += this.sampleInterval) {
            const state = platform.getStateAtTime(t);
            if (!state) continue;

            const pos = state.getPosition();
            const vel = state.getVelocity ? state.getVelocity() : null;
            const roll = state.getRoll ? state.getRoll() : 0;

            samples.push({ pos, vel, roll, time: t });
        }

        // Need at least 2 samples to form a ribbon
        if (samples.length < 2) {
            geometry.setDrawRange(0, 0);
            return;
        }

        // Build ribbon vertices
        let vertexIndex = 0;
        const maxSamples = Math.min(samples.length, this.maxVertices / 2);

        for (let i = 0; i < maxSamples; i++) {
            const sample = samples[i];
            let wingDir;

            // Always use position differences to compute wing direction
            // This ensures the ribbon is perpendicular to actual movement,
            // even if velocity data is incorrect or missing
            // Roll is applied to tilt the ribbon with the platform's bank angle
            if (i < maxSamples - 1) {
                // Use direction to next sample
                const nextSample = samples[i + 1];
                const dir = new THREE.Vector3().subVectors(nextSample.pos, sample.pos);
                wingDir = this.computeWingDirection(dir, sample.roll);
            } else if (i > 0) {
                // Last sample: use direction from previous sample
                const prevSample = samples[i - 1];
                const dir = new THREE.Vector3().subVectors(sample.pos, prevSample.pos);
                wingDir = this.computeWingDirection(dir, sample.roll);
            } else {
                // Single sample: fall back to velocity or default
                if (sample.vel && sample.vel.lengthSq() > 0.01) {
                    wingDir = this.computeWingDirection(sample.vel, sample.roll);
                } else {
                    wingDir = new THREE.Vector3(1, 0, 0);
                }
            }

            // Compute left and right wing points
            const leftPoint = sample.pos.clone().addScaledVector(wingDir, -this.ribbonWidth);
            const rightPoint = sample.pos.clone().addScaledVector(wingDir, this.ribbonWidth);

            // Add vertices (left, right pairs)
            positions[vertexIndex * 3] = leftPoint.x;
            positions[vertexIndex * 3 + 1] = leftPoint.y;
            positions[vertexIndex * 3 + 2] = leftPoint.z;
            vertexIndex++;

            positions[vertexIndex * 3] = rightPoint.x;
            positions[vertexIndex * 3 + 1] = rightPoint.y;
            positions[vertexIndex * 3 + 2] = rightPoint.z;
            vertexIndex++;
        }

        // Create triangle strip indices
        // For a ribbon, we use triangle strip pattern: 0-1-2, 1-2-3, 2-3-4, etc.
        // But BufferGeometry needs explicit triangles, so we use setIndex or draw as triangle strip

        // Convert to triangle strip using draw range
        // Actually, let's rebuild as indexed triangles for proper rendering
        const numQuads = maxSamples - 1;
        const indexCount = numQuads * 6;  // 2 triangles per quad, 3 indices each

        // Create or update index buffer
        let indices = geometry.getIndex();
        if (!indices || indices.count < indexCount) {
            const indexArray = new Uint16Array(numQuads * 6);
            for (let i = 0; i < numQuads; i++) {
                const baseVertex = i * 2;
                const baseIndex = i * 6;

                // First triangle: left[i], right[i], left[i+1]
                indexArray[baseIndex] = baseVertex;
                indexArray[baseIndex + 1] = baseVertex + 1;
                indexArray[baseIndex + 2] = baseVertex + 2;

                // Second triangle: right[i], right[i+1], left[i+1]
                indexArray[baseIndex + 3] = baseVertex + 1;
                indexArray[baseIndex + 4] = baseVertex + 3;
                indexArray[baseIndex + 5] = baseVertex + 2;
            }
            geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));
        }

        geometry.setDrawRange(0, numQuads * 6);
        geometry.attributes.position.needsUpdate = true;
        geometry.computeBoundingSphere();
    }

    /**
     * Remove all ribbon objects from scene and clean up resources
     */
    dispose() {
        for (const state of this.ribbonStates.values()) {
            if (state.mesh) {
                this.sceneManager.remove(state.mesh);

                if (state.mesh.geometry) {
                    state.mesh.geometry.dispose();
                }
                if (state.mesh.material) {
                    state.mesh.material.dispose();
                }

                state.mesh = null;
            }
        }

        this.ribbonStates.clear();
    }
}
