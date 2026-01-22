"""Example configuration for csv_converter.

Copy this file and modify to match your source CSV columns.
"""

# =============================================================================
# SINGLE HEADER EXAMPLE (default)
# =============================================================================
# Use this for CSVs with a single header row like:
#   time,track_id,north,east,down,heading
#   1705746000,ship1,0,0,-50,45

config = {
    # Map source column names to target column names
    # Only include columns that exist in your source CSV
    "column_mapping": {
        "time": "timestamp",        # or "t", "epoch", "datetime", etc.
        "north": "pos_north",       # or "n", "x", "lat_m", etc.
        "east": "pos_east",         # or "e", "y", "lon_m", etc.
        "down": "pos_down",         # or "d", "z", "alt" (note: down is positive)
        "vn": "vel_north",          # or "vel_n", "vx", etc.
        "ve": "vel_east",           # or "vel_e", "vy", etc.
        "vd": "vel_down",           # or "vel_d", "vz", etc.
        "heading": "yaw",           # or "hdg", "psi", "azimuth", etc.
        "bank": "roll",             # or "phi", "roll_angle", etc.
        "elevation": "pitch",       # or "theta", "pitch_angle", etc.
    },

    # Entity ID configuration - choose one:
    # Option 1: Use a column from your source CSV
    "entity_id": {"column": "track_id"},
    # Option 2: Use a fixed value for all rows
    # "entity_id": {"fixed": "platform_1"},

    # Default values for columns not in your source CSV
    # These will be used if the target column is missing after mapping
    "defaults": {
        "vel_north": 0.0,
        "vel_east": 0.0,
        "vel_down": 0.0,
        "roll": 0.0,
        "pitch": 0.0,
        "yaw": 0.0,
    },
    # Optional: Define sensors to attach to platforms
    # Useful when source CSV has no sensor data
    # "sensors": {
    #     "platform_1": [  # platform_id -> list of sensors
    #         {
    #             "entity_id": "radar_1",
    #             "sensor_type": "radar",
    #             "azimuth_fov": 60,
    #             "elevation_fov": 40,
    #             "range_min": 100,
    #             "range_max": 800,
    #             "mount_roll": 0,
    #             "mount_pitch": -15,
    #             "mount_yaw": 0,
    #             "mount_type": "body_fixed",
    #         },
    #     ],
    # },
}


# =============================================================================
# DOUBLE HEADER EXAMPLE (MultiIndex columns)
# =============================================================================
# Use this for CSVs with two header rows like:
#   Time,Position,Position,Position,Velocity,Velocity,Velocity
#   Seconds,North,East,Down,North,East,Down
#   1705746000,0,0,-50,10,5,0

# config = {
#     # Set header_rows to 2 for double headers
#     "header_rows": 2,
#
#     # Map using tuples: (row1_value, row2_value)
#     "column_mapping": {
#         ("Time", "Seconds"): "timestamp",
#         ("Position", "North"): "pos_north",
#         ("Position", "East"): "pos_east",
#         ("Position", "Down"): "pos_down",
#         ("Velocity", "North"): "vel_north",
#         ("Velocity", "East"): "vel_east",
#         ("Velocity", "Down"): "vel_down",
#         ("Orientation", "Heading"): "yaw",
#         ("Orientation", "Bank"): "roll",
#         ("Orientation", "Pitch"): "pitch",
#     },
#
#     # Entity ID can also use tuple for double header columns
#     # "entity_id": {"column": ("Meta", "TrackID")},
#     "entity_id": {"fixed": "platform_1"},
#
#     "defaults": {
#         "roll": 0.0,
#         "pitch": 0.0,
#         "yaw": 0.0,
#     },
# }
