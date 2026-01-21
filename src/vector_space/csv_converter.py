"""CSV converter for Vector Space visualization format.

Converts arbitrary CSV files to the Vector Space multi-platform CSV format
using user-defined column mappings.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
from typing import Any

import pandas as pd


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


def apply_column_mapping(df: pd.DataFrame, mapping: dict[str, str]) -> pd.DataFrame:
    """Rename source columns to target columns based on mapping.

    Args:
        df: Input DataFrame
        mapping: Dict mapping source column names to target column names

    Returns:
        DataFrame with renamed columns
    """
    rename_map = {src: dst for src, dst in mapping.items() if src in df.columns}
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

    Returns:
        The converted DataFrame

    Example config:
        {
            "column_mapping": {
                "time": "timestamp",
                "north": "pos_north",
                "east": "pos_east",
                "down": "pos_down",
            },
            "entity_id": {"column": "track_id"},
            "defaults": {
                "vel_north": 0.0,
                "vel_east": 0.0,
                "vel_down": 0.0,
                "roll": 0.0,
                "pitch": 0.0,
                "yaw": 0.0,
            }
        }
    """
    # Read input CSV
    df = pd.read_csv(input_csv)

    # Apply column mapping
    column_mapping = config.get("column_mapping", {})
    df = apply_column_mapping(df, column_mapping)

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

    args = parser.parse_args()

    # Build config
    if args.config:
        config_path = Path(args.config)
        if config_path.suffix == ".py":
            config = load_python_config(config_path)
        else:
            with open(config_path) as f:
                config = json.load(f)
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

    # Run conversion
    convert(args.input, args.output, config)
    print(f"Converted {args.input} -> {args.output}")


if __name__ == "__main__":
    main()
