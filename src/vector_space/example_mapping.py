"""Example configuration for csv_converter.

Copy this file and modify to match your source CSV columns.
"""

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
}
