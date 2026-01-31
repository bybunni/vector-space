import { Platform, PlatformState, Sensor, SimulationData } from './DataModel.js';

/**
 * CSVParser.js
 *
 * Parses CSV files containing platform and sensor data.
 */

export class CSVParser {
    static STANDARD_COLUMNS = new Set([
        'timestamp', 'entity_type', 'entity_id', 'platform_id',
        'pos_north', 'pos_east', 'pos_down',
        'vel_north', 'vel_east', 'vel_down',
        'roll', 'pitch', 'yaw',
        'sensor_type', 'azimuth_fov', 'elevation_fov',
        'range_min', 'range_max',
        'mount_roll', 'mount_pitch', 'mount_yaw', 'mount_type'
    ]);

    /**
     * Parse CSV text into SimulationData
     * @param {string} csvText - Raw CSV text
     * @returns {SimulationData} Parsed simulation data
     * @throws {Error} If CSV format is invalid
     */
    static parse(csvText) {
        const lines = csvText.trim().split('\n');

        if (lines.length < 2) {
            throw new Error('CSV file is empty or has no data rows');
        }

        // Parse header
        const header = this.parseCSVLine(lines[0]);
        const columnMap = this.buildColumnMap(header);

        // Validate required columns
        this.validateColumns(columnMap);

        // Detect custom (non-standard) columns
        const customColumnNames = [];
        for (const name of columnMap.keys()) {
            if (!this.STANDARD_COLUMNS.has(name)) {
                customColumnNames.push(name);
            }
        }

        // Parse data rows
        const simData = new SimulationData();

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.length === 0) {
                continue; // Skip empty lines
            }

            try {
                const values = this.parseCSVLine(line);
                const row = this.mapRowToObject(values, columnMap);

                if (row.entity_type === 'platform') {
                    this.parsePlatformRow(row, simData, customColumnNames);
                } else if (row.entity_type === 'sensor') {
                    this.parseSensorRow(row, simData);
                } else {
                    console.warn(`Unknown entity_type at line ${i + 1}: ${row.entity_type}`);
                }
            } catch (error) {
                throw new Error(`Error parsing line ${i + 1}: ${error.message}`);
            }
        }

        // Finalize data (sort, link sensors to platforms, etc.)
        simData.finalize();

        // Store custom column names
        simData.setCustomColumnNames(customColumnNames);

        return simData;
    }

    /**
     * Parse a single CSV line, handling quoted values
     * @param {string} line - CSV line
     * @returns {Array<string>} Array of values
     */
    static parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        values.push(current.trim());
        return values;
    }

    /**
     * Build column name to index mapping
     * @param {Array<string>} header - Header row values
     * @returns {Map<string, number>} Column name to index map
     */
    static buildColumnMap(header) {
        const map = new Map();
        header.forEach((name, index) => {
            map.set(name.trim(), index);
        });
        return map;
    }

    /**
     * Validate that required columns are present
     * @param {Map<string, number>} columnMap
     * @throws {Error} If required columns are missing
     */
    static validateColumns(columnMap) {
        const required = ['timestamp', 'entity_type', 'entity_id', 'platform_id'];

        for (const col of required) {
            if (!columnMap.has(col)) {
                throw new Error(`Required column missing: ${col}`);
            }
        }
    }

    /**
     * Map CSV row values to object using column map
     * @param {Array<string>} values - Row values
     * @param {Map<string, number>} columnMap - Column mapping
     * @returns {Object} Row object
     */
    static mapRowToObject(values, columnMap) {
        const row = {};

        for (const [name, index] of columnMap) {
            const value = values[index];
            row[name] = (value === undefined || value === '') ? null : value;
        }

        return row;
    }

    /**
     * Parse timestamp string to Unix epoch milliseconds
     * @param {string} timestampStr - ISO 8601 or Unix epoch string
     * @returns {number} Unix epoch milliseconds
     */
    static parseTimestamp(timestampStr) {
        // Try parsing as ISO 8601
        const date = new Date(timestampStr);
        if (!isNaN(date.getTime())) {
            return date.getTime();
        }

        // Try parsing as Unix epoch (seconds or milliseconds)
        const num = parseFloat(timestampStr);
        if (!isNaN(num)) {
            // If less than 1e12, assume seconds; otherwise milliseconds
            return num < 1e12 ? num * 1000 : num;
        }

        throw new Error(`Invalid timestamp: ${timestampStr}`);
    }

    /**
     * Parse platform row and add to simulation data
     * @param {Object} row - Row data
     * @param {SimulationData} simData - Simulation data container
     * @param {Array<string>} customColumnNames - Extra column names to extract
     */
    static parsePlatformRow(row, simData, customColumnNames = []) {
        const entityId = row.entity_id;

        // Get or create platform
        let platform = simData.getPlatform(entityId);
        if (!platform) {
            platform = new Platform(entityId);
            simData.addPlatform(platform);
        }

        // Extract custom field values
        const customFields = {};
        for (const name of customColumnNames) {
            const raw = row[name];
            if (raw === null || raw === undefined || raw === '') continue;
            const num = parseFloat(raw);
            customFields[name] = isNaN(num) ? raw : num;
        }

        // Create platform state
        const state = new PlatformState({
            timestamp: this.parseTimestamp(row.timestamp),
            pos_north: this.parseFloat(row.pos_north, 'pos_north'),
            pos_east: this.parseFloat(row.pos_east, 'pos_east'),
            pos_down: this.parseFloat(row.pos_down, 'pos_down'),
            vel_north: this.parseFloat(row.vel_north, 'vel_north'),
            vel_east: this.parseFloat(row.vel_east, 'vel_east'),
            vel_down: this.parseFloat(row.vel_down, 'vel_down'),
            roll: this.parseFloat(row.roll, 'roll'),
            pitch: this.parseFloat(row.pitch, 'pitch'),
            yaw: this.parseFloat(row.yaw, 'yaw'),
            customFields: customFields
        });

        platform.addState(state);
    }

    /**
     * Parse sensor row and add to simulation data
     * @param {Object} row - Row data
     * @param {SimulationData} simData - Simulation data container
     */
    static parseSensorRow(row, simData) {
        const entityId = row.entity_id;

        // Sensors are static (don't change over time), so only parse once
        if (simData.getSensor(entityId)) {
            return; // Already parsed
        }

        const sensor = new Sensor({
            entity_id: entityId,
            platform_id: row.platform_id,
            sensor_type: row.sensor_type,
            azimuth_fov: this.parseFloat(row.azimuth_fov, 'azimuth_fov'),
            elevation_fov: this.parseFloat(row.elevation_fov, 'elevation_fov'),
            range_min: this.parseFloat(row.range_min, 'range_min'),
            range_max: this.parseFloat(row.range_max, 'range_max'),
            mount_roll: this.parseFloat(row.mount_roll, 'mount_roll', 0),
            mount_pitch: this.parseFloat(row.mount_pitch, 'mount_pitch', 0),
            mount_yaw: this.parseFloat(row.mount_yaw, 'mount_yaw', 0),
            mount_type: row.mount_type || 'body_fixed'
        });

        simData.addSensor(sensor);
    }

    /**
     * Parse float value with error checking
     * @param {string|null} value - String value
     * @param {string} fieldName - Field name for error messages
     * @param {number} defaultValue - Default value if null/empty
     * @returns {number} Parsed float
     */
    static parseFloat(value, fieldName, defaultValue = null) {
        if (value === null || value === '') {
            if (defaultValue !== null) {
                return defaultValue;
            }
            throw new Error(`Missing required field: ${fieldName}`);
        }

        const num = parseFloat(value);
        if (isNaN(num)) {
            throw new Error(`Invalid number for ${fieldName}: ${value}`);
        }

        return num;
    }
}
