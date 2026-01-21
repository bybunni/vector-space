"""Integration tests for all CSV/mapping combinations.

Tests all 8 combinations:
- Single header + NED + Python mapping
- Single header + NED + JSON mapping
- Single header + LLA + Python mapping
- Single header + LLA + JSON mapping
- Double header + NED + Python mapping
- Double header + NED + JSON mapping
- Double header + LLA + Python mapping
- Double header + LLA + JSON mapping
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pandas as pd
import pytest

from vector_space.csv_converter import convert, load_python_config

# Path to test fixtures
FIXTURES_DIR = Path(__file__).parent / "fixtures"


# =============================================================================
# Fixture Paths
# =============================================================================


@pytest.fixture
def single_header_ned_csv() -> Path:
    return FIXTURES_DIR / "single_header_ned.csv"


@pytest.fixture
def single_header_lla_csv() -> Path:
    return FIXTURES_DIR / "single_header_lla.csv"


@pytest.fixture
def double_header_ned_csv() -> Path:
    return FIXTURES_DIR / "double_header_ned.csv"


@pytest.fixture
def double_header_lla_csv() -> Path:
    return FIXTURES_DIR / "double_header_lla.csv"


# =============================================================================
# Single Header + NED Tests
# =============================================================================


class TestSingleHeaderNed:
    """Tests for single header NED CSV with Python and JSON mappings."""

    def test_python_mapping(
        self, single_header_ned_csv: Path, tmp_path: Path
    ) -> None:
        """Test single header NED with Python mapping."""
        output_csv = tmp_path / "output.csv"
        config = load_python_config(FIXTURES_DIR / "mapping_single_header_ned.py")

        result = convert(single_header_ned_csv, output_csv, config)

        assert output_csv.exists()
        assert len(result) == 5
        assert "pos_north" in result.columns
        assert "pos_east" in result.columns
        assert "pos_down" in result.columns

        # Check first row values
        assert result["pos_north"].iloc[0] == 0
        assert result["pos_east"].iloc[0] == 0
        assert result["pos_down"].iloc[0] == 0

        # Check entity IDs
        assert result["entity_id"].iloc[0] == "ship1"
        assert result["entity_id"].iloc[3] == "ship2"

    def test_json_mapping(
        self, single_header_ned_csv: Path, tmp_path: Path
    ) -> None:
        """Test single header NED with JSON mapping."""
        output_csv = tmp_path / "output.csv"

        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "vector_space.csv_converter",
                str(single_header_ned_csv),
                "-o",
                str(output_csv),
                "-c",
                str(FIXTURES_DIR / "mapping_single_header_ned.json"),
            ],
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0, f"CLI failed: {result.stderr}"
        assert output_csv.exists()

        df = pd.read_csv(output_csv)
        assert len(df) == 5
        assert df["pos_north"].iloc[0] == 0
        assert df["entity_id"].iloc[0] == "ship1"

    def test_cli_inline_mapping(
        self, single_header_ned_csv: Path, tmp_path: Path
    ) -> None:
        """Test single header NED with CLI inline mapping."""
        output_csv = tmp_path / "output.csv"

        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "vector_space.csv_converter",
                str(single_header_ned_csv),
                "-o",
                str(output_csv),
                "-m",
                "time:timestamp,north:pos_north,east:pos_east,down:pos_down,"
                "vn:vel_north,ve:vel_east,vd:vel_down,"
                "heading:yaw,bank:roll,elevation:pitch",
                "--entity-id-column",
                "track_id",
            ],
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0, f"CLI failed: {result.stderr}"
        df = pd.read_csv(output_csv)
        assert len(df) == 5
        assert df["entity_id"].iloc[0] == "ship1"


# =============================================================================
# Single Header + LLA Tests
# =============================================================================


class TestSingleHeaderLla:
    """Tests for single header LLA CSV with Python and JSON mappings."""

    def test_python_mapping(
        self, single_header_lla_csv: Path, tmp_path: Path
    ) -> None:
        """Test single header LLA with Python mapping."""
        output_csv = tmp_path / "output.csv"
        config = load_python_config(FIXTURES_DIR / "mapping_single_header_lla.py")

        result = convert(single_header_lla_csv, output_csv, config)

        assert output_csv.exists()
        assert len(result) == 5

        # LLA columns should be converted to NED
        assert "pos_lat" not in result.columns
        assert "pos_lon" not in result.columns
        assert "pos_alt" not in result.columns
        assert "pos_north" in result.columns
        assert "pos_east" in result.columns
        assert "pos_down" in result.columns

        # First point (reference) should be at origin
        assert abs(result["pos_north"].iloc[0]) < 1e-6
        assert abs(result["pos_east"].iloc[0]) < 1e-6
        assert abs(result["pos_down"].iloc[0]) < 1e-6

        # Subsequent points should have non-zero positions
        assert result["pos_north"].iloc[1] != 0 or result["pos_east"].iloc[1] != 0

        # Check entity IDs
        assert result["entity_id"].iloc[0] == "aircraft1"
        assert result["entity_id"].iloc[3] == "aircraft2"

    def test_json_mapping(
        self, single_header_lla_csv: Path, tmp_path: Path
    ) -> None:
        """Test single header LLA with JSON mapping."""
        output_csv = tmp_path / "output.csv"

        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "vector_space.csv_converter",
                str(single_header_lla_csv),
                "-o",
                str(output_csv),
                "-c",
                str(FIXTURES_DIR / "mapping_single_header_lla.json"),
            ],
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0, f"CLI failed: {result.stderr}"
        assert output_csv.exists()

        df = pd.read_csv(output_csv)
        assert len(df) == 5

        # First point at origin
        assert abs(df["pos_north"].iloc[0]) < 1e-6
        assert abs(df["pos_east"].iloc[0]) < 1e-6
        assert abs(df["pos_down"].iloc[0]) < 1e-6

    def test_cli_with_lla_reference_first(
        self, single_header_lla_csv: Path, tmp_path: Path
    ) -> None:
        """Test single header LLA with CLI --lla-reference first."""
        output_csv = tmp_path / "output.csv"

        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "vector_space.csv_converter",
                str(single_header_lla_csv),
                "-o",
                str(output_csv),
                "-m",
                "time:timestamp,lat:pos_lat,lon:pos_lon,alt:pos_alt,"
                "vn:vel_north,ve:vel_east,vd:vel_down",
                "--entity-id-column",
                "track_id",
                "--lla-reference",
                "first",
            ],
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0, f"CLI failed: {result.stderr}"
        df = pd.read_csv(output_csv)

        # First point at origin
        assert abs(df["pos_north"].iloc[0]) < 1e-6

    def test_cli_with_explicit_lla_reference(
        self, single_header_lla_csv: Path, tmp_path: Path
    ) -> None:
        """Test single header LLA with CLI explicit --lla-reference."""
        output_csv = tmp_path / "output.csv"

        # Use first point's LLA as explicit reference
        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "vector_space.csv_converter",
                str(single_header_lla_csv),
                "-o",
                str(output_csv),
                "-m",
                "time:timestamp,lat:pos_lat,lon:pos_lon,alt:pos_alt",
                "--entity-id-fixed",
                "test",
                "--lla-reference",
                "0.6981317,-1.2217305,1000",
            ],
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0, f"CLI failed: {result.stderr}"
        df = pd.read_csv(output_csv)

        # First point should be at origin
        assert abs(df["pos_north"].iloc[0]) < 1e-6
        assert abs(df["pos_east"].iloc[0]) < 1e-6
        assert abs(df["pos_down"].iloc[0]) < 1e-6


# =============================================================================
# Double Header + NED Tests
# =============================================================================


class TestDoubleHeaderNed:
    """Tests for double header NED CSV with Python and JSON mappings."""

    def test_python_mapping(
        self, double_header_ned_csv: Path, tmp_path: Path
    ) -> None:
        """Test double header NED with Python mapping."""
        output_csv = tmp_path / "output.csv"
        config = load_python_config(FIXTURES_DIR / "mapping_double_header_ned.py")

        result = convert(double_header_ned_csv, output_csv, config)

        assert output_csv.exists()
        assert len(result) == 5

        # Check position values
        assert result["pos_north"].iloc[0] == 0
        assert result["pos_east"].iloc[0] == 0
        assert result["pos_down"].iloc[0] == 0

        # Check attitude values
        assert result["roll"].iloc[0] == 0
        assert result["pitch"].iloc[0] == 0
        assert result["yaw"].iloc[0] == 45

    def test_json_mapping(
        self, double_header_ned_csv: Path, tmp_path: Path
    ) -> None:
        """Test double header NED with JSON mapping."""
        output_csv = tmp_path / "output.csv"

        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "vector_space.csv_converter",
                str(double_header_ned_csv),
                "-o",
                str(output_csv),
                "-c",
                str(FIXTURES_DIR / "mapping_double_header_ned.json"),
            ],
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0, f"CLI failed: {result.stderr}"
        assert output_csv.exists()

        df = pd.read_csv(output_csv)
        assert len(df) == 5
        assert df["pos_north"].iloc[0] == 0
        assert df["yaw"].iloc[0] == 45

    def test_cli_with_double_header_flag(
        self, double_header_ned_csv: Path, tmp_path: Path
    ) -> None:
        """Test double header NED with CLI --double-header flag and Python config."""
        output_csv = tmp_path / "output.csv"

        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "vector_space.csv_converter",
                str(double_header_ned_csv),
                "-o",
                str(output_csv),
                "-c",
                str(FIXTURES_DIR / "mapping_double_header_ned.py"),
            ],
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0, f"CLI failed: {result.stderr}"
        df = pd.read_csv(output_csv)
        assert len(df) == 5


# =============================================================================
# Double Header + LLA Tests
# =============================================================================


class TestDoubleHeaderLla:
    """Tests for double header LLA CSV with Python and JSON mappings."""

    def test_python_mapping(
        self, double_header_lla_csv: Path, tmp_path: Path
    ) -> None:
        """Test double header LLA with Python mapping."""
        output_csv = tmp_path / "output.csv"
        config = load_python_config(FIXTURES_DIR / "mapping_double_header_lla.py")

        result = convert(double_header_lla_csv, output_csv, config)

        assert output_csv.exists()
        assert len(result) == 5

        # LLA columns should be converted to NED
        assert "pos_lat" not in result.columns
        assert "pos_north" in result.columns

        # First point at origin
        assert abs(result["pos_north"].iloc[0]) < 1e-6
        assert abs(result["pos_east"].iloc[0]) < 1e-6
        assert abs(result["pos_down"].iloc[0]) < 1e-6

        # Subsequent points have non-zero positions
        assert result["pos_north"].iloc[1] != 0 or result["pos_east"].iloc[1] != 0

        # Check attitude preserved
        assert result["roll"].iloc[1] == 1
        assert result["pitch"].iloc[1] == 0.5
        assert result["yaw"].iloc[1] == 5

    def test_json_mapping(
        self, double_header_lla_csv: Path, tmp_path: Path
    ) -> None:
        """Test double header LLA with JSON mapping."""
        output_csv = tmp_path / "output.csv"

        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "vector_space.csv_converter",
                str(double_header_lla_csv),
                "-o",
                str(output_csv),
                "-c",
                str(FIXTURES_DIR / "mapping_double_header_lla.json"),
            ],
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0, f"CLI failed: {result.stderr}"
        assert output_csv.exists()

        df = pd.read_csv(output_csv)
        assert len(df) == 5

        # First point at origin
        assert abs(df["pos_north"].iloc[0]) < 1e-6
        assert abs(df["pos_east"].iloc[0]) < 1e-6
        assert abs(df["pos_down"].iloc[0]) < 1e-6

    def test_cli_python_config_with_lla(
        self, double_header_lla_csv: Path, tmp_path: Path
    ) -> None:
        """Test double header LLA via CLI with Python config."""
        output_csv = tmp_path / "output.csv"

        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "vector_space.csv_converter",
                str(double_header_lla_csv),
                "-o",
                str(output_csv),
                "-c",
                str(FIXTURES_DIR / "mapping_double_header_lla.py"),
            ],
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0, f"CLI failed: {result.stderr}"
        df = pd.read_csv(output_csv)

        # First point at origin
        assert abs(df["pos_north"].iloc[0]) < 1e-6


# =============================================================================
# Cross-Combination Validation Tests
# =============================================================================


class TestCrossCombinationValidation:
    """Tests that validate behavior across different combinations."""

    def test_ned_no_coordinate_conversion(
        self, single_header_ned_csv: Path, tmp_path: Path
    ) -> None:
        """Verify NED input passes through without coordinate conversion."""
        output_csv = tmp_path / "output.csv"
        config = load_python_config(FIXTURES_DIR / "mapping_single_header_ned.py")

        result = convert(single_header_ned_csv, output_csv, config)

        # NED values should be exactly as input
        assert result["pos_north"].iloc[1] == 10
        assert result["pos_east"].iloc[1] == 5
        assert result["pos_down"].iloc[1] == -1

    def test_lla_requires_conversion(
        self, single_header_lla_csv: Path, tmp_path: Path
    ) -> None:
        """Verify LLA input requires coordinate conversion."""
        output_csv = tmp_path / "output.csv"
        config = load_python_config(FIXTURES_DIR / "mapping_single_header_lla.py")

        result = convert(single_header_lla_csv, output_csv, config)

        # Values should not match raw input (conversion happened)
        # Input lat was 0.6981317 rad, but output pos_north should be near 0
        assert abs(result["pos_north"].iloc[0]) < 1e-6

    def test_velocity_preserved_in_lla_conversion(
        self, single_header_lla_csv: Path, tmp_path: Path
    ) -> None:
        """Verify velocity columns are preserved during LLA conversion."""
        output_csv = tmp_path / "output.csv"
        config = load_python_config(FIXTURES_DIR / "mapping_single_header_lla.py")

        result = convert(single_header_lla_csv, output_csv, config)

        # Velocity values should be unchanged
        assert result["vel_north"].iloc[0] == 150
        assert result["vel_east"].iloc[0] == 20
        assert result["vel_down"].iloc[0] == 0

    def test_python_and_json_produce_same_output_single_header_ned(
        self, single_header_ned_csv: Path, tmp_path: Path
    ) -> None:
        """Verify Python and JSON configs produce identical output for single header NED."""
        output_py = tmp_path / "output_py.csv"
        output_json = tmp_path / "output_json.csv"

        # Python config
        config = load_python_config(FIXTURES_DIR / "mapping_single_header_ned.py")
        convert(single_header_ned_csv, output_py, config)

        # JSON config via CLI
        subprocess.run(
            [
                sys.executable,
                "-m",
                "vector_space.csv_converter",
                str(single_header_ned_csv),
                "-o",
                str(output_json),
                "-c",
                str(FIXTURES_DIR / "mapping_single_header_ned.json"),
            ],
            capture_output=True,
            text=True,
            check=True,
        )

        df_py = pd.read_csv(output_py)
        df_json = pd.read_csv(output_json)

        # Compare numeric columns
        for col in ["pos_north", "pos_east", "pos_down", "vel_north", "vel_east", "vel_down"]:
            assert list(df_py[col]) == list(df_json[col]), f"Mismatch in {col}"

    def test_python_and_json_produce_same_output_single_header_lla(
        self, single_header_lla_csv: Path, tmp_path: Path
    ) -> None:
        """Verify Python and JSON configs produce identical output for single header LLA."""
        output_py = tmp_path / "output_py.csv"
        output_json = tmp_path / "output_json.csv"

        # Python config
        config = load_python_config(FIXTURES_DIR / "mapping_single_header_lla.py")
        convert(single_header_lla_csv, output_py, config)

        # JSON config via CLI
        subprocess.run(
            [
                sys.executable,
                "-m",
                "vector_space.csv_converter",
                str(single_header_lla_csv),
                "-o",
                str(output_json),
                "-c",
                str(FIXTURES_DIR / "mapping_single_header_lla.json"),
            ],
            capture_output=True,
            text=True,
            check=True,
        )

        df_py = pd.read_csv(output_py)
        df_json = pd.read_csv(output_json)

        # Compare numeric columns (use approximate comparison for converted coords)
        for col in ["pos_north", "pos_east", "pos_down"]:
            for i in range(len(df_py)):
                assert abs(df_py[col].iloc[i] - df_json[col].iloc[i]) < 1e-6, \
                    f"Mismatch in {col} at row {i}"


# =============================================================================
# Output Format Validation Tests
# =============================================================================


class TestOutputFormat:
    """Tests that validate output format across all combinations."""

    @pytest.mark.parametrize(
        "csv_fixture,config_file",
        [
            ("single_header_ned.csv", "mapping_single_header_ned.py"),
            ("single_header_lla.csv", "mapping_single_header_lla.py"),
            ("double_header_ned.csv", "mapping_double_header_ned.py"),
            ("double_header_lla.csv", "mapping_double_header_lla.py"),
        ],
    )
    def test_all_required_columns_present(
        self, csv_fixture: str, config_file: str, tmp_path: Path
    ) -> None:
        """Verify all required columns are present in output."""
        csv_path = FIXTURES_DIR / csv_fixture
        config = load_python_config(FIXTURES_DIR / config_file)
        output_csv = tmp_path / "output.csv"

        result = convert(csv_path, output_csv, config)

        required_columns = [
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

        for col in required_columns:
            assert col in result.columns, f"Missing column: {col} in {csv_fixture}"

    @pytest.mark.parametrize(
        "csv_fixture,config_file",
        [
            ("single_header_ned.csv", "mapping_single_header_ned.py"),
            ("single_header_lla.csv", "mapping_single_header_lla.py"),
            ("double_header_ned.csv", "mapping_double_header_ned.py"),
            ("double_header_lla.csv", "mapping_double_header_lla.py"),
        ],
    )
    def test_entity_type_is_platform(
        self, csv_fixture: str, config_file: str, tmp_path: Path
    ) -> None:
        """Verify entity_type is 'platform' for all rows."""
        csv_path = FIXTURES_DIR / csv_fixture
        config = load_python_config(FIXTURES_DIR / config_file)
        output_csv = tmp_path / "output.csv"

        result = convert(csv_path, output_csv, config)

        assert all(result["entity_type"] == "platform")

    @pytest.mark.parametrize(
        "csv_fixture,config_file",
        [
            ("single_header_ned.csv", "mapping_single_header_ned.py"),
            ("single_header_lla.csv", "mapping_single_header_lla.py"),
            ("double_header_ned.csv", "mapping_double_header_ned.py"),
            ("double_header_lla.csv", "mapping_double_header_lla.py"),
        ],
    )
    def test_platform_id_matches_entity_id(
        self, csv_fixture: str, config_file: str, tmp_path: Path
    ) -> None:
        """Verify platform_id matches entity_id."""
        csv_path = FIXTURES_DIR / csv_fixture
        config = load_python_config(FIXTURES_DIR / config_file)
        output_csv = tmp_path / "output.csv"

        result = convert(csv_path, output_csv, config)

        assert list(result["platform_id"]) == list(result["entity_id"])
