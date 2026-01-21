// SensorRenderer v2 - Spherical FOV cap implementation
import * as THREE from 'three';
import { CoordinateSystem } from '../core/CoordinateSystem.js';

/**
 * SensorRenderer.js
 *
 * Renders sensor FOV cones with support for body-fixed and stabilized mounting.
 */

export class SensorRenderer {
    constructor(sceneManager, simulationData) {
        this.sceneManager = sceneManager;
        this.simData = simulationData;

        // Map of sensor ID to THREE.Group
        this.sensorGroups = new Map();

        this.createSensorObjects();
    }

    /**
     * Create visual objects for all sensors
     */
    createSensorObjects() {
        for (const [sensorId, sensor] of this.simData.sensors) {
            const group = this.createSensorGroup(sensor);
            this.sensorGroups.set(sensorId, group);
            this.sceneManager.add(group);
        }
    }

    /**
     * Create visual group for a single sensor
     * @param {Sensor} sensor
     * @returns {THREE.Group}
     */
    createSensorGroup(sensor) {
        const group = new THREE.Group();

        // Create FOV pyramid geometry
        const fovMesh = this.createFOVGeometry(sensor);
        group.add(fovMesh);

        // Store sensor reference
        group.userData.sensor = sensor;

        return group;
    }

    /**
     * Compute a point on the spherical cap in sensor-local coordinates
     * @param {number} az - Azimuth angle in radians
     * @param {number} el - Elevation angle in radians
     * @param {number} range - Distance from origin
     * @returns {THREE.Vector3}
     */
    computeSphericalPoint(az, el, range) {
        // Spherical to Cartesian (+X is boresight, Y is up, Z is right)
        const cosEl = Math.cos(el);
        const sinEl = Math.sin(el);
        const cosAz = Math.cos(az);
        const sinAz = Math.sin(az);

        const x = range * cosEl * cosAz;
        const y = range * sinEl;
        const z = range * cosEl * sinAz;

        return new THREE.Vector3(x, y, z);
    }

    /**
     * Generate a 2D grid of points on the spherical cap surface
     * @param {number} azMin - Min azimuth in radians
     * @param {number} azMax - Max azimuth in radians
     * @param {number} elMin - Min elevation in radians
     * @param {number} elMax - Max elevation in radians
     * @param {number} range - Distance from origin
     * @param {number} azSegments - Number of azimuth segments
     * @param {number} elSegments - Number of elevation segments
     * @returns {THREE.Vector3[][]} 2D grid of points [azIndex][elIndex]
     */
    generateSphericalCapGrid(azMin, azMax, elMin, elMax, range, azSegments, elSegments) {
        const grid = [];
        for (let i = 0; i <= azSegments; i++) {
            const row = [];
            const t = i / azSegments;
            const az = azMin + t * (azMax - azMin);
            for (let j = 0; j <= elSegments; j++) {
                const s = j / elSegments;
                const el = elMin + s * (elMax - elMin);
                row.push(this.computeSphericalPoint(az, el, range));
            }
            grid.push(row);
        }
        return grid;
    }

    /**
     * Generate triangle vertices for the spherical cap (non-indexed)
     * @param {THREE.Vector3[][]} grid
     * @param {number} azSegments
     * @param {number} elSegments
     * @returns {number[]} Flat array of vertex coordinates
     */
    generateCapTriangles(grid, azSegments, elSegments) {
        const vertices = [];
        for (let i = 0; i < azSegments; i++) {
            for (let j = 0; j < elSegments; j++) {
                const v00 = grid[i][j];
                const v10 = grid[i + 1][j];
                const v01 = grid[i][j + 1];
                const v11 = grid[i + 1][j + 1];

                // Triangle 1: v00, v01, v11
                vertices.push(v00.x, v00.y, v00.z);
                vertices.push(v01.x, v01.y, v01.z);
                vertices.push(v11.x, v11.y, v11.z);

                // Triangle 2: v00, v11, v10
                vertices.push(v00.x, v00.y, v00.z);
                vertices.push(v11.x, v11.y, v11.z);
                vertices.push(v10.x, v10.y, v10.z);
            }
        }
        return vertices;
    }

    /**
     * Generate triangle vertices for side faces (apex to cap edges)
     * @param {THREE.Vector3[][]} grid
     * @param {THREE.Vector3} apex
     * @param {number} azSegments
     * @param {number} elSegments
     * @returns {number[]} Flat array of vertex coordinates
     */
    generateSideTriangles(grid, apex, azSegments, elSegments) {
        const vertices = [];

        // Bottom edge (elMin, j=0): apex to grid[i][0] - grid[i+1][0]
        for (let i = 0; i < azSegments; i++) {
            const v0 = grid[i][0];
            const v1 = grid[i + 1][0];
            vertices.push(apex.x, apex.y, apex.z);
            vertices.push(v0.x, v0.y, v0.z);
            vertices.push(v1.x, v1.y, v1.z);
        }

        // Top edge (elMax, j=elSegments): apex to grid[i+1][elSegments] - grid[i][elSegments]
        for (let i = 0; i < azSegments; i++) {
            const v0 = grid[i + 1][elSegments];
            const v1 = grid[i][elSegments];
            vertices.push(apex.x, apex.y, apex.z);
            vertices.push(v0.x, v0.y, v0.z);
            vertices.push(v1.x, v1.y, v1.z);
        }

        // Left edge (azMin, i=0): apex to grid[0][j+1] - grid[0][j]
        for (let j = 0; j < elSegments; j++) {
            const v0 = grid[0][j + 1];
            const v1 = grid[0][j];
            vertices.push(apex.x, apex.y, apex.z);
            vertices.push(v0.x, v0.y, v0.z);
            vertices.push(v1.x, v1.y, v1.z);
        }

        // Right edge (azMax, i=azSegments): apex to grid[azSegments][j] - grid[azSegments][j+1]
        for (let j = 0; j < elSegments; j++) {
            const v0 = grid[azSegments][j];
            const v1 = grid[azSegments][j + 1];
            vertices.push(apex.x, apex.y, apex.z);
            vertices.push(v0.x, v0.y, v0.z);
            vertices.push(v1.x, v1.y, v1.z);
        }

        return vertices;
    }

    /**
     * Generate line segment vertices for wireframe edges
     * @param {THREE.Vector3[][]} grid
     * @param {THREE.Vector3} apex
     * @param {number} azSegments
     * @param {number} elSegments
     * @returns {number[]} Flat array of line segment coordinates (pairs of vertices)
     */
    generateEdgeLines(grid, apex, azSegments, elSegments) {
        const vertices = [];

        // 4 straight edges from apex to corners
        const corners = [
            grid[0][0],                      // bottom-left
            grid[azSegments][0],             // bottom-right
            grid[0][elSegments],             // top-left
            grid[azSegments][elSegments]     // top-right
        ];
        for (const corner of corners) {
            vertices.push(apex.x, apex.y, apex.z, corner.x, corner.y, corner.z);
        }

        // Bottom curved edge (elMin, j=0)
        for (let i = 0; i < azSegments; i++) {
            const v0 = grid[i][0];
            const v1 = grid[i + 1][0];
            vertices.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z);
        }

        // Top curved edge (elMax, j=elSegments)
        for (let i = 0; i < azSegments; i++) {
            const v0 = grid[i][elSegments];
            const v1 = grid[i + 1][elSegments];
            vertices.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z);
        }

        // Left curved edge (azMin, i=0)
        for (let j = 0; j < elSegments; j++) {
            const v0 = grid[0][j];
            const v1 = grid[0][j + 1];
            vertices.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z);
        }

        // Right curved edge (azMax, i=azSegments)
        for (let j = 0; j < elSegments; j++) {
            const v0 = grid[azSegments][j];
            const v1 = grid[azSegments][j + 1];
            vertices.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z);
        }

        return vertices;
    }

    /**
     * Create FOV geometry with spherical cap boundary
     * @param {Sensor} sensor
     * @returns {THREE.Mesh}
     */
    createFOVGeometry(sensor) {
        // FOV cone points along +X axis (forward)
        const azFovRad = THREE.MathUtils.degToRad(sensor.azimuthFov);
        const elFovRad = THREE.MathUtils.degToRad(sensor.elevationFov);
        const range = sensor.rangeMax;

        const azMin = -azFovRad / 2;
        const azMax = azFovRad / 2;
        const elMin = -elFovRad / 2;
        const elMax = elFovRad / 2;

        // Tessellation resolution (degrees per segment)
        const resolutionDegrees = 5;
        const azSpanDeg = sensor.azimuthFov;
        const elSpanDeg = sensor.elevationFov;
        const azSegments = Math.max(2, Math.ceil(azSpanDeg / resolutionDegrees));
        const elSegments = Math.max(2, Math.ceil(elSpanDeg / resolutionDegrees));

        const apex = new THREE.Vector3(0, 0, 0);

        // Generate grid of points on spherical cap
        const grid = this.generateSphericalCapGrid(azMin, azMax, elMin, elMax, range, azSegments, elSegments);

        // Debug: Verify spherical coordinates
        const center = grid[Math.floor(azSegments/2)][Math.floor(elSegments/2)];
        const corner = grid[0][0];
        console.log(`Sensor ${sensor.entityId} FOV geometry debug:`);
        console.log(`  Range: ${range}, AzFOV: ${sensor.azimuthFov}°, ElFOV: ${sensor.elevationFov}°`);
        console.log(`  Segments: ${azSegments} az x ${elSegments} el`);
        console.log(`  Center vertex: (${center.x.toFixed(1)}, ${center.y.toFixed(1)}, ${center.z.toFixed(1)})`);
        console.log(`  Center distance from origin: ${center.length().toFixed(1)}`);
        console.log(`  Corner vertex: (${corner.x.toFixed(1)}, ${corner.y.toFixed(1)}, ${corner.z.toFixed(1)})`);
        console.log(`  Corner distance from origin: ${corner.length().toFixed(1)}`);
        console.log(`  Depth difference (center.x - corner.x): ${(center.x - corner.x).toFixed(1)}`);

        // Generate triangle vertices (non-indexed geometry)
        const capVertices = this.generateCapTriangles(grid, azSegments, elSegments);
        const sideVertices = this.generateSideTriangles(grid, apex, azSegments, elSegments);
        const allVertices = new Float32Array([...sideVertices, ...capVertices]);

        // Create mesh geometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(allVertices, 3));
        geometry.computeVertexNormals();

        // Material (semi-transparent, color-coded by sensor type)
        const color = sensor.getColor();
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        const mesh = new THREE.Mesh(geometry, material);

        // Generate edge lines for wireframe
        const edgeVertices = new Float32Array(this.generateEdgeLines(grid, apex, azSegments, elSegments));
        const edgeGeometry = new THREE.BufferGeometry();
        edgeGeometry.setAttribute('position', new THREE.BufferAttribute(edgeVertices, 3));

        const edgeMaterial = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.6
        });
        const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
        mesh.add(edges);

        return mesh;
    }

    /**
     * Update all sensors for current time
     * @param {number} currentTime - Unix epoch milliseconds
     */
    update(currentTime) {
        for (const [sensorId, sensor] of this.simData.sensors) {
            if (!sensor.platform) {
                console.warn(`Sensor ${sensorId} has no platform`);
                continue;
            }

            const platformState = sensor.platform.getStateAtTime(currentTime);
            if (!platformState) continue;

            const group = this.sensorGroups.get(sensorId);
            if (!group) continue;

            this.updateSensorGroup(group, sensor, platformState);
        }
    }

    /**
     * Update single sensor group
     * @param {THREE.Group} group
     * @param {Sensor} sensor
     * @param {PlatformState} platformState
     */
    updateSensorGroup(group, sensor, platformState) {
        // Get platform position and orientation
        const platformPosition = platformState.getPosition();
        const platformQuaternion = platformState.getQuaternion();

        // Set sensor position to platform position
        group.position.copy(platformPosition);

        // Compute sensor orientation based on mount type
        if (sensor.mountType === 'body_fixed') {
            // Body-fixed: sensor rotates with full platform orientation
            this.updateBodyFixedSensor(group, sensor, platformQuaternion);
        } else if (sensor.mountType === 'stabilized') {
            // Stabilized: sensor maintains horizon-level orientation (only follows yaw)
            this.updateStabilizedSensor(group, sensor, platformState, platformQuaternion);
        }
    }

    /**
     * Update body-fixed sensor (rotates with platform)
     * @param {THREE.Group} group
     * @param {Sensor} sensor
     * @param {THREE.Quaternion} platformQuaternion
     */
    updateBodyFixedSensor(group, sensor, platformQuaternion) {
        // Transform composition: World ← Platform ← Mount
        const mountQuaternion = sensor.getMountQuaternion();

        // Combine platform and mount orientations
        const finalQuaternion = platformQuaternion.clone().multiply(mountQuaternion);

        group.setRotationFromQuaternion(finalQuaternion);
    }

    /**
     * Update stabilized sensor (horizon-stabilized, follows yaw only)
     * @param {THREE.Group} group
     * @param {Sensor} sensor
     * @param {PlatformState} platformState
     * @param {THREE.Quaternion} platformQuaternion
     */
    updateStabilizedSensor(group, sensor, platformState, platformQuaternion) {
        // For stabilized sensors:
        // 1. Extract platform yaw (zero out roll and pitch)
        // 2. Apply mount orientation relative to this horizon-level frame

        // Convert platform quaternion to Euler to extract yaw
        const platformEuler = CoordinateSystem.quaternionToNedEuler(platformQuaternion);

        // Create horizon-level orientation (roll=0, pitch=0, yaw=platform_yaw)
        const horizonQuaternion = CoordinateSystem.nedEulerToQuaternion(
            0,                    // Roll = 0 (level)
            0,                    // Pitch = 0 (level)
            platformEuler.yaw     // Yaw = follow platform heading
        );

        // Apply mount orientation
        const mountQuaternion = sensor.getMountQuaternion();
        const finalQuaternion = horizonQuaternion.clone().multiply(mountQuaternion);

        group.setRotationFromQuaternion(finalQuaternion);
    }

    /**
     * Remove all sensor objects from scene
     */
    dispose() {
        for (const group of this.sensorGroups.values()) {
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

        this.sensorGroups.clear();
    }

    /**
     * Get sensor group for specific sensor ID
     * @param {string} sensorId
     * @returns {THREE.Group|undefined}
     */
    getSensorGroup(sensorId) {
        return this.sensorGroups.get(sensorId);
    }
}
