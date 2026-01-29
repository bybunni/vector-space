import { SimulationData, Platform, Sensor } from './DataModel.js';

/**
 * SimulationMerger.js
 *
 * Merges multiple parsed SimulationData objects into one,
 * resolving platform_id and sensor entity_id conflicts by
 * appending .N suffixes to duplicates.
 */

export class SimulationMerger {
    /**
     * Merge multiple SimulationData entries into a single SimulationData.
     * @param {Array<{simData: SimulationData, fileName: string}>} entries
     * @returns {SimulationData} Merged simulation data
     */
    static merge(entries) {
        if (entries.length === 1) {
            return entries[0].simData;
        }

        const merged = new SimulationData();
        const globalPlatformIds = new Set();
        const globalSensorIds = new Set();

        for (let fileIndex = 0; fileIndex < entries.length; fileIndex++) {
            const { simData } = entries[fileIndex];
            const platformRenameMap = new Map(); // oldId -> newId
            const sensorRenameMap = new Map();   // oldId -> newId

            // Resolve platform ID conflicts
            for (const [oldId, platform] of simData.platforms) {
                const newId = this.resolveId(oldId, globalPlatformIds, fileIndex);
                platformRenameMap.set(oldId, newId);
                globalPlatformIds.add(newId);

                // Create new platform with renamed ID, sharing state references
                const newPlatform = new Platform(newId);
                for (const state of platform.states) {
                    newPlatform.addState(state);
                }
                merged.addPlatform(newPlatform);
            }

            // Resolve sensor ID conflicts and update platform_id references
            for (const [oldId, sensor] of simData.sensors) {
                const newId = this.resolveId(oldId, globalSensorIds, fileIndex);
                sensorRenameMap.set(oldId, newId);
                globalSensorIds.add(newId);

                const newPlatformId = platformRenameMap.get(sensor.platformId) || sensor.platformId;

                const newSensor = new Sensor({
                    entity_id: newId,
                    platform_id: newPlatformId,
                    sensor_type: sensor.sensorType,
                    azimuth_fov: sensor.azimuthFov,
                    elevation_fov: sensor.elevationFov,
                    range_min: sensor.rangeMin,
                    range_max: sensor.rangeMax,
                    mount_roll: sensor.mountRoll,
                    mount_pitch: sensor.mountPitch,
                    mount_yaw: sensor.mountYaw,
                    mount_type: sensor.mountType
                });
                merged.addSensor(newSensor);
            }
        }

        merged.finalize();
        return merged;
    }

    /**
     * Resolve an ID conflict by appending .N suffix if needed.
     * File 0 keeps IDs as-is. Subsequent files get .N where N = fileIndex + 1.
     * If that's still taken, increment N until unique.
     * @param {string} id - Original ID
     * @param {Set<string>} globalIds - Set of already-used IDs
     * @param {number} fileIndex - 0-based file index
     * @returns {string} Unique ID
     */
    static resolveId(id, globalIds, fileIndex) {
        if (!globalIds.has(id)) {
            return id;
        }

        // Start with fileIndex + 1 as suffix, increment if still taken
        let suffix = fileIndex + 1;
        let candidate = `${id}.${suffix}`;
        while (globalIds.has(candidate)) {
            suffix++;
            candidate = `${id}.${suffix}`;
        }
        return candidate;
    }
}
