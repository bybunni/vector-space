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
     * Create FOV pyramid geometry
     * @param {Sensor} sensor
     * @returns {THREE.Mesh}
     */
    createFOVGeometry(sensor) {
        // FOV pyramid points along +X axis (forward)
        const azFovRad = THREE.MathUtils.degToRad(sensor.azimuthFov);
        const elFovRad = THREE.MathUtils.degToRad(sensor.elevationFov);

        const length = sensor.rangeMax;

        // Calculate pyramid dimensions at max range
        const width = 2 * length * Math.tan(azFovRad / 2);
        const height = 2 * length * Math.tan(elFovRad / 2);

        // Create pyramid geometry
        // Apex at origin, opening along +X axis
        const geometry = new THREE.BufferGeometry();

        const vertices = new Float32Array([
            // Apex (origin)
            0, 0, 0,

            // Far rectangle corners (at rangeMax along +X)
            length, height/2, width/2,   // Top-right
            length, height/2, -width/2,  // Top-left
            length, -height/2, -width/2, // Bottom-left
            length, -height/2, width/2,  // Bottom-right
        ]);

        const indices = [
            // Triangular faces from apex to far rectangle
            0, 1, 2,  // Top face
            0, 2, 3,  // Left face
            0, 3, 4,  // Bottom face
            0, 4, 1,  // Right face

            // Far rectangle (two triangles)
            1, 2, 3,
            1, 3, 4
        ];

        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        // Material (semi-transparent, color-coded by sensor type)
        const color = sensor.getColor();
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);

        // Add wireframe for clarity
        const wireframeGeometry = new THREE.EdgesGeometry(geometry);
        const wireframeMaterial = new THREE.LineBasicMaterial({ color: color });
        const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
        mesh.add(wireframe);

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
