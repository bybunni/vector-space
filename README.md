# Vector Space - Aerospace Trajectory Visualizer

A browser-based 3D visualizer for aerospace platform trajectories using three.js. Visualize platform positions (NED coordinates), velocities, orientations (Euler angles), and sensors with FOV rendering.

## Features

- **3D Trajectory Visualization**: Real-time playback of platform movements in 3D space
- **NED Coordinate System**: Native support for aerospace North-East-Down coordinates
- **Sensor FOV Rendering**: Visualize sensor fields-of-view with support for:
  - Body-fixed sensors (rotate with platform)
  - Stabilized sensors (horizon-stabilized, gimbal simulation)
- **Interactive Timeline**: Play, pause, scrub, and control playback speed
- **No Build Required**: Runs directly in the browser with no build step or server

## Quick Start

### Running the Application

1. Open `web/index.html` in a modern web browser (Chrome, Firefox, Edge recommended)
2. Click "Load CSV File" to select a trajectory data file
3. Use the timeline controls to play/pause and scrub through the data
4. Use mouse controls to navigate the 3D view:
   - **Left Mouse**: Rotate view
   - **Right Mouse**: Pan view
   - **Scroll**: Zoom in/out

### Test Data

Sample CSV files are provided in `web/data/`:

- **test_straight_line.csv**: Single platform moving north at constant velocity
- **test_turning.csv**: Platform executing a 90° turn
- **test_sensors.csv**: Platform with body-fixed and stabilized sensors, demonstrating pitch changes
- **test_stabilized_gimbal.csv**: Aerobatic maneuvers showing gimbal stabilization
- **test_multi_platform.csv**: Three platforms flying in formation with varying roll angles and mixed sensor types

## CSV Format Specification

### Required Columns (All Rows)

```
timestamp,entity_type,entity_id,platform_id
```

- **timestamp**: ISO 8601 format (e.g., `2024-01-20T10:00:00.000Z`) or Unix epoch milliseconds
- **entity_type**: `platform` or `sensor`
- **entity_id**: Unique identifier (e.g., `platform_001`, `sensor_radar_01`)
- **platform_id**: Self-reference for platforms, parent platform ID for sensors

### Platform Columns

```
pos_north,pos_east,pos_down,vel_north,vel_east,vel_down,roll,pitch,yaw
```

- **pos_north/east/down**: Position in meters (NED coordinates)
- **vel_north/east/down**: Velocity in m/s (NED)
- **roll/pitch/yaw**: Euler angles in degrees (ZYX intrinsic convention)

### Sensor Columns

```
sensor_type,azimuth_fov,elevation_fov,range_min,range_max,mount_roll,mount_pitch,mount_yaw,mount_type
```

- **sensor_type**: `radar`, `camera`, `lidar` (affects color)
- **azimuth/elevation_fov**: Field-of-view in degrees
- **range_min/max**: Range limits in meters
- **mount_roll/pitch/yaw**: Mounting orientation in degrees
- **mount_type**:
  - `body_fixed`: Sensor rotates with platform (all axes coupled)
  - `stabilized`: Gimbal-stabilized (pitch/roll relative to horizon, yaw follows platform)

### Example CSV

```csv
timestamp,entity_type,entity_id,platform_id,pos_north,pos_east,pos_down,vel_north,vel_east,vel_down,roll,pitch,yaw,sensor_type,azimuth_fov,elevation_fov,range_min,range_max,mount_roll,mount_pitch,mount_yaw,mount_type
2024-01-20T10:00:00.000Z,platform,p1,p1,1000,500,-100,50,0,-2,0,5,45,,,,,,,,,
2024-01-20T10:00:00.000Z,sensor,s1,p1,,,,,,,,,,radar,60,40,100,5000,0,-10,0,body_fixed
2024-01-20T10:00:00.000Z,sensor,s2,p1,,,,,,,,,,camera,30,20,50,3000,0,-15,0,stabilized
2024-01-20T10:00:01.000Z,platform,p1,p1,1050,500,-102,50,0,-2,0,5,45,,,,,,,,,
```

## CSV Converter

A Python utility is included to convert arbitrary CSV files to the Vector Space format.

### Installation

Requires Python 3.12+ and pandas:

```bash
# Using uv (recommended)
uv sync

# Or using pip
pip install pandas
```

### Usage

#### With a Python config file (recommended)

1. Copy and edit the example mapping file:

```bash
cp src/vector_space/example_mapping.py my_mapping.py
# Edit my_mapping.py to match your source CSV columns
```

2. Run the converter:

```bash
uv run python -m vector_space.csv_converter input.csv -o output.csv -c my_mapping.py
```

#### With a JSON config file

```bash
uv run python -m vector_space.csv_converter input.csv -o output.csv -c mapping.json
```

#### With command-line arguments

```bash
uv run python -m vector_space.csv_converter input.csv -o output.csv \
  -m "time:timestamp,north:pos_north,east:pos_east,down:pos_down,heading:yaw" \
  --entity-id-column track_id \
  -d "vel_north:0,vel_east:0,vel_down:0,roll:0,pitch:0"
```

#### Programmatic usage

```python
from vector_space.csv_converter import convert

config = {
    "column_mapping": {
        "time": "timestamp",
        "north": "pos_north",
        "east": "pos_east",
        "down": "pos_down",
        "heading": "yaw",
    },
    "entity_id": {"column": "track_id"},
    "defaults": {"roll": 0, "pitch": 0, "vel_north": 0, "vel_east": 0, "vel_down": 0}
}

convert("my_data.csv", "output.csv", config)
```

### Config Options

| Key | Description |
|-----|-------------|
| `column_mapping` | Dict mapping source column names to target names |
| `entity_id` | Either `{"column": "col_name"}` or `{"fixed": "value"}` |
| `defaults` | Default values for missing columns |

### Timestamp Handling

The converter auto-detects timestamp formats:
- Unix epoch (seconds or milliseconds)
- ISO 8601 strings
- Various datetime string formats

All timestamps are converted to ISO 8601 format (`2024-01-20T10:00:00.000Z`).

## Coordinate System

The application uses the aerospace-standard **NED (North-East-Down)** coordinate system:

- **X-axis (North)**: Points north (red)
- **Y-axis (East)**: Points east (blue)
- **Z-axis (Down)**: Points down (positive down)

Internally, coordinates are converted to three.js conventions (Y-up) for rendering.

## Project Structure

```
vector-space/
├── src/
│   └── vector_space/           # Python package
│       ├── csv_converter.py    # CSV format converter
│       ├── example_mapping.py  # Example Python config
│       └── example_mapping.json # Example JSON config
├── web/                        # Browser application
│   ├── index.html             # Main HTML file
│   ├── css/
│   │   └── styles.css         # Application styles
│   ├── js/
│   │   ├── main.js            # Application entry point
│   │   ├── core/
│   │   │   ├── CSVParser.js           # CSV parsing
│   │   │   ├── DataModel.js           # Data structures
│   │   │   ├── CoordinateSystem.js    # NED ↔ three.js conversion
│   │   │   └── TimelineController.js  # Animation/playback
│   │   ├── rendering/
│   │   │   ├── SceneManager.js        # three.js scene setup
│   │   │   ├── PlatformRenderer.js    # Platform visualization
│   │   │   ├── SensorRenderer.js      # Sensor FOV rendering
│   │   │   └── GridRenderer.js        # Ground plane/axes
│   │   └── ui/
│   │       ├── FileUpload.js          # File handling
│   │       └── TimeControls.js        # Playback controls
│   └── data/
│       └── test_*.csv         # Test data files
└── README.md
```

## Technical Details

### Sensor Mount Types

#### Body-Fixed Sensors
Transform composition: `World ← Platform ← Mount`

The sensor rotates with the full platform orientation (roll, pitch, yaw).

#### Stabilized Sensors (Gimbal)
Transform composition: `World ← Platform_Position ← Platform_Yaw_Only ← Mount`

The sensor:
- Follows platform position
- Follows platform yaw (heading)
- Maintains level orientation (ignores platform roll and pitch)
- Mount angles are applied relative to the horizon-level frame

This simulates a gimbal-stabilized sensor that compensates for aircraft attitude.

### Interpolation

- **Position/Velocity**: Linear interpolation (LERP)
- **Orientation**: Spherical linear interpolation (SLERP) using quaternions
- **Frame Rate**: 60 FPS with smooth interpolation between CSV timestamps

### Euler Angle Convention

All Euler angles use the **ZYX intrinsic** (Yaw-Pitch-Roll) convention:
1. Yaw (ψ) about Z-axis (Down)
2. Pitch (θ) about Y-axis (East)
3. Roll (φ) about X-axis (North)

## Browser Compatibility

Requires a modern browser with ES6 module support:
- Chrome 61+
- Firefox 60+
- Safari 11+
- Edge 16+

## Dependencies

- **three.js r160**: Loaded via CDN (no installation required)
- **OrbitControls**: Included with three.js

## License

MIT License

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Future Enhancements

- LLA coordinate input (lat/lon/alt with reference point)
- Quaternion orientation input support
- 3D platform models (GLTF aircraft)
- Terrain rendering (DEM integration)
- Real-time data streaming via WebSocket
- Sensor visibility analysis (line-of-sight, terrain masking)
- Advanced gimbal modes (roll-only stabilization, target tracking)
