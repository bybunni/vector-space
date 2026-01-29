# Claude Code Instructions for Vector Space

## Project Overview
Vector Space is an aerospace trajectory visualizer built with Three.js. It renders platforms, sensors, and trajectory data from CSV files in a 3D environment.

## Version Display
A version number is displayed in the top-right corner of the UI (`web/index.html`). This helps verify that browser cache is not serving stale files.

### Version Incrementation Rules
- Increment the patch version in `web/index.html` (`<div id="version-display">vX.Y.Z</div>`) after making any changes to JavaScript or CSS files
- This allows the user to confirm they are viewing the latest code after clearing cache
- Example: `v0.2.4` → `v0.2.5`

## Key Directories
- `web/js/core/` - Data models, CSV parsing, coordinate systems
- `web/js/rendering/` - Three.js renderers for platforms, sensors, trajectories
- `web/js/ui/` - UI panels and controls
- `web/css/` - Stylesheets
- `web/data/` - Test CSV files

## Coordinate System
- Data uses NED (North-East-Down) convention
- Three.js uses Y-up: (X=North, Y=Up, Z=East)
- Conversions are handled in `CoordinateSystem.js`

## Agent Parallelism
- Use parallel sub-agents for embarrassingly parallel tasks: searching multiple directories, reading multiple files, running independent checks
- Example: when exploring the codebase, search `web/js/core/`, `web/js/rendering/`, and `web/js/ui/` concurrently rather than sequentially

## Common Commands
```bash
# Serve locally (from project root)
python -m http.server 8000 --directory web
```
