import * as THREE from 'three';
import { CoordinateSystem } from './CoordinateSystem.js';

/**
 * DataModel.js
 *
 * Defines the data structures for platforms and sensors.
 */

/**
 * Represents a platform state at a specific timestamp
 */
export class PlatformState {
    constructor(data) {
        this.timestamp = data.timestamp; // Unix epoch milliseconds

        // NED position (meters)
        this.posNorth = data.pos_north;
        this.posEast = data.pos_east;
        this.posDown = data.pos_down;

        // NED velocity (m/s)
        this.velNorth = data.vel_north;
        this.velEast = data.vel_east;
        this.velDown = data.vel_down;

        // Euler angles (degrees, ZYX intrinsic)
        this.roll = data.roll;
        this.pitch = data.pitch;
        this.yaw = data.yaw;

        // Custom fields from extra CSV columns
        this.customFields = data.customFields || {};

        // Lazy-computed quaternion
        this._quaternion = null;
    }

    /**
     * Get orientation as quaternion (lazy computation)
     * @returns {THREE.Quaternion}
     */
    getQuaternion() {
        if (!this._quaternion) {
            this._quaternion = CoordinateSystem.nedEulerToQuaternion(
                this.roll,
                this.pitch,
                this.yaw
            );
        }
        return this._quaternion.clone();
    }

    /**
     * Get position as three.js Vector3
     * @returns {THREE.Vector3}
     */
    getPosition() {
        return CoordinateSystem.nedToThreePosition(
            this.posNorth,
            this.posEast,
            this.posDown
        );
    }

    /**
     * Get velocity as three.js Vector3
     * @returns {THREE.Vector3}
     */
    getVelocity() {
        return CoordinateSystem.nedToThreeVelocity(
            this.velNorth,
            this.velEast,
            this.velDown
        );
    }

    /**
     * Get roll angle in degrees, extracted from quaternion if interpolated
     * @returns {number} Roll angle in degrees
     */
    getRoll() {
        // If we have a pre-computed quaternion (interpolated state), extract roll from it
        if (this._quaternion) {
            // Extract Euler angles from quaternion using same order as nedEulerToQuaternion
            // The quaternion was created with 'YZX' order: (rollRad, -yawRad, pitchRad)
            const euler = new THREE.Euler().setFromQuaternion(this._quaternion, 'YZX');
            // X component is roll
            return THREE.MathUtils.radToDeg(euler.x);
        }
        // Otherwise return the raw roll value
        return this.roll;
    }
}

/**
 * Represents a platform with state history
 */
export class Platform {
    constructor(entityId) {
        this.entityId = entityId;
        this.states = []; // Array of PlatformState, sorted by timestamp
        this.sensors = []; // Array of Sensor objects attached to this platform
    }

    /**
     * Add a state to this platform
     * @param {PlatformState} state
     */
    addState(state) {
        this.states.push(state);
    }

    /**
     * Sort states by timestamp (call after all states are added)
     */
    sortStates() {
        this.states.sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Get state at specific time with interpolation
     * @param {number} timestamp - Unix epoch milliseconds
     * @returns {PlatformState|null} Interpolated state or null if out of range
     */
    getStateAtTime(timestamp) {
        if (this.states.length === 0) {
            return null;
        }

        // Clamp to available time range
        if (timestamp <= this.states[0].timestamp) {
            return this.states[0];
        }
        if (timestamp >= this.states[this.states.length - 1].timestamp) {
            return this.states[this.states.length - 1];
        }

        // Binary search for bounding states
        let left = 0;
        let right = this.states.length - 1;

        while (right - left > 1) {
            const mid = Math.floor((left + right) / 2);
            if (this.states[mid].timestamp <= timestamp) {
                left = mid;
            } else {
                right = mid;
            }
        }

        const state1 = this.states[left];
        const state2 = this.states[right];

        // Interpolation factor
        const t = (timestamp - state1.timestamp) / (state2.timestamp - state1.timestamp);

        // Create interpolated state
        const interpolated = new PlatformState({
            timestamp: timestamp,
            pos_north: state1.posNorth + t * (state2.posNorth - state1.posNorth),
            pos_east: state1.posEast + t * (state2.posEast - state1.posEast),
            pos_down: state1.posDown + t * (state2.posDown - state1.posDown),
            vel_north: state1.velNorth + t * (state2.velNorth - state1.velNorth),
            vel_east: state1.velEast + t * (state2.velEast - state1.velEast),
            vel_down: state1.velDown + t * (state2.velDown - state1.velDown),
            roll: 0, // Will use quaternion SLERP instead
            pitch: 0,
            yaw: 0
        });

        // SLERP for orientation
        const q1 = state1.getQuaternion();
        const q2 = state2.getQuaternion();
        interpolated._quaternion = CoordinateSystem.slerpQuaternions(q1, q2, t);

        // Interpolate custom fields
        const allKeys = new Set([
            ...Object.keys(state1.customFields),
            ...Object.keys(state2.customFields)
        ]);
        for (const key of allKeys) {
            const v1 = state1.customFields[key];
            const v2 = state2.customFields[key];
            if (typeof v1 === 'number' && typeof v2 === 'number') {
                interpolated.customFields[key] = v1 + t * (v2 - v1);
            } else {
                interpolated.customFields[key] = v1 !== undefined ? v1 : v2;
            }
        }

        return interpolated;
    }

    /**
     * Get earliest timestamp
     * @returns {number|null}
     */
    getStartTime() {
        return this.states.length > 0 ? this.states[0].timestamp : null;
    }

    /**
     * Get latest timestamp
     * @returns {number|null}
     */
    getEndTime() {
        return this.states.length > 0 ? this.states[this.states.length - 1].timestamp : null;
    }

    /**
     * Attach a sensor to this platform
     * @param {Sensor} sensor
     */
    addSensor(sensor) {
        this.sensors.push(sensor);
    }
}

/**
 * Represents a sensor with static configuration
 */
export class Sensor {
    constructor(data) {
        this.entityId = data.entity_id;
        this.platformId = data.platform_id;
        this.sensorType = data.sensor_type; // 'radar', 'camera', 'lidar'

        // Field of view (degrees)
        this.azimuthFov = data.azimuth_fov;
        this.elevationFov = data.elevation_fov;

        // Range limits (meters)
        this.rangeMin = data.range_min;
        this.rangeMax = data.range_max;

        // Mount orientation (degrees, relative to platform body frame)
        this.mountRoll = data.mount_roll;
        this.mountPitch = data.mount_pitch;
        this.mountYaw = data.mount_yaw;

        // Mount type: 'body_fixed' or 'stabilized'
        this.mountType = data.mount_type;

        // Reference to parent platform (set after parsing)
        this.platform = null;

        // Lazy-computed mount quaternion
        this._mountQuaternion = null;
    }

    /**
     * Get mount orientation as quaternion
     * @returns {THREE.Quaternion}
     */
    getMountQuaternion() {
        if (!this._mountQuaternion) {
            this._mountQuaternion = CoordinateSystem.nedEulerToQuaternion(
                this.mountRoll,
                this.mountPitch,
                this.mountYaw
            );
        }
        return this._mountQuaternion.clone();
    }

    /**
     * Set reference to parent platform
     * @param {Platform} platform
     */
    setPlatform(platform) {
        this.platform = platform;
        platform.addSensor(this);
    }

    /**
     * Get sensor color based on type
     * @returns {number} Three.js color
     */
    getColor() {
        switch (this.sensorType) {
            case 'radar':
                return 0x00ff00; // Green
            case 'camera':
                return 0x0088ff; // Blue
            case 'lidar':
                return 0xff8800; // Orange
            default:
                return 0xffff00; // Yellow
        }
    }
}

/**
 * Container for all simulation data
 */
export class SimulationData {
    constructor() {
        this.platforms = new Map(); // entityId -> Platform
        this.sensors = new Map();   // entityId -> Sensor
        this.timestamps = [];        // Sorted array of unique timestamps
        this.customColumnNames = []; // Extra CSV column names beyond standard fields
    }

    /**
     * Set custom column names discovered during CSV parsing
     * @param {Array<string>} names
     */
    setCustomColumnNames(names) {
        this.customColumnNames = names;
    }

    /**
     * Add a platform
     * @param {Platform} platform
     */
    addPlatform(platform) {
        this.platforms.set(platform.entityId, platform);
    }

    /**
     * Add a sensor
     * @param {Sensor} sensor
     */
    addSensor(sensor) {
        this.sensors.set(sensor.entityId, sensor);
    }

    /**
     * Get platform by ID
     * @param {string} entityId
     * @returns {Platform|undefined}
     */
    getPlatform(entityId) {
        return this.platforms.get(entityId);
    }

    /**
     * Get sensor by ID
     * @param {string} entityId
     * @returns {Sensor|undefined}
     */
    getSensor(entityId) {
        return this.sensors.get(entityId);
    }

    /**
     * Get time range of simulation
     * @returns {Object} {start, end} in Unix epoch milliseconds
     */
    getTimeRange() {
        if (this.timestamps.length === 0) {
            return { start: 0, end: 0 };
        }
        return {
            start: this.timestamps[0],
            end: this.timestamps[this.timestamps.length - 1]
        };
    }

    /**
     * Finalize data after loading (sort states, compute timestamps)
     */
    finalize() {
        // Sort all platform states
        for (const platform of this.platforms.values()) {
            platform.sortStates();
        }

        // Collect and sort unique timestamps
        const timestampSet = new Set();
        for (const platform of this.platforms.values()) {
            for (const state of platform.states) {
                timestampSet.add(state.timestamp);
            }
        }
        this.timestamps = Array.from(timestampSet).sort((a, b) => a - b);

        // Link sensors to platforms
        for (const sensor of this.sensors.values()) {
            const platform = this.platforms.get(sensor.platformId);
            if (platform) {
                sensor.setPlatform(platform);
            } else {
                console.warn(`Sensor ${sensor.entityId} references unknown platform ${sensor.platformId}`);
            }
        }
    }
}
