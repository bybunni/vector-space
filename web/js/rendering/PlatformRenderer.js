import * as THREE from 'three';

/**
 * PlatformRenderer.js
 *
 * Renders platforms with body, orientation axes, and velocity vectors.
 */

export class PlatformRenderer {
    constructor(sceneManager, simulationData) {
        this.sceneManager = sceneManager;
        this.simData = simulationData;

        // Map of platform ID to THREE.Group
        this.platformGroups = new Map();

        this.createPlatformObjects();
    }

    /**
     * Create visual objects for all platforms
     */
    createPlatformObjects() {
        for (const [platformId, platform] of this.simData.platforms) {
            const group = this.createPlatformGroup(platform);
            this.platformGroups.set(platformId, group);
            this.sceneManager.add(group);
        }
    }

    /**
     * Create visual group for a single platform
     * @param {Platform} platform
     * @returns {THREE.Group}
     */
    createPlatformGroup(platform) {
        const group = new THREE.Group();

        // Platform body (cone pointing forward along +X axis)
        const bodyGeometry = new THREE.ConeGeometry(20, 80, 8);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0xff6600,
            metalness: 0.3,
            roughness: 0.7
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);

        // Rotate cone to point along +X (forward)
        // Default cone points along +Y, so rotate -90° around Z
        body.rotation.z = -Math.PI / 2;

        group.add(body);

        // Body frame axes (RGB = XYZ = North/Up/East)
        const axesHelper = new THREE.AxesHelper(100);
        group.add(axesHelper);

        // Velocity arrow (will be updated dynamically)
        const arrowHelper = new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0), // Default direction
            new THREE.Vector3(0, 0, 0),  // Origin
            100,                          // Length
            0xffff00,                     // Yellow
            20,                           // Head length
            10                            // Head width
        );
        group.add(arrowHelper);

        // Store reference to arrow for updates
        group.userData.velocityArrow = arrowHelper;

        return group;
    }

    /**
     * Update all platforms for current time
     * @param {number} currentTime - Unix epoch milliseconds
     */
    update(currentTime) {
        for (const [platformId, platform] of this.simData.platforms) {
            const state = platform.getStateAtTime(currentTime);
            if (!state) continue;

            const group = this.platformGroups.get(platformId);
            if (!group) continue;

            this.updatePlatformGroup(group, state);
        }
    }

    /**
     * Update single platform group
     * @param {THREE.Group} group
     * @param {PlatformState} state
     */
    updatePlatformGroup(group, state) {
        // Update position
        const position = state.getPosition();
        group.position.copy(position);

        // Update orientation
        const quaternion = state.getQuaternion();
        group.setRotationFromQuaternion(quaternion);

        // Update velocity arrow
        const velocity = state.getVelocity();
        const velocityArrow = group.userData.velocityArrow;

        if (velocityArrow) {
            const speed = velocity.length();

            if (speed > 0.1) {
                // Show arrow
                velocityArrow.visible = true;

                // Set direction (normalized)
                const direction = velocity.clone().normalize();
                velocityArrow.setDirection(direction);

                // Set length proportional to speed (scale for visibility)
                const arrowLength = Math.min(speed * 2, 500); // Cap at 500m
                velocityArrow.setLength(arrowLength, 20, 10);
            } else {
                // Hide arrow if not moving
                velocityArrow.visible = false;
            }
        }
    }

    /**
     * Remove all platform objects from scene
     */
    dispose() {
        for (const group of this.platformGroups.values()) {
            this.sceneManager.remove(group);

            // Dispose geometries and materials
            group.traverse((object) => {
                if (object.geometry) {
                    object.geometry.dispose();
                }
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            });
        }

        this.platformGroups.clear();
    }

    /**
     * Get platform group for specific platform ID
     * @param {string} platformId
     * @returns {THREE.Group|undefined}
     */
    getPlatformGroup(platformId) {
        return this.platformGroups.get(platformId);
    }
}
