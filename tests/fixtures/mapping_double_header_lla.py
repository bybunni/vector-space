"""Python mapping config for double header LLA CSV."""

config = {
    "header_rows": 2,
    "coordinate_system": "lla",
    "column_mapping": {
        ("Time", "Seconds"): "timestamp",
        ("Position", "Lat"): "pos_lat",
        ("Position", "Lon"): "pos_lon",
        ("Position", "Alt"): "pos_alt",
        ("Velocity", "North"): "vel_north",
        ("Velocity", "East"): "vel_east",
        ("Velocity", "Down"): "vel_down",
        ("Attitude", "Roll"): "roll",
        ("Attitude", "Pitch"): "pitch",
        ("Attitude", "Yaw"): "yaw",
    },
    "lla_reference": "first",
    "entity_id": {"column": ("Entity", "ID")},
    "defaults": {},
}
