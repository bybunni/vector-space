import * as THREE from 'three';

/**
 * CoordinateSystem.js
 *
 * Handles conversions between NED (North-East-Down) aerospace coordinates
 * and three.js world coordinates.
 *
 * NED Coordinate System (Aerospace Standard):
 *   X-axis: North
 *   Y-axis: East
 *   Z-axis: Down
 *
 * three.js Coordinate System (Right-handed, Y-up):
 *   X-axis: North (maps to NED X)
 *   Y-axis: Up (maps to NED -Z)
 *   Z-axis: East (maps to NED Y)
 *
 * Transformation: (N, E, D) → (N, -D, E)
 */

export class CoordinateSystem {
    /**
     * Convert NED position to three.js position
     * @param {number} north - North position in meters
     * @param {number} east - East position in meters
     * @param {number} down - Down position in meters (positive is down)
     * @returns {THREE.Vector3} three.js position vector
     */
    static nedToThreePosition(north, east, down) {
        return new THREE.Vector3(north, -down, east);
    }

    /**
     * Convert three.js position to NED position
     * @param {THREE.Vector3} position - three.js position vector
     * @returns {Object} NED position {north, east, down}
     */
    static threeToNedPosition(position) {
        return {
            north: position.x,
            east: position.z,
            down: -position.y
        };
    }

    /**
     * Convert NED velocity vector to three.js velocity vector
     * @param {number} velNorth - North velocity in m/s
     * @param {number} velEast - East velocity in m/s
     * @param {number} velDown - Down velocity in m/s (positive is down)
     * @returns {THREE.Vector3} three.js velocity vector
     */
    static nedToThreeVelocity(velNorth, velEast, velDown) {
        return new THREE.Vector3(velNorth, -velDown, velEast);
    }

    /**
     * Convert NED Euler angles (ZYX intrinsic) to three.js quaternion
     *
     * NED Euler Convention (ZYX intrinsic / Yaw-Pitch-Roll):
     *   1. Yaw (ψ) about Z-axis (Down)
     *   2. Pitch (θ) about Y-axis (East)
     *   3. Roll (φ) about X-axis (North)
     *
     * three.js uses Y-up, so we need to transform the rotation.
     *
     * @param {number} roll - Roll angle in degrees (rotation about North axis)
     * @param {number} pitch - Pitch angle in degrees (rotation about East axis)
     * @param {number} yaw - Yaw angle in degrees (rotation about Down axis)
     * @returns {THREE.Quaternion} three.js quaternion
     */
    static nedEulerToQuaternion(roll, pitch, yaw) {
        // Convert degrees to radians
        const rollRad = THREE.MathUtils.degToRad(roll);
        const pitchRad = THREE.MathUtils.degToRad(pitch);
        const yawRad = THREE.MathUtils.degToRad(yaw);

        // Create Euler in NED frame (ZYX intrinsic order)
        // In NED: X=North, Y=East, Z=Down
        // We need to convert this to three.js frame where X=North, Y=Up, Z=East

        // Method: Create rotation matrices and transform them
        // NED rotation: R_ned = Rz(yaw) * Ry(pitch) * Rx(roll)

        // For the transformation to three.js coordinates:
        // We need to account for the axis swap: (N, E, D) → (N, -D, E)
        // This means: NED_X → Three_X, NED_Y → Three_Z, NED_Z → -Three_Y

        // Create quaternion from NED Euler angles
        // three.js Euler uses Y-up convention, so we need to remap:
        // - NED yaw (around Z-down) becomes rotation around -Y (up)
        // - NED pitch (around Y-east) becomes rotation around Z
        // - NED roll (around X-north) stays rotation around X

        // Create Euler with remapped axes for three.js
        // Order in three.js: 'YZX' to match NED's ZYX when accounting for axis swap
        const euler = new THREE.Euler(
            rollRad,      // Roll around X (North) - same in both systems
            -yawRad,      // Yaw around -Y (Up in three.js, was Down in NED)
            pitchRad,     // Pitch around Z (East in three.js, was East in NED)
            'YZX'         // Apply Y, then Z, then X
        );

        const quaternion = new THREE.Quaternion();
        quaternion.setFromEuler(euler);

        return quaternion;
    }

    /**
     * Convert three.js quaternion to NED Euler angles
     * @param {THREE.Quaternion} quaternion - three.js quaternion
     * @returns {Object} NED Euler angles {roll, pitch, yaw} in degrees
     */
    static quaternionToNedEuler(quaternion) {
        const euler = new THREE.Euler();
        euler.setFromQuaternion(quaternion, 'YZX');

        return {
            roll: THREE.MathUtils.radToDeg(euler.x),
            pitch: THREE.MathUtils.radToDeg(euler.z),
            yaw: THREE.MathUtils.radToDeg(-euler.y)
        };
    }

    /**
     * Create a rotation matrix from NED Euler angles
     * @param {number} roll - Roll in degrees
     * @param {number} pitch - Pitch in degrees
     * @param {number} yaw - Yaw in degrees
     * @returns {THREE.Matrix4} Rotation matrix for three.js
     */
    static nedEulerToMatrix(roll, pitch, yaw) {
        const quaternion = this.nedEulerToQuaternion(roll, pitch, yaw);
        const matrix = new THREE.Matrix4();
        matrix.makeRotationFromQuaternion(quaternion);
        return matrix;
    }

    /**
     * Compose a transform matrix from position and orientation
     * @param {THREE.Vector3} position - Position in three.js coordinates
     * @param {THREE.Quaternion} quaternion - Orientation as quaternion
     * @returns {THREE.Matrix4} Transform matrix
     */
    static composeTransform(position, quaternion) {
        const matrix = new THREE.Matrix4();
        matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
        return matrix;
    }

    /**
     * Interpolate between two quaternions
     * @param {THREE.Quaternion} q1 - Start quaternion
     * @param {THREE.Quaternion} q2 - End quaternion
     * @param {number} t - Interpolation factor (0 to 1)
     * @returns {THREE.Quaternion} Interpolated quaternion
     */
    static slerpQuaternions(q1, q2, t) {
        const result = new THREE.Quaternion();
        result.slerpQuaternions(q1, q2, t);
        return result;
    }

    /**
     * Linear interpolation between two vectors
     * @param {THREE.Vector3} v1 - Start vector
     * @param {THREE.Vector3} v2 - End vector
     * @param {number} t - Interpolation factor (0 to 1)
     * @returns {THREE.Vector3} Interpolated vector
     */
    static lerpVectors(v1, v2, t) {
        const result = new THREE.Vector3();
        result.lerpVectors(v1, v2, t);
        return result;
    }
}
