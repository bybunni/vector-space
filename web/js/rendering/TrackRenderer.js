import * as THREE from 'three';

/**
 * TrackRenderer.js
 *
 * Renders sensor tracks showing when a platform is detected by another platform's sensor.
 * Displays:
 *   - A connecting line from the sensor to the target
 *   - A billboard glow sprite around the detected target
 */

export class TrackRenderer {
    constructor(sceneManager, simulationData, sensorRenderer, platformRenderer) {
        this.sceneManager = sceneManager;
        this.simData = simulationData;
        this.sensorRenderer = sensorRenderer;
        this.platformRenderer = platformRenderer;

        // Active tracks: Map of "sensorId:targetId" -> { line, sprite }
        this.activeTracks = new Map();

        // Object pools for reuse
        this.linePool = [];
        this.spritePool = [];

        // Glow texture (shared across all sprites)
        this.glowTexture = this.createGlowTexture();
    }

    /**
     * Create radial gradient texture for glow effect
     * @returns {THREE.CanvasTexture}
     */
    createGlowTexture() {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext('2d');
        const center = size / 2;

        // Radial gradient: bright center, fading to transparent
        const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        return texture;
    }

    /**
     * Get or create a track line
     * @param {number} color - Three.js color
     * @returns {THREE.Line}
     */
    getTrackLine(color) {
        // Try to reuse from pool
        if (this.linePool.length > 0) {
            const line = this.linePool.pop();
            line.material.color.setHex(color);
            line.visible = true;
            return line;
        }

        // Create new line
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(6); // 2 vertices * 3 components
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.8,
            linewidth: 2
        });

        const line = new THREE.Line(geometry, material);
        this.sceneManager.add(line);

        return line;
    }

    /**
     * Get or create a glow sprite
     * @param {number} color - Three.js color
     * @returns {THREE.Sprite}
     */
    getGlowSprite(color) {
        // Try to reuse from pool
        if (this.spritePool.length > 0) {
            const sprite = this.spritePool.pop();
            sprite.material.color.setHex(color);
            sprite.visible = true;
            return sprite;
        }

        // Create new sprite
        const material = new THREE.SpriteMaterial({
            map: this.glowTexture,
            color: color,
            transparent: true,
            opacity: 0.7,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const sprite = new THREE.Sprite(material);
        sprite.scale.set(200, 200, 1); // Scale for visibility

        this.sceneManager.add(sprite);

        return sprite;
    }

    /**
     * Return objects to pool
     * @param {THREE.Line} line
     * @param {THREE.Sprite} sprite
     */
    releaseTrackObjects(line, sprite) {
        if (line) {
            line.visible = false;
            this.linePool.push(line);
        }
        if (sprite) {
            sprite.visible = false;
            this.spritePool.push(sprite);
        }
    }

    /**
     * Update all tracks for current time
     * @param {number} currentTime - Unix epoch milliseconds
     */
    update(currentTime) {
        // Compute current detections
        const detections = this.computeDetections(currentTime);

        // Track which detections are active
        const activeKeys = new Set();

        // Update/create tracks for current detections
        for (const detection of detections) {
            const key = `${detection.sensorId}:${detection.targetId}`;
            activeKeys.add(key);

            let track = this.activeTracks.get(key);

            if (!track) {
                // Create new track
                const color = detection.sensor.getColor();
                track = {
                    line: this.getTrackLine(color),
                    sprite: this.getGlowSprite(color)
                };
                this.activeTracks.set(key, track);
            }

            // Update track positions
            this.updateTrackGeometry(track, detection.sensorPos, detection.targetPos);
        }

        // Remove tracks that are no longer active
        for (const [key, track] of this.activeTracks) {
            if (!activeKeys.has(key)) {
                this.releaseTrackObjects(track.line, track.sprite);
                this.activeTracks.delete(key);
            }
        }
    }

    /**
     * Update track line and sprite positions
     * @param {Object} track - { line, sprite }
     * @param {THREE.Vector3} sensorPos - Sensor position
     * @param {THREE.Vector3} targetPos - Target position
     */
    updateTrackGeometry(track, sensorPos, targetPos) {
        // Update line vertices
        const positions = track.line.geometry.attributes.position.array;
        positions[0] = sensorPos.x;
        positions[1] = sensorPos.y;
        positions[2] = sensorPos.z;
        positions[3] = targetPos.x;
        positions[4] = targetPos.y;
        positions[5] = targetPos.z;
        track.line.geometry.attributes.position.needsUpdate = true;

        // Update sprite position (at target)
        track.sprite.position.copy(targetPos);
    }

    /**
     * Compute all detections for current time
     * @param {number} currentTime - Unix epoch milliseconds
     * @returns {Array} Array of detection objects
     */
    computeDetections(currentTime) {
        const detections = [];

        for (const [sensorId, sensor] of this.simData.sensors) {
            if (!sensor.platform) continue;

            // Get sensor group to extract world position and orientation
            const sensorGroup = this.sensorRenderer.getSensorGroup(sensorId);
            if (!sensorGroup) continue;

            const sensorPos = new THREE.Vector3();
            sensorGroup.getWorldPosition(sensorPos);

            const sensorQuat = new THREE.Quaternion();
            sensorGroup.getWorldQuaternion(sensorQuat);

            // Check all platforms for detection
            for (const [platformId, platform] of this.simData.platforms) {
                // Skip self-detection (sensor's own platform)
                if (platformId === sensor.platformId) continue;

                const targetState = platform.getStateAtTime(currentTime);
                if (!targetState) continue;

                const targetPos = targetState.getPosition();

                // Check if target is detectable
                if (this.isTargetDetectable(sensor, sensorPos, sensorQuat, targetPos)) {
                    detections.push({
                        sensorId: sensorId,
                        targetId: platformId,
                        sensor: sensor,
                        sensorPos: sensorPos.clone(),
                        targetPos: targetPos.clone()
                    });
                }
            }
        }

        return detections;
    }

    /**
     * Check if target is within sensor FOV and range
     * @param {Sensor} sensor - Sensor object
     * @param {THREE.Vector3} sensorPos - Sensor world position
     * @param {THREE.Quaternion} sensorQuat - Sensor world quaternion
     * @param {THREE.Vector3} targetPos - Target world position
     * @returns {boolean} True if target is detectable
     */
    isTargetDetectable(sensor, sensorPos, sensorQuat, targetPos) {
        // Compute vector from sensor to target
        const toTarget = targetPos.clone().sub(sensorPos);
        const distance = toTarget.length();

        // Range check
        if (distance < sensor.rangeMin || distance > sensor.rangeMax) {
            return false;
        }

        // Transform to sensor-local coordinates
        // Inverse of sensor quaternion rotates world direction to local
        const invQuat = sensorQuat.clone().invert();
        const localDir = toTarget.clone().normalize().applyQuaternion(invQuat);

        // In sensor-local frame, +X is forward (boresight)
        // Compute azimuth angle (horizontal angle from boresight)
        // In Three.js local frame: X=forward, Y=up, Z=right
        const azimuthRad = Math.atan2(localDir.z, localDir.x);

        // Compute elevation angle (vertical angle from boresight)
        // Project to horizontal plane first
        const horizontalDist = Math.sqrt(localDir.x * localDir.x + localDir.z * localDir.z);
        const elevationRad = Math.atan2(localDir.y, horizontalDist);

        // Convert FOV to radians
        const azFovHalfRad = THREE.MathUtils.degToRad(sensor.azimuthFov / 2);
        const elFovHalfRad = THREE.MathUtils.degToRad(sensor.elevationFov / 2);

        // FOV check
        if (Math.abs(azimuthRad) > azFovHalfRad || Math.abs(elevationRad) > elFovHalfRad) {
            return false;
        }

        return true;
    }

    /**
     * Remove all track objects from scene
     */
    dispose() {
        // Remove active tracks
        for (const track of this.activeTracks.values()) {
            this.sceneManager.remove(track.line);
            this.sceneManager.remove(track.sprite);

            if (track.line.geometry) track.line.geometry.dispose();
            if (track.line.material) track.line.material.dispose();
            if (track.sprite.material) track.sprite.material.dispose();
        }
        this.activeTracks.clear();

        // Remove pooled objects
        for (const line of this.linePool) {
            this.sceneManager.remove(line);
            if (line.geometry) line.geometry.dispose();
            if (line.material) line.material.dispose();
        }
        this.linePool = [];

        for (const sprite of this.spritePool) {
            this.sceneManager.remove(sprite);
            if (sprite.material) sprite.material.dispose();
        }
        this.spritePool = [];

        // Dispose shared texture
        if (this.glowTexture) {
            this.glowTexture.dispose();
            this.glowTexture = null;
        }
    }
}
