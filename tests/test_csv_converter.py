"""Pytest tests for CSV converter LLA functionality."""

from __future__ import annotations

import math
import subprocess
import sys
from pathlib import Path
from typing import Any

import pandas as pd
import pytest

from vector_space.csv_converter import (
    ANGLE_COLUMNS,
    WGS84_A,
    WGS84_E2,
    convert,
    convert_angles_to_degrees,
    convert_lla_to_ned,
    ecef_to_ned,
    lla_to_ecef,
)


# =============================================================================
# Test Fixtures
# =============================================================================


@pytest.fixture
def sample_lla_df() -> pd.DataFrame:
    """Create a sample DataFrame with LLA columns."""
    return pd.DataFrame(
        {
            "timestamp": [1705746000, 1705746001, 1705746002],
            "pos_lat": [0.6981317, 0.6981317 + 0.0001, 0.6981317 + 0.0002],  # ~40 deg
            "pos_lon": [-1.2217305, -1.2217305, -1.2217305 + 0.0001],  # ~-70 deg
            "pos_alt": [100.0, 110.0, 120.0],
            "vel_north": [10.0, 11.0, 12.0],
            "vel_east": [5.0, 5.5, 6.0],
            "vel_down": [0.0, -0.5, -1.0],
        }
    )


@pytest.fixture
def sample_lla_csv(tmp_path: Path) -> Path:
    """Create a temporary single-header LLA CSV file."""
    csv_path = tmp_path / "lla_input.csv"
    csv_content = """time,track_id,lat,lon,alt,vn,ve,vd
1705746000,ship1,0.6981317,-1.2217305,100,10,5,0
1705746001,ship1,0.6982317,-1.2217305,110,11,5.5,-0.5
1705746002,ship1,0.6983317,-1.2216305,120,12,6,-1
"""
    csv_path.write_text(csv_content)
    return csv_path


@pytest.fixture
def sample_lla_double_header_csv(tmp_path: Path) -> Path:
    """Create a temporary double-header LLA CSV file."""
    csv_path = tmp_path / "lla_double_header.csv"
    csv_content = """Time,Entity,Position,Position,Position,Velocity,Velocity,Velocity
Seconds,ID,Lat,Lon,Alt,North,East,Down
1705746000,platform_1,0.6981317,-1.2217305,100,10,5,0
1705746001,platform_1,0.6982317,-1.2217305,110,11,5.5,-0.5
1705746002,platform_1,0.6983317,-1.2216305,120,12,6,-1
"""
    csv_path.write_text(csv_content)
    return csv_path


# =============================================================================
# Unit Tests: lla_to_ecef()
# =============================================================================


class TestLlaToEcef:
    """Unit tests for lla_to_ecef() function."""

    def test_equator_prime_meridian(self) -> None:
        """Test at equator/prime meridian (0, 0, 0) -> ECEF (a, 0, 0)."""
        x, y, z = lla_to_ecef(0.0, 0.0, 0.0)

        # At lat=0, lon=0, alt=0, X should be semi-major axis, Y and Z ~0
        assert abs(x - WGS84_A) < 1.0  # Within 1 meter
        assert abs(y) < 1e-6
        assert abs(z) < 1e-6

    def test_north_pole(self) -> None:
        """Test at North Pole (pi/2, 0, 0)."""
        x, y, z = lla_to_ecef(math.pi / 2, 0.0, 0.0)

        # At north pole, X and Y should be ~0, Z should be semi-minor axis b
        # b = a * sqrt(1 - e^2)
        b = WGS84_A * math.sqrt(1 - WGS84_E2)
        assert abs(x) < 1.0
        assert abs(y) < 1e-6
        assert abs(z - b) < 1.0

    def test_south_pole(self) -> None:
        """Test at South Pole (-pi/2, 0, 0)."""
        x, y, z = lla_to_ecef(-math.pi / 2, 0.0, 0.0)

        b = WGS84_A * math.sqrt(1 - WGS84_E2)
        assert abs(x) < 1.0
        assert abs(y) < 1e-6
        assert abs(z + b) < 1.0  # Negative Z for south pole

    def test_with_altitude(self) -> None:
        """Test with altitude offset at equator."""
        altitude = 1000.0  # 1km altitude
        x, y, z = lla_to_ecef(0.0, 0.0, altitude)

        # X should be a + altitude
        assert abs(x - (WGS84_A + altitude)) < 1.0
        assert abs(y) < 1e-6
        assert abs(z) < 1e-6

    def test_known_location_new_york(self) -> None:
        """Test at approximate New York City location."""
        # NYC: ~40.7N, ~74W -> 0.7102 rad, -1.2915 rad
        lat = math.radians(40.7)
        lon = math.radians(-74.0)
        alt = 10.0

        x, y, z = lla_to_ecef(lat, lon, alt)

        # Expected approximate ECEF for NYC (sanity check)
        # NYC is in the northern hemisphere, western hemisphere
        assert x > 0  # Positive X (towards prime meridian from center)
        assert y < 0  # Negative Y (western hemisphere)
        assert z > 0  # Positive Z (northern hemisphere)

        # Magnitude should be approximately Earth radius
        magnitude = math.sqrt(x**2 + y**2 + z**2)
        assert abs(magnitude - WGS84_A) < 50000  # Within 50km (rough check)

    def test_90_degrees_east(self) -> None:
        """Test at 90 degrees east on equator."""
        x, y, z = lla_to_ecef(0.0, math.pi / 2, 0.0)

        # At lon=90deg, X~0, Y~a, Z~0
        assert abs(x) < 1.0
        assert abs(y - WGS84_A) < 1.0
        assert abs(z) < 1e-6


# =============================================================================
# Unit Tests: ecef_to_ned()
# =============================================================================


class TestEcefToNed:
    """Unit tests for ecef_to_ned() function."""

    def test_point_at_reference_is_origin(self) -> None:
        """Point at reference location should give (0, 0, 0)."""
        ref_lat = 0.6981317  # ~40 deg
        ref_lon = -1.2217305  # ~-70 deg
        ref_alt = 100.0

        # Get ECEF of reference
        x, y, z = lla_to_ecef(ref_lat, ref_lon, ref_alt)

        # Convert back to NED with same reference
        n, e, d = ecef_to_ned(x, y, z, ref_lat, ref_lon, ref_alt)

        assert abs(n) < 1e-6
        assert abs(e) < 1e-6
        assert abs(d) < 1e-6

    def test_point_north_of_reference(self) -> None:
        """Point north of reference should have positive N, near-zero E."""
        ref_lat = 0.6981317
        ref_lon = -1.2217305
        ref_alt = 100.0

        # Point slightly north (higher latitude)
        point_lat = ref_lat + 0.001  # ~64 meters north
        x, y, z = lla_to_ecef(point_lat, ref_lon, ref_alt)

        n, e, d = ecef_to_ned(x, y, z, ref_lat, ref_lon, ref_alt)

        assert n > 0  # Should be north
        assert abs(e) < 1.0  # Should be negligible east
        # Due to Earth curvature, there's small coupling - allow 5m tolerance
        assert abs(d) < 5.0  # Same altitude, so down ~0

    def test_point_east_of_reference(self) -> None:
        """Point east of reference should have near-zero N, positive E."""
        ref_lat = 0.6981317
        ref_lon = -1.2217305
        ref_alt = 100.0

        # Point slightly east (higher longitude)
        point_lon = ref_lon + 0.001
        x, y, z = lla_to_ecef(ref_lat, point_lon, ref_alt)

        n, e, d = ecef_to_ned(x, y, z, ref_lat, ref_lon, ref_alt)

        # Due to Earth curvature, there's small coupling - allow 2m tolerance
        assert abs(n) < 2.0  # Should be negligible north
        assert e > 0  # Should be east
        assert abs(d) < 2.0  # Same altitude

    def test_point_above_reference(self) -> None:
        """Point above reference should have negative D."""
        ref_lat = 0.6981317
        ref_lon = -1.2217305
        ref_alt = 100.0

        # Point higher altitude
        point_alt = ref_alt + 50.0  # 50m higher
        x, y, z = lla_to_ecef(ref_lat, ref_lon, point_alt)

        n, e, d = ecef_to_ned(x, y, z, ref_lat, ref_lon, ref_alt)

        assert abs(n) < 1.0  # Same position horizontally
        assert abs(e) < 1.0
        assert d < 0  # Negative D means up (NED convention)
        assert abs(d + 50.0) < 1.0  # Should be about -50m

    def test_point_below_reference(self) -> None:
        """Point below reference should have positive D."""
        ref_lat = 0.6981317
        ref_lon = -1.2217305
        ref_alt = 100.0

        # Point lower altitude
        point_alt = ref_alt - 30.0  # 30m lower
        x, y, z = lla_to_ecef(ref_lat, ref_lon, point_alt)

        n, e, d = ecef_to_ned(x, y, z, ref_lat, ref_lon, ref_alt)

        assert abs(n) < 1.0
        assert abs(e) < 1.0
        assert d > 0  # Positive D means down
        assert abs(d - 30.0) < 1.0  # Should be about +30m


# =============================================================================
# Unit Tests: convert_lla_to_ned()
# =============================================================================


class TestConvertLlaToNed:
    """Unit tests for convert_lla_to_ned() function."""

    def test_first_reference_origin(self, sample_lla_df: pd.DataFrame) -> None:
        """Test with 'first' reference - first point should be at origin."""
        result = convert_lla_to_ned(sample_lla_df.copy(), "first")

        # First point should be at origin
        assert abs(result["pos_north"].iloc[0]) < 1e-6
        assert abs(result["pos_east"].iloc[0]) < 1e-6
        assert abs(result["pos_down"].iloc[0]) < 1e-6

    def test_first_reference_subsequent_points(
        self, sample_lla_df: pd.DataFrame
    ) -> None:
        """Test that subsequent points have correct relative positions."""
        result = convert_lla_to_ned(sample_lla_df.copy(), "first")

        # Second point has higher lat -> positive north
        assert result["pos_north"].iloc[1] > 0

        # Third point has higher lon -> positive east
        assert result["pos_east"].iloc[2] > 0

    def test_explicit_reference(self, sample_lla_df: pd.DataFrame) -> None:
        """Test with explicit reference point."""
        ref = {
            "lat": 0.6981317,
            "lon": -1.2217305,
            "alt": 100.0,
        }
        result = convert_lla_to_ned(sample_lla_df.copy(), ref)

        # First point matches reference -> should be at origin
        assert abs(result["pos_north"].iloc[0]) < 1e-6
        assert abs(result["pos_east"].iloc[0]) < 1e-6
        assert abs(result["pos_down"].iloc[0]) < 1e-6

    def test_explicit_reference_offset(self, sample_lla_df: pd.DataFrame) -> None:
        """Test with explicit reference that doesn't match first point."""
        ref = {
            "lat": 0.6981317 + 0.001,  # North of first point
            "lon": -1.2217305,
            "alt": 100.0,
        }
        result = convert_lla_to_ned(sample_lla_df.copy(), ref)

        # First point should be south of reference -> negative north
        assert result["pos_north"].iloc[0] < 0

    def test_lla_columns_removed(self, sample_lla_df: pd.DataFrame) -> None:
        """Test that LLA columns are removed from output."""
        result = convert_lla_to_ned(sample_lla_df.copy(), "first")

        assert "pos_lat" not in result.columns
        assert "pos_lon" not in result.columns
        assert "pos_alt" not in result.columns

    def test_ned_columns_added(self, sample_lla_df: pd.DataFrame) -> None:
        """Test that NED columns are added to output."""
        result = convert_lla_to_ned(sample_lla_df.copy(), "first")

        assert "pos_north" in result.columns
        assert "pos_east" in result.columns
        assert "pos_down" in result.columns

    def test_other_columns_preserved(self, sample_lla_df: pd.DataFrame) -> None:
        """Test that other columns are preserved."""
        result = convert_lla_to_ned(sample_lla_df.copy(), "first")

        assert "timestamp" in result.columns
        assert "vel_north" in result.columns
        assert "vel_east" in result.columns
        assert "vel_down" in result.columns

        # Values should be unchanged
        assert result["vel_north"].tolist() == [10.0, 11.0, 12.0]


# =============================================================================
# Integration Tests: convert() with LLA
# =============================================================================


class TestConvertWithLla:
    """Integration tests for convert() function with LLA input."""

    def test_single_header_lla_first_reference(
        self, sample_lla_csv: Path, tmp_path: Path
    ) -> None:
        """Test single header CSV with LLA input, lla_reference: 'first'."""
        output_csv = tmp_path / "output.csv"
        config: dict[str, Any] = {
            "coordinate_system": "lla",
            "column_mapping": {
                "time": "timestamp",
                "lat": "pos_lat",
                "lon": "pos_lon",
                "alt": "pos_alt",
                "vn": "vel_north",
                "ve": "vel_east",
                "vd": "vel_down",
            },
            "lla_reference": "first",
            "entity_id": {"column": "track_id"},
            "defaults": {"roll": 0.0, "pitch": 0.0, "yaw": 0.0},
        }

        result = convert(sample_lla_csv, output_csv, config)

        # Verify output file exists
        assert output_csv.exists()

        # Verify first point is at origin
        assert abs(result["pos_north"].iloc[0]) < 1e-6
        assert abs(result["pos_east"].iloc[0]) < 1e-6
        assert abs(result["pos_down"].iloc[0]) < 1e-6

        # Verify has expected columns
        assert "entity_id" in result.columns
        assert "entity_type" in result.columns
        assert result["entity_id"].iloc[0] == "ship1"

    def test_single_header_explicit_reference(
        self, sample_lla_csv: Path, tmp_path: Path
    ) -> None:
        """Test single header CSV with explicit LLA reference."""
        output_csv = tmp_path / "output.csv"
        config: dict[str, Any] = {
            "coordinate_system": "lla",
            "column_mapping": {
                "time": "timestamp",
                "lat": "pos_lat",
                "lon": "pos_lon",
                "alt": "pos_alt",
                "vn": "vel_north",
                "ve": "vel_east",
                "vd": "vel_down",
            },
            "lla_reference": {
                "lat": 0.6981317,
                "lon": -1.2217305,
                "alt": 100.0,
            },
            "entity_id": {"column": "track_id"},
            "defaults": {"roll": 0.0, "pitch": 0.0, "yaw": 0.0},
        }

        result = convert(sample_lla_csv, output_csv, config)

        # First point should be at origin (matches reference)
        assert abs(result["pos_north"].iloc[0]) < 1e-6
        assert abs(result["pos_east"].iloc[0]) < 1e-6
        assert abs(result["pos_down"].iloc[0]) < 1e-6

    def test_double_header_lla_first_reference(
        self, sample_lla_double_header_csv: Path, tmp_path: Path
    ) -> None:
        """Test double header CSV with LLA input and lla_reference: 'first'."""
        output_csv = tmp_path / "output.csv"
        config: dict[str, Any] = {
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
            },
            "lla_reference": "first",
            "entity_id": {"fixed": "platform_1"},
            "defaults": {"roll": 0.0, "pitch": 0.0, "yaw": 0.0},
        }

        result = convert(sample_lla_double_header_csv, output_csv, config)

        # Verify output
        assert output_csv.exists()

        # First point at origin
        assert abs(result["pos_north"].iloc[0]) < 1e-6
        assert abs(result["pos_east"].iloc[0]) < 1e-6
        assert abs(result["pos_down"].iloc[0]) < 1e-6

        # Subsequent points have non-zero positions
        assert result["pos_north"].iloc[1] != 0 or result["pos_east"].iloc[1] != 0

        # Entity ID is fixed
        assert result["entity_id"].iloc[0] == "platform_1"

    def test_double_header_explicit_reference(
        self, sample_lla_double_header_csv: Path, tmp_path: Path
    ) -> None:
        """Test double header CSV with explicit LLA reference."""
        output_csv = tmp_path / "output.csv"
        config: dict[str, Any] = {
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
            },
            "lla_reference": {
                "lat": 0.6981317,
                "lon": -1.2217305,
                "alt": 100.0,
            },
            "entity_id": {"fixed": "platform_1"},
            "defaults": {"roll": 0.0, "pitch": 0.0, "yaw": 0.0},
        }

        result = convert(sample_lla_double_header_csv, output_csv, config)

        # First point at origin (matches reference)
        assert abs(result["pos_north"].iloc[0]) < 1e-6
        assert abs(result["pos_east"].iloc[0]) < 1e-6
        assert abs(result["pos_down"].iloc[0]) < 1e-6

    def test_output_has_all_required_columns(
        self, sample_lla_csv: Path, tmp_path: Path
    ) -> None:
        """Test that output has all required Vector Space columns."""
        output_csv = tmp_path / "output.csv"
        config: dict[str, Any] = {
            "coordinate_system": "lla",
            "column_mapping": {
                "time": "timestamp",
                "lat": "pos_lat",
                "lon": "pos_lon",
                "alt": "pos_alt",
            },
            "lla_reference": "first",
            "entity_id": {"column": "track_id"},
        }

        result = convert(sample_lla_csv, output_csv, config)

        expected_columns = [
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
        ]
        for col in expected_columns:
            assert col in result.columns, f"Missing column: {col}"


# =============================================================================
# CLI Tests
# =============================================================================


class TestCli:
    """CLI tests for csv_converter."""

    def test_lla_reference_first_flag(
        self, sample_lla_csv: Path, tmp_path: Path
    ) -> None:
        """Test --lla-reference first flag."""
        output_csv = tmp_path / "output.csv"

        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "vector_space.csv_converter",
                str(sample_lla_csv),
                "-o",
                str(output_csv),
                "-m",
                "time:timestamp,lat:pos_lat,lon:pos_lon,alt:pos_alt,vn:vel_north,ve:vel_east,vd:vel_down",
                "--entity-id-column",
                "track_id",
                "--lla-reference",
                "first",
            ],
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0, f"CLI failed: {result.stderr}"
        assert output_csv.exists()

        # Read and verify output
        df = pd.read_csv(output_csv)
        assert abs(df["pos_north"].iloc[0]) < 1e-6
        assert abs(df["pos_east"].iloc[0]) < 1e-6
        assert abs(df["pos_down"].iloc[0]) < 1e-6

    def test_lla_reference_explicit_flag(
        self, sample_lla_csv: Path, tmp_path: Path
    ) -> None:
        """Test --lla-reference 'lat,lon,alt' format."""
        output_csv = tmp_path / "output.csv"

        # Use the first point's coordinates as explicit reference
        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "vector_space.csv_converter",
                str(sample_lla_csv),
                "-o",
                str(output_csv),
                "-m",
                "time:timestamp,lat:pos_lat,lon:pos_lon,alt:pos_alt",
                "--entity-id-fixed",
                "test_entity",
                "--lla-reference",
                "0.6981317,-1.2217305,100",
            ],
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0, f"CLI failed: {result.stderr}"
        assert output_csv.exists()

        df = pd.read_csv(output_csv)
        # First point should be at origin
        assert abs(df["pos_north"].iloc[0]) < 1e-6
        assert abs(df["pos_east"].iloc[0]) < 1e-6
        assert abs(df["pos_down"].iloc[0]) < 1e-6

    def test_lla_reference_invalid_format(
        self, sample_lla_csv: Path, tmp_path: Path
    ) -> None:
        """Test error handling for invalid --lla-reference format."""
        output_csv = tmp_path / "output.csv"

        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "vector_space.csv_converter",
                str(sample_lla_csv),
                "-o",
                str(output_csv),
                "-m",
                "time:timestamp",
                "--lla-reference",
                "invalid",  # Not 'first' and not 'lat,lon,alt'
            ],
            capture_output=True,
            text=True,
        )

        assert result.returncode != 0
        assert "must be 'first' or 'lat,lon,alt'" in result.stderr

    def test_lla_reference_incomplete_values(
        self, sample_lla_csv: Path, tmp_path: Path
    ) -> None:
        """Test error handling for incomplete lat,lon,alt values."""
        output_csv = tmp_path / "output.csv"

        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "vector_space.csv_converter",
                str(sample_lla_csv),
                "-o",
                str(output_csv),
                "-m",
                "time:timestamp",
                "--lla-reference",
                "0.5,0.5",  # Missing altitude
            ],
            capture_output=True,
            text=True,
        )

        assert result.returncode != 0
        assert "must be 'first' or 'lat,lon,alt'" in result.stderr

    def test_cli_with_double_header_and_config_file(
        self, sample_lla_double_header_csv: Path, tmp_path: Path
    ) -> None:
        """Test CLI with double header using a Python config file."""
        output_csv = tmp_path / "output.csv"
        config_file = tmp_path / "config.py"

        config_content = '''
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
    },
    "lla_reference": "first",
    "entity_id": {"fixed": "platform_1"},
    "defaults": {"roll": 0.0, "pitch": 0.0, "yaw": 0.0},
}
'''
        config_file.write_text(config_content)

        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "vector_space.csv_converter",
                str(sample_lla_double_header_csv),
                "-o",
                str(output_csv),
                "-c",
                str(config_file),
            ],
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0, f"CLI failed: {result.stderr}"
        assert output_csv.exists()

        df = pd.read_csv(output_csv)
        # First point at origin
        assert abs(df["pos_north"].iloc[0]) < 1e-6
        assert abs(df["pos_east"].iloc[0]) < 1e-6
        assert abs(df["pos_down"].iloc[0]) < 1e-6


# =============================================================================
# Edge Cases and Error Handling
# =============================================================================


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_single_point_lla(self, tmp_path: Path) -> None:
        """Test with single point - should work with 'first' reference."""
        csv_path = tmp_path / "single_point.csv"
        csv_path.write_text("time,lat,lon,alt\n1000,0.5,0.5,100\n")

        output_csv = tmp_path / "output.csv"
        config: dict[str, Any] = {
            "coordinate_system": "lla",
            "column_mapping": {
                "time": "timestamp",
                "lat": "pos_lat",
                "lon": "pos_lon",
                "alt": "pos_alt",
            },
            "lla_reference": "first",
            "entity_id": {"fixed": "single"},
        }

        result = convert(csv_path, output_csv, config)

        # Single point at origin
        assert len(result) == 1
        assert abs(result["pos_north"].iloc[0]) < 1e-6
        assert abs(result["pos_east"].iloc[0]) < 1e-6
        assert abs(result["pos_down"].iloc[0]) < 1e-6

    def test_zero_altitude_points(self, tmp_path: Path) -> None:
        """Test with zero altitude points."""
        csv_path = tmp_path / "zero_alt.csv"
        csv_path.write_text(
            "time,lat,lon,alt\n1000,0.5,0.5,0\n1001,0.5001,0.5,0\n"
        )

        output_csv = tmp_path / "output.csv"
        config: dict[str, Any] = {
            "coordinate_system": "lla",
            "column_mapping": {
                "time": "timestamp",
                "lat": "pos_lat",
                "lon": "pos_lon",
                "alt": "pos_alt",
            },
            "lla_reference": "first",
            "entity_id": {"fixed": "zero_alt"},
        }

        result = convert(csv_path, output_csv, config)

        # Should work without errors
        assert len(result) == 2
        # Second point should be north of first
        assert result["pos_north"].iloc[1] > 0

    def test_equator_crossing(self, tmp_path: Path) -> None:
        """Test with points crossing the equator."""
        csv_path = tmp_path / "equator_crossing.csv"
        csv_path.write_text(
            "time,lat,lon,alt\n1000,0.001,0.5,100\n1001,-0.001,0.5,100\n"
        )

        output_csv = tmp_path / "output.csv"
        config: dict[str, Any] = {
            "coordinate_system": "lla",
            "column_mapping": {
                "time": "timestamp",
                "lat": "pos_lat",
                "lon": "pos_lon",
                "alt": "pos_alt",
            },
            "lla_reference": "first",
            "entity_id": {"fixed": "equator"},
        }

        result = convert(csv_path, output_csv, config)

        # Second point south of first
        assert result["pos_north"].iloc[1] < 0

    def test_prime_meridian_crossing(self, tmp_path: Path) -> None:
        """Test with points crossing the prime meridian."""
        csv_path = tmp_path / "meridian_crossing.csv"
        csv_path.write_text(
            "time,lat,lon,alt\n1000,0.5,0.001,100\n1001,0.5,-0.001,100\n"
        )

        output_csv = tmp_path / "output.csv"
        config: dict[str, Any] = {
            "coordinate_system": "lla",
            "column_mapping": {
                "time": "timestamp",
                "lat": "pos_lat",
                "lon": "pos_lon",
                "alt": "pos_alt",
            },
            "lla_reference": "first",
            "entity_id": {"fixed": "meridian"},
        }

        result = convert(csv_path, output_csv, config)

        # Second point west of first
        assert result["pos_east"].iloc[1] < 0


# =============================================================================
# Unit Tests: convert_angles_to_degrees()
# =============================================================================


class TestConvertAnglesToDegrees:
    """Unit tests for convert_angles_to_degrees() function."""

    def test_converts_all_angle_columns(self) -> None:
        """Test that all angle columns are converted."""
        df = pd.DataFrame(
            {
                "roll": [0.0, math.pi / 4, math.pi / 2],
                "pitch": [0.0, math.pi / 6, math.pi / 3],
                "yaw": [0.0, math.pi, 2 * math.pi],
            }
        )

        result = convert_angles_to_degrees(df.copy())

        assert abs(result["roll"].iloc[1] - 45.0) < 1e-6
        assert abs(result["roll"].iloc[2] - 90.0) < 1e-6
        assert abs(result["pitch"].iloc[1] - 30.0) < 1e-6
        assert abs(result["pitch"].iloc[2] - 60.0) < 1e-6
        assert abs(result["yaw"].iloc[1] - 180.0) < 1e-6
        assert abs(result["yaw"].iloc[2] - 360.0) < 1e-6

    def test_preserves_non_angle_columns(self) -> None:
        """Test that non-angle columns are not modified."""
        df = pd.DataFrame(
            {
                "roll": [math.pi / 4],
                "pos_north": [100.0],
                "vel_east": [50.0],
            }
        )

        result = convert_angles_to_degrees(df.copy())

        assert result["pos_north"].iloc[0] == 100.0
        assert result["vel_east"].iloc[0] == 50.0

    def test_handles_missing_angle_columns(self) -> None:
        """Test that missing angle columns don't cause errors."""
        df = pd.DataFrame(
            {
                "roll": [math.pi / 2],
                "pos_north": [100.0],
            }
        )

        result = convert_angles_to_degrees(df.copy())

        assert abs(result["roll"].iloc[0] - 90.0) < 1e-6
        assert "pitch" not in result.columns
        assert "yaw" not in result.columns

    def test_handles_mount_angles(self) -> None:
        """Test that mount angle columns are also converted."""
        df = pd.DataFrame(
            {
                "mount_roll": [math.pi / 4],
                "mount_pitch": [math.pi / 6],
                "mount_yaw": [math.pi / 2],
            }
        )

        result = convert_angles_to_degrees(df.copy())

        assert abs(result["mount_roll"].iloc[0] - 45.0) < 1e-6
        assert abs(result["mount_pitch"].iloc[0] - 30.0) < 1e-6
        assert abs(result["mount_yaw"].iloc[0] - 90.0) < 1e-6

    def test_handles_nan_values(self) -> None:
        """Test that NaN values are preserved."""
        df = pd.DataFrame(
            {
                "roll": [math.pi / 4, float("nan"), math.pi / 2],
            }
        )

        result = convert_angles_to_degrees(df.copy())

        assert abs(result["roll"].iloc[0] - 45.0) < 1e-6
        assert pd.isna(result["roll"].iloc[1])
        assert abs(result["roll"].iloc[2] - 90.0) < 1e-6

    def test_negative_angles(self) -> None:
        """Test conversion of negative angles."""
        df = pd.DataFrame(
            {
                "roll": [-math.pi / 4],
                "pitch": [-math.pi / 2],
            }
        )

        result = convert_angles_to_degrees(df.copy())

        assert abs(result["roll"].iloc[0] - (-45.0)) < 1e-6
        assert abs(result["pitch"].iloc[0] - (-90.0)) < 1e-6


# =============================================================================
# Integration Tests: convert() with angle_units
# =============================================================================


class TestConvertWithAngleUnits:
    """Integration tests for convert() with angle_units config."""

    def test_angles_in_radians_converted(self, tmp_path: Path) -> None:
        """Test that angles in radians are converted to degrees."""
        csv_path = tmp_path / "angles_radians.csv"
        # Create CSV with angles in radians (pi/4 = 45 deg, pi/2 = 90 deg)
        csv_path.write_text(
            "time,north,east,down,roll,pitch,yaw\n"
            f"1000,0,0,0,{math.pi/4},{math.pi/6},{math.pi/2}\n"
        )

        output_csv = tmp_path / "output.csv"
        config: dict[str, Any] = {
            "angle_units": "radians",
            "column_mapping": {
                "time": "timestamp",
                "north": "pos_north",
                "east": "pos_east",
                "down": "pos_down",
                "roll": "roll",
                "pitch": "pitch",
                "yaw": "yaw",
            },
            "entity_id": {"fixed": "test"},
        }

        result = convert(csv_path, output_csv, config)

        assert abs(result["roll"].iloc[0] - 45.0) < 1e-6
        assert abs(result["pitch"].iloc[0] - 30.0) < 1e-6
        assert abs(result["yaw"].iloc[0] - 90.0) < 1e-6

    def test_angles_in_degrees_not_converted(self, tmp_path: Path) -> None:
        """Test that angles in degrees (default) are not converted."""
        csv_path = tmp_path / "angles_degrees.csv"
        csv_path.write_text("time,north,east,down,roll,pitch,yaw\n1000,0,0,0,45,30,90\n")

        output_csv = tmp_path / "output.csv"
        config: dict[str, Any] = {
            # angle_units defaults to "degrees"
            "column_mapping": {
                "time": "timestamp",
                "north": "pos_north",
                "east": "pos_east",
                "down": "pos_down",
                "roll": "roll",
                "pitch": "pitch",
                "yaw": "yaw",
            },
            "entity_id": {"fixed": "test"},
        }

        result = convert(csv_path, output_csv, config)

        assert result["roll"].iloc[0] == 45
        assert result["pitch"].iloc[0] == 30
        assert result["yaw"].iloc[0] == 90

    def test_explicit_degrees_not_converted(self, tmp_path: Path) -> None:
        """Test that explicit angle_units='degrees' doesn't convert."""
        csv_path = tmp_path / "angles_degrees.csv"
        csv_path.write_text("time,north,east,down,roll,pitch,yaw\n1000,0,0,0,45,30,90\n")

        output_csv = tmp_path / "output.csv"
        config: dict[str, Any] = {
            "angle_units": "degrees",
            "column_mapping": {
                "time": "timestamp",
                "north": "pos_north",
                "east": "pos_east",
                "down": "pos_down",
                "roll": "roll",
                "pitch": "pitch",
                "yaw": "yaw",
            },
            "entity_id": {"fixed": "test"},
        }

        result = convert(csv_path, output_csv, config)

        assert result["roll"].iloc[0] == 45
        assert result["pitch"].iloc[0] == 30
        assert result["yaw"].iloc[0] == 90

    def test_lla_with_radians_angles(self, tmp_path: Path) -> None:
        """Test LLA conversion combined with radian angles."""
        csv_path = tmp_path / "lla_radians.csv"
        csv_path.write_text(
            "time,lat,lon,alt,roll,pitch,yaw\n"
            f"1000,0.6981317,-1.2217305,100,{math.pi/4},{math.pi/6},{math.pi/2}\n"
        )

        output_csv = tmp_path / "output.csv"
        config: dict[str, Any] = {
            "coordinate_system": "lla",
            "angle_units": "radians",
            "column_mapping": {
                "time": "timestamp",
                "lat": "pos_lat",
                "lon": "pos_lon",
                "alt": "pos_alt",
                "roll": "roll",
                "pitch": "pitch",
                "yaw": "yaw",
            },
            "lla_reference": "first",
            "entity_id": {"fixed": "test"},
        }

        result = convert(csv_path, output_csv, config)

        # Position should be at origin
        assert abs(result["pos_north"].iloc[0]) < 1e-6
        # Angles should be converted to degrees
        assert abs(result["roll"].iloc[0] - 45.0) < 1e-6
        assert abs(result["pitch"].iloc[0] - 30.0) < 1e-6
        assert abs(result["yaw"].iloc[0] - 90.0) < 1e-6


# =============================================================================
# CLI Tests: --angles-in-radians
# =============================================================================


class TestCliAnglesInRadians:
    """CLI tests for --angles-in-radians flag."""

    def test_angles_in_radians_flag(self, tmp_path: Path) -> None:
        """Test --angles-in-radians CLI flag."""
        csv_path = tmp_path / "angles.csv"
        csv_path.write_text(
            "time,north,east,down,roll,pitch,yaw\n"
            f"1000,0,0,0,{math.pi/4},{math.pi/6},{math.pi/2}\n"
        )

        output_csv = tmp_path / "output.csv"

        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "vector_space.csv_converter",
                str(csv_path),
                "-o",
                str(output_csv),
                "-m",
                "time:timestamp,north:pos_north,east:pos_east,down:pos_down,"
                "roll:roll,pitch:pitch,yaw:yaw",
                "--entity-id-fixed",
                "test",
                "--angles-in-radians",
            ],
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0, f"CLI failed: {result.stderr}"

        df = pd.read_csv(output_csv)
        assert abs(df["roll"].iloc[0] - 45.0) < 1e-6
        assert abs(df["pitch"].iloc[0] - 30.0) < 1e-6
        assert abs(df["yaw"].iloc[0] - 90.0) < 1e-6

    def test_without_angles_flag_no_conversion(self, tmp_path: Path) -> None:
        """Test that without --angles-in-radians, no conversion happens."""
        csv_path = tmp_path / "angles.csv"
        csv_path.write_text("time,north,east,down,roll,pitch,yaw\n1000,0,0,0,45,30,90\n")

        output_csv = tmp_path / "output.csv"

        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "vector_space.csv_converter",
                str(csv_path),
                "-o",
                str(output_csv),
                "-m",
                "time:timestamp,north:pos_north,east:pos_east,down:pos_down,"
                "roll:roll,pitch:pitch,yaw:yaw",
                "--entity-id-fixed",
                "test",
            ],
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0, f"CLI failed: {result.stderr}"

        df = pd.read_csv(output_csv)
        assert df["roll"].iloc[0] == 45
        assert df["pitch"].iloc[0] == 30
        assert df["yaw"].iloc[0] == 90

    def test_lla_reference_with_angles_in_radians(self, tmp_path: Path) -> None:
        """Test combining --lla-reference and --angles-in-radians."""
        csv_path = tmp_path / "lla_angles.csv"
        csv_path.write_text(
            "time,lat,lon,alt,roll,pitch,yaw\n"
            f"1000,0.6981317,-1.2217305,100,{math.pi/4},{math.pi/6},{math.pi/2}\n"
        )

        output_csv = tmp_path / "output.csv"

        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "vector_space.csv_converter",
                str(csv_path),
                "-o",
                str(output_csv),
                "-m",
                "time:timestamp,lat:pos_lat,lon:pos_lon,alt:pos_alt,"
                "roll:roll,pitch:pitch,yaw:yaw",
                "--entity-id-fixed",
                "test",
                "--lla-reference",
                "first",
                "--angles-in-radians",
            ],
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0, f"CLI failed: {result.stderr}"

        df = pd.read_csv(output_csv)
        # Angles converted
        assert abs(df["roll"].iloc[0] - 45.0) < 1e-6
        assert abs(df["pitch"].iloc[0] - 30.0) < 1e-6
        assert abs(df["yaw"].iloc[0] - 90.0) < 1e-6
        # Position at origin
        assert abs(df["pos_north"].iloc[0]) < 1e-6
