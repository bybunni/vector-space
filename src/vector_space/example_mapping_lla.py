"""Example configuration for csv_converter with LLA input coordinates.

Use this for CSVs where position is in LLA (Latitude/Longitude/Altitude) format.
Lat/lon must be in radians, altitude in meters.

The converter will transform LLA positions to NED (North/East/Down) coordinates
relative to a reference point.
"""

# =============================================================================
# LLA INPUT EXAMPLE
# =============================================================================
# Use this for CSVs with position in LLA format like:
#   time,track_id,lat,lon,alt,vn,ve,vd,heading
#   1705746000,ship1,0.6981,0.0175,100,10,5,0,45
#
# Note: lat/lon are in RADIANS, altitude in meters

config = {
    # Coordinate system: "lla" for lat/lon/alt input (radians/meters)
    "coordinate_system": "lla",

    # Angle units: "degrees" (default) or "radians"
    # Set to "radians" if your input angles (roll, pitch, yaw) are in radians
    # "angle_units": "radians",

    # Map source column names to target column names
    # For LLA input, map to pos_lat, pos_lon, pos_alt (intermediate columns)
    "column_mapping": {
        "time": "timestamp",
        "lat": "pos_lat",           # latitude in radians
        "lon": "pos_lon",           # longitude in radians
        "alt": "pos_alt",           # altitude in meters (above WGS84 ellipsoid)
        "vn": "vel_north",          # velocity already in NED (m/s)
        "ve": "vel_east",
        "vd": "vel_down",
        "heading": "yaw",
        "bank": "roll",
        "elevation": "pitch",
    },

    # Reference point for NED origin
    # Option 1: Use first data point as reference (origin at first position)
    "lla_reference": "first",

    # Option 2: Use explicit coordinates (in radians/meters)
    # "lla_reference": {
    #     "lat": 0.6981317,   # ~40 degrees in radians
    #     "lon": -1.2217305,  # ~-70 degrees in radians
    #     "alt": 0.0,         # meters
    # },

    # Entity ID configuration
    "entity_id": {"column": "track_id"},

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


# =============================================================================
# LLA WITH DOUBLE HEADER EXAMPLE
# =============================================================================
# Use this for CSVs with two header rows and LLA coordinates like:
#   Time,Position,Position,Position,Velocity,Velocity,Velocity
#   Seconds,Lat,Lon,Alt,North,East,Down
#   1705746000,0.6981,0.0175,100,10,5,0

# config = {
#     "header_rows": 2,
#     "coordinate_system": "lla",
#
#     "column_mapping": {
#         ("Time", "Seconds"): "timestamp",
#         ("Position", "Lat"): "pos_lat",      # radians
#         ("Position", "Lon"): "pos_lon",      # radians
#         ("Position", "Alt"): "pos_alt",      # meters
#         ("Velocity", "North"): "vel_north",
#         ("Velocity", "East"): "vel_east",
#         ("Velocity", "Down"): "vel_down",
#     },
#
#     "lla_reference": "first",
#
#     "entity_id": {"fixed": "platform_1"},
#
#     "defaults": {
#         "roll": 0.0,
#         "pitch": 0.0,
#         "yaw": 0.0,
#     },
# }
