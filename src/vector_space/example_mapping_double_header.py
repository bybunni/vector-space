"""Example configuration for csv_converter with double header CSVs.

Use this for CSVs with two header rows (category + sub-category), e.g.:

    Time,Position,Position,Position,Velocity,Velocity,Velocity,Orientation,Orientation,Orientation
    Seconds,North,East,Down,North,East,Down,Heading,Bank,Pitch
    1705746000,0,0,-50,10,5,0,45,0,0
    1705746001,10,5,-50,10,5,0,45,0,0

Copy this file and modify to match your source CSV columns.
"""

config = {
    # Set header_rows to 2 for double headers
    "header_rows": 2,

    # Map source columns to target columns using tuples: (row1_value, row2_value)
    # Only include columns that exist in your source CSV
    "column_mapping": {
        ("Time", "Seconds"): "timestamp",
        ("Position", "North"): "pos_north",
        ("Position", "East"): "pos_east",
        ("Position", "Down"): "pos_down",
        ("Velocity", "North"): "vel_north",
        ("Velocity", "East"): "vel_east",
        ("Velocity", "Down"): "vel_down",
        ("Orientation", "Heading"): "yaw",
        ("Orientation", "Bank"): "roll",
        ("Orientation", "Pitch"): "pitch",
    },

    # Entity ID configuration - choose one:
    # Option 1: Use a column from your source CSV (also a tuple for double headers)
    # "entity_id": {"column": ("Meta", "TrackID")},
    # Option 2: Use a fixed value for all rows
    "entity_id": {"fixed": "platform_1"},

    # Default values for columns not in your source CSV
    "defaults": {
        "vel_north": 0.0,
        "vel_east": 0.0,
        "vel_down": 0.0,
        "roll": 0.0,
        "pitch": 0.0,
        "yaw": 0.0,
    },
}
