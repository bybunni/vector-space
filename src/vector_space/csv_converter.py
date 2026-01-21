"""CSV converter for Vector Space visualization format.

Converts arbitrary CSV files to the Vector Space multi-platform CSV format
using user-defined column mappings.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
from pathlib import Path
from typing import Any

import pandas as pd


# WGS84 ellipsoid constants
WGS84_A = 6378137.0  # Semi-major axis (m)
WGS84_E2 = 0.00669437999014  # First eccentricity squared

# Angle columns that may need conversion from radians to degrees
ANGLE_COLUMNS = ["roll", "pitch", "yaw", "mount_roll", "mount_pitch", "mount_yaw"]


# Target column order for output CSV
OUTPUT_COLUMNS = [
    "timestamp",
    "entity_type",
    "entity_id",
    "platform_id",
    "pos_north",
    "pos_east",
    "pos_down",
    "vel_north",
    "vel_east",
    "vel_down",
    "roll",
    "pitch",
    "yaw",
    "sensor_type",
    "azimuth_fov",
    "elevation_fov",
    "range_min",
    "range_max",
    "mount_roll",
    "mount_pitch",
    "mount_yaw",
    "mount_type",
]


def lla_to_ecef(lat: float, lon: float, alt: float) -> tuple[float, float, float]:
    """Convert LLA (geodetic) coordinates to ECEF.

    Args:
        lat: Latitude in radians
        lon: Longitude in radians
        alt: Altitude in meters (above WGS84 ellipsoid)

    Returns:
        Tuple of (X, Y, Z) in meters (ECEF coordinates)
    """
    sin_lat = math.sin(lat)
    cos_lat = math.cos(lat)
    sin_lon = math.sin(lon)
    cos_lon = math.cos(lon)

    # Radius of curvature in the prime vertical
    n = WGS84_A / math.sqrt(1 - WGS84_E2 * sin_lat * sin_lat)

    x = (n + alt) * cos_lat * cos_lon
    y = (n + alt) * cos_lat * sin_lon
    z = (n * (1 - WGS84_E2) + alt) * sin_lat

    return x, y, z


def ecef_to_ned(
    x: float, y: float, z: float, ref_lat: float, ref_lon: float, ref_alt: float
) -> tuple[float, float, float]:
    """Convert ECEF coordinates to NED relative to a reference point.

    Args:
        x: ECEF X coordinate in meters
        y: ECEF Y coordinate in meters
        z: ECEF Z coordinate in meters
        ref_lat: Reference point latitude in radians
        ref_lon: Reference point longitude in radians
        ref_alt: Reference point altitude in meters

    Returns:
        Tuple of (north, east, down) in meters relative to reference point
    """
    # Get reference point in ECEF
    x0, y0, z0 = lla_to_ecef(ref_lat, ref_lon, ref_alt)

    # Delta ECEF
    dx = x - x0
    dy = y - y0
    dz = z - z0

    # Precompute trig values
    sin_lat = math.sin(ref_lat)
    cos_lat = math.cos(ref_lat)
    sin_lon = math.sin(ref_lon)
    cos_lon = math.cos(ref_lon)

    # Rotation from ECEF to NED at reference point
    north = -sin_lat * cos_lon * dx - sin_lat * sin_lon * dy + cos_lat * dz
    east = -sin_lon * dx + cos_lon * dy
    down = -cos_lat * cos_lon * dx - cos_lat * sin_lon * dy - sin_lat * dz

    return north, east, down


def convert_lla_to_ned(
    df: pd.DataFrame, ref_config: dict[str, Any] | str
) -> pd.DataFrame:
    """Convert LLA position columns in DataFrame to NED.

    Expects the DataFrame to have columns: pos_lat, pos_lon, pos_alt (mapped names)
    These will be replaced with: pos_north, pos_east, pos_down

    Args:
        df: DataFrame with LLA columns (lat/lon in radians, alt in meters)
        ref_config: Reference point configuration, either:
            - "first": Use the first data point as reference
            - dict with "lat", "lon", "alt" keys (in radians/meters)

    Returns:
        DataFrame with NED position columns
    """
    # Determine reference point
    if ref_config == "first":
        ref_lat = df["pos_lat"].iloc[0]
        ref_lon = df["pos_lon"].iloc[0]
        ref_alt = df["pos_alt"].iloc[0]
    else:
        ref_lat = ref_config["lat"]
        ref_lon = ref_config["lon"]
        ref_alt = ref_config["alt"]

    # Convert each point
    north_vals = []
    east_vals = []
    down_vals = []

    for _, row in df.iterrows():
        lat = row["pos_lat"]
        lon = row["pos_lon"]
        alt = row["pos_alt"]

        # LLA to ECEF
        x, y, z = lla_to_ecef(lat, lon, alt)

        # ECEF to NED
        n, e, d = ecef_to_ned(x, y, z, ref_lat, ref_lon, ref_alt)

        north_vals.append(n)
        east_vals.append(e)
        down_vals.append(d)

    # Replace LLA columns with NED columns
    df["pos_north"] = north_vals
    df["pos_east"] = east_vals
    df["pos_down"] = down_vals

    # Remove original LLA columns
    df = df.drop(columns=["pos_lat", "pos_lon", "pos_alt"])

    return df


def convert_angles_to_degrees(df: pd.DataFrame) -> pd.DataFrame:
    """Convert angle columns from radians to degrees.

    Converts any of the standard angle columns (roll, pitch, yaw, mount_roll,
    mount_pitch, mount_yaw) that exist in the DataFrame from radians to degrees.

    Args:
        df: DataFrame with angle columns in radians

    Returns:
        DataFrame with angle columns converted to degrees
    """
    for col in ANGLE_COLUMNS:
        if col in df.columns:
            # Only convert numeric columns
            if pd.api.types.is_numeric_dtype(df[col]):
                df[col] = df[col].apply(lambda x: math.degrees(x) if pd.notna(x) else x)
    return df


def flatten_multiindex_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Flatten MultiIndex columns to single level using tuple representation.

    Args:
        df: DataFrame with MultiIndex columns

    Returns:
        DataFrame with flattened column names as tuples
    """
    if isinstance(df.columns, pd.MultiIndex):
        # Keep columns as tuples for mapping
        df.columns = [tuple(col) for col in df.columns]
    return df


def apply_column_mapping(
    df: pd.DataFrame, mapping: dict[str | tuple, str]
) -> pd.DataFrame:
    """Rename source columns to target columns based on mapping.

    Args:
        df: Input DataFrame
        mapping: Dict mapping source column names (str or tuple) to target column names

    Returns:
        DataFrame with renamed columns
    """
    rename_map = {}
    for src, dst in mapping.items():
        # Handle tuple keys for multi-level headers
        if isinstance(src, (list, tuple)):
            src = tuple(src)
        if src in df.columns:
            rename_map[src] = dst
    return df.rename(columns=rename_map)


def apply_defaults(df: pd.DataFrame, defaults: dict[str, Any]) -> pd.DataFrame:
    """Fill missing target columns with default values.

    Args:
        df: Input DataFrame
        defaults: Dict mapping target column names to default values

    Returns:
        DataFrame with defaults applied
    """
    for col, default_value in defaults.items():
        if col not in df.columns:
            df[col] = default_value
        else:
            df[col] = df[col].fillna(default_value)
    return df


def parse_timestamp(ts_series: pd.Series) -> pd.Series:
    """Parse timestamps and convert to ISO 8601 format.

    Handles:
    - Unix timestamps (seconds or milliseconds)
    - ISO 8601 strings
    - Various datetime string formats

    Args:
        ts_series: Series containing timestamp values

    Returns:
        Series with ISO 8601 formatted timestamp strings
    """
    sample = ts_series.dropna().iloc[0] if len(ts_series.dropna()) > 0 else None

    if sample is None:
        return ts_series

    # Check if already datetime
    if pd.api.types.is_datetime64_any_dtype(ts_series):
        return ts_series.dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")

    # Try numeric (Unix timestamp)
    if pd.api.types.is_numeric_dtype(ts_series):
        # Check if milliseconds (> year 2000 in ms)
        if sample > 1e12:
            parsed = pd.to_datetime(ts_series, unit="ms", utc=True)
        else:
            parsed = pd.to_datetime(ts_series, unit="s", utc=True)
        return parsed.dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")

    # Try parsing as string
    try:
        parsed = pd.to_datetime(ts_series, utc=True)
        return parsed.dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    except Exception:
        # Return as-is if parsing fails
        return ts_series


def format_output(
    df: pd.DataFrame, entity_id_config: dict[str, str]
) -> pd.DataFrame:
    """Format DataFrame for output with required columns.

    Args:
        df: Input DataFrame with mapped columns
        entity_id_config: Config for entity_id, either {"column": "col_name"} or {"fixed": "value"}

    Returns:
        DataFrame ready for output
    """
    # Set entity_id
    if "column" in entity_id_config:
        col_name = entity_id_config["column"]
        if col_name in df.columns:
            df["entity_id"] = df[col_name]
        else:
            df["entity_id"] = "p1"
    elif "fixed" in entity_id_config:
        df["entity_id"] = entity_id_config["fixed"]
    else:
        df["entity_id"] = "p1"

    # Set entity_type to platform
    df["entity_type"] = "platform"

    # Set platform_id same as entity_id for platforms
    df["platform_id"] = df["entity_id"]

    # Format timestamps
    if "timestamp" in df.columns:
        df["timestamp"] = parse_timestamp(df["timestamp"])

    # Ensure all output columns exist (empty for sensor-specific columns)
    for col in OUTPUT_COLUMNS:
        if col not in df.columns:
            df[col] = ""

    # Reorder columns
    return df[OUTPUT_COLUMNS]


def convert(
    input_csv: str | Path,
    output_csv: str | Path,
    config: dict[str, Any],
) -> pd.DataFrame:
    """Convert a CSV file to Vector Space format.

    Args:
        input_csv: Path to input CSV file
        output_csv: Path to output CSV file
        config: Configuration dict with keys:
            - column_mapping: Dict mapping source to target column names
            - entity_id: Dict with either {"column": "col_name"} or {"fixed": "value"}
            - defaults: Dict of default values for missing columns
            - header_rows: Number of header rows (1 or 2, default 1)
            - coordinate_system: "ned" (default) or "lla" for input coordinates
            - lla_reference: Reference point for LLA to NED conversion, either:
                - "first": Use first data point as reference
                - dict with "lat", "lon", "alt" (radians/meters)
            - angle_units: "degrees" (default) or "radians" for input angles

    Returns:
        The converted DataFrame

    Example config for single header:
        {
            "column_mapping": {
                "time": "timestamp",
                "north": "pos_north",
            },
            "entity_id": {"column": "track_id"},
            "defaults": {"roll": 0.0, "pitch": 0.0, "yaw": 0.0}
        }

    Example config for double header (MultiIndex):
        {
            "header_rows": 2,
            "column_mapping": {
                ("Time", "Seconds"): "timestamp",
                ("Position", "North"): "pos_north",
                ("Position", "East"): "pos_east",
                ("Position", "Down"): "pos_down",
            },
            "entity_id": {"fixed": "platform_1"},
            "defaults": {"roll": 0.0, "pitch": 0.0, "yaw": 0.0}
        }

    Example config for LLA input:
        {
            "coordinate_system": "lla",
            "column_mapping": {
                "lat": "pos_lat",    # radians
                "lon": "pos_lon",    # radians
                "alt": "pos_alt",    # meters
            },
            "lla_reference": "first",  # or {"lat": 0.0, "lon": 0.0, "alt": 0.0}
        }

    Example config with angles in radians:
        {
            "angle_units": "radians",
            "column_mapping": {
                "roll_rad": "roll",
                "pitch_rad": "pitch",
                "yaw_rad": "yaw",
            },
        }
    """
    # Read input CSV
    header_rows = config.get("header_rows", 1)
    if header_rows == 2:
        df = pd.read_csv(input_csv, header=[0, 1])
        df = flatten_multiindex_columns(df)
    else:
        df = pd.read_csv(input_csv)

    # Apply column mapping
    column_mapping = config.get("column_mapping", {})
    df = apply_column_mapping(df, column_mapping)

    # Convert LLA to NED if coordinate_system is "lla"
    coordinate_system = config.get("coordinate_system", "ned")
    if coordinate_system == "lla":
        lla_reference = config.get("lla_reference", "first")
        df = convert_lla_to_ned(df, lla_reference)

    # Convert angles from radians to degrees if angle_units is "radians"
    angle_units = config.get("angle_units", "degrees")
    if angle_units == "radians":
        df = convert_angles_to_degrees(df)

    # Apply defaults
    defaults = config.get("defaults", {})
    df = apply_defaults(df, defaults)

    # Format output
    entity_id_config = config.get("entity_id", {"fixed": "p1"})
    df = format_output(df, entity_id_config)

    # Write output
    df.to_csv(output_csv, index=False)

    return df


def parse_mapping_string(mapping_str: str) -> dict[str, str]:
    """Parse a mapping string like 'time:timestamp,north:pos_north' into a dict."""
    mapping = {}
    for pair in mapping_str.split(","):
        if ":" in pair:
            src, dst = pair.split(":", 1)
            mapping[src.strip()] = dst.strip()
    return mapping


def parse_json_column_mapping(mapping: dict[str, str]) -> dict[str | tuple, str]:
    """Parse JSON column mapping, converting array-string keys to tuples.

    JSON doesn't support tuple keys, so double-header mappings use string
    representations like '["Position", "North"]' which need to be converted
    to tuples.

    Args:
        mapping: Column mapping dict from JSON

    Returns:
        Mapping with array-strings converted to tuples
    """
    parsed = {}
    for key, value in mapping.items():
        if key.startswith("[") and key.endswith("]"):
            try:
                parsed_key = tuple(json.loads(key))
            except json.JSONDecodeError:
                parsed_key = key
        else:
            parsed_key = key
        parsed[parsed_key] = value
    return parsed


def load_python_config(path: str | Path) -> dict[str, Any]:
    """Load configuration from a Python file.

    The Python file should define a `config` dict variable, e.g.:

        config = {
            "column_mapping": {
                "time": "timestamp",
                "north": "pos_north",
                ...
            },
            "entity_id": {"column": "track_id"},
            "defaults": {"roll": 0, "pitch": 0, ...}
        }

    Args:
        path: Path to the Python config file

    Returns:
        The config dict from the file
    """
    path = Path(path)
    spec = importlib.util.spec_from_file_location("config_module", path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Could not load config from {path}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    if not hasattr(module, "config"):
        raise ValueError(f"Config file {path} must define a 'config' variable")

    return module.config


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Convert CSV files to Vector Space format"
    )
    parser.add_argument("input", help="Input CSV file path")
    parser.add_argument("-o", "--output", required=True, help="Output CSV file path")
    parser.add_argument(
        "-c", "--config", help="Config file path (JSON or Python)"
    )
    parser.add_argument(
        "-m", "--mapping",
        help="Column mapping as 'src:dst,src:dst,...' (e.g., 'time:timestamp,north:pos_north')"
    )
    parser.add_argument(
        "--entity-id-column",
        help="Column name containing entity IDs"
    )
    parser.add_argument(
        "--entity-id-fixed",
        help="Fixed entity ID value to use for all rows"
    )
    parser.add_argument(
        "-d", "--defaults",
        help="Default values as 'col:value,col:value,...' (e.g., 'roll:0,pitch:0')"
    )
    parser.add_argument(
        "--double-header",
        action="store_true",
        help="CSV has two header rows (MultiIndex columns)"
    )
    parser.add_argument(
        "--lla-reference",
        help="LLA reference point: 'first' or 'lat,lon,alt' in radians/meters (enables LLA input mode)"
    )
    parser.add_argument(
        "--angles-in-radians",
        action="store_true",
        help="Input angles (roll, pitch, yaw) are in radians; convert to degrees for output"
    )

    args = parser.parse_args()

    # Build config
    if args.config:
        config_path = Path(args.config)
        if config_path.suffix == ".py":
            config = load_python_config(config_path)
        else:
            with open(config_path) as f:
                config = json.load(f)
            # Parse JSON array-string keys to tuples for double headers
            if "column_mapping" in config:
                config["column_mapping"] = parse_json_column_mapping(
                    config["column_mapping"]
                )
    else:
        config = {}

    # Override with CLI arguments
    if args.mapping:
        config["column_mapping"] = parse_mapping_string(args.mapping)

    if args.entity_id_column:
        config["entity_id"] = {"column": args.entity_id_column}
    elif args.entity_id_fixed:
        config["entity_id"] = {"fixed": args.entity_id_fixed}

    if args.defaults:
        defaults = {}
        for pair in args.defaults.split(","):
            if ":" in pair:
                col, val = pair.split(":", 1)
                try:
                    defaults[col.strip()] = float(val.strip())
                except ValueError:
                    defaults[col.strip()] = val.strip()
        config["defaults"] = defaults

    if args.double_header:
        config["header_rows"] = 2

    if args.lla_reference:
        config["coordinate_system"] = "lla"
        if args.lla_reference == "first":
            config["lla_reference"] = "first"
        else:
            parts = args.lla_reference.split(",")
            if len(parts) != 3:
                parser.error("--lla-reference must be 'first' or 'lat,lon,alt'")
            config["lla_reference"] = {
                "lat": float(parts[0]),
                "lon": float(parts[1]),
                "alt": float(parts[2]),
            }

    if args.angles_in_radians:
        config["angle_units"] = "radians"

    # Run conversion
    convert(args.input, args.output, config)
    print(f"Converted {args.input} -> {args.output}")


if __name__ == "__main__":
    main()
