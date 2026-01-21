"""Example configuration for csv_converter with double header LLA CSVs.

Use this for CSVs with two header rows (category + sub-category) and LLA coordinates, e.g.:

    Time,Position,Position,Position,Velocity,Velocity,Velocity,Orientation,Orientation,Orientation
    Seconds,Lat,Lon,Alt,North,East,Down,Heading,Bank,Pitch
    1705746000,0.6981317,-1.2217305,1000,150,20,0,90,0,0
    1705746001,0.6981467,-1.2217105,1010,152,22,-0.5,91,1,0.5

Note: Lat/Lon must be in RADIANS, Alt in METERS above WGS84 ellipsoid.

The converter will transform LLA positions to NED (North/East/Down) coordinates
relative to a reference point.

Copy this file and modify to match your source CSV columns.
"""

config = {
    # Set header_rows to 2 for double headers
    "header_rows": 2,

    # Coordinate system: "lla" for lat/lon/alt input (radians/meters)
    "coordinate_system": "lla",

    # Angle units: "degrees" (default) or "radians"
    # Set to "radians" if your input angles (roll, pitch, yaw) are in radians
    # "angle_units": "radians",

    # Map source columns to target columns using tuples: (row1_value, row2_value)
    # For LLA input, map position columns to pos_lat, pos_lon, pos_alt (intermediate)
    # These will be converted to pos_north, pos_east, pos_down automatically
    "column_mapping": {
        ("Time", "Seconds"): "timestamp",
        ("Position", "Lat"): "pos_lat",      # latitude in radians
        ("Position", "Lon"): "pos_lon",      # longitude in radians
        ("Position", "Alt"): "pos_alt",      # altitude in meters (above WGS84)
        ("Velocity", "North"): "vel_north",  # velocity already in NED (m/s)
        ("Velocity", "East"): "vel_east",
        ("Velocity", "Down"): "vel_down",
        ("Orientation", "Heading"): "yaw",
        ("Orientation", "Bank"): "roll",
        ("Orientation", "Pitch"): "pitch",
    },

    # Reference point for NED origin - choose one:
    # Option 1: Use first data point as reference (origin at first position)
    "lla_reference": "first",

    # Option 2: Use explicit coordinates (in radians/meters)
    # "lla_reference": {
    #     "lat": 0.6981317,   # ~40 degrees in radians
    #     "lon": -1.2217305,  # ~-70 degrees in radians
    #     "alt": 0.0,         # meters above WGS84 ellipsoid
    # },

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
