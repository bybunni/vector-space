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

        // Store platform ID for click detection
        group.userData.platformId = platform.entityId;

        // Platform body - Flying Dorito (delta wing triangle)
        const body = this.createDoritoGeometry();
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
     * Create flying dorito geometry (delta wing triangle)
     * @returns {THREE.Mesh}
     */
    createDoritoGeometry() {
        const geometry = new THREE.BufferGeometry();

        // Triangle dimensions
        const length = 60;  // Nose to tail
        const width = 70;   // Wingspan
        const thickness = 4; // Thin like a dorito

        // Define vertices for triangular prism
        // Top and bottom triangles pointing along +X
        const vertices = new Float32Array([
            // Top triangle
            length, 0, 0,              // Nose (front tip)
            -length/3, thickness/2, width/2,   // Left wing tip
            -length/3, thickness/2, -width/2,  // Right wing tip

            // Bottom triangle
            length, 0, 0,              // Nose (front tip)
            -length/3, -thickness/2, width/2,  // Left wing tip
            -length/3, -thickness/2, -width/2, // Right wing tip

            // Back edge vertices (for closing the rear)
            -length/3, thickness/2, width/2,   // Top left
            -length/3, thickness/2, -width/2,  // Top right
            -length/3, -thickness/2, width/2,  // Bottom left
            -length/3, -thickness/2, -width/2, // Bottom right
        ]);

        const indices = [
            // Top face
            0, 1, 2,

            // Bottom face
            3, 5, 4,

            // Left side
            0, 4, 1,

            // Right side
            0, 2, 5,

            // Back face (closing the tail)
            6, 8, 7,
            7, 8, 9
        ];

        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        // Orange dorito material
        const material = new THREE.MeshStandardMaterial({
            color: 0xff6600,
            metalness: 0.3,
            roughness: 0.7,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);

        // Add wireframe edges for better visibility
        const edges = new THREE.EdgesGeometry(geometry);
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff9933 });
        const wireframe = new THREE.LineSegments(edges, lineMaterial);
        mesh.add(wireframe);

        return mesh;
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

                // Transform world-frame velocity to body-frame for rendering
                // (arrow is child of rotated group, so needs body-frame direction)
                const direction = velocity.clone().normalize();
                const inverseQuat = quaternion.clone().invert();
                direction.applyQuaternion(inverseQuat);
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

    /**
     * Get all platform groups for click detection
     * @returns {THREE.Group[]}
     */
    getAllPlatformGroups() {
        return Array.from(this.platformGroups.values());
    }
}
