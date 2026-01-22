import * as THREE from 'three';

/**
 * GridRenderer.js
 *
 * Renders the ground plane, grid, and world axes.
 */

export class GridRenderer {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.gridGroup = new THREE.Group();

        // Infinite ground plane elements (follow camera)
        this.groundPlane = null;
        this.gridHelper = null;

        this.createGrid();
        this.createAxes();

        this.sceneManager.add(this.gridGroup);

        // Register update callback to follow camera
        this.sceneManager.onAnimate(() => this.update());
    }

    /**
     * Create ground grid
     */
    createGrid() {
        // Ground plane at Y=0 (sea level in three.js, Z=0 in NED)
        // Large size to appear infinite - follows camera position
        const gridSize = 1000000; // 1000 km - effectively infinite
        const gridDivisions = 100;

        this.gridHelper = new THREE.GridHelper(
            gridSize,
            gridDivisions,
            0x444444, // Center line color
            0x222222  // Grid color
        );

        this.gridGroup.add(this.gridHelper);

        // Add a ground plane for better visualization
        const groundGeometry = new THREE.PlaneGeometry(gridSize, gridSize);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x0a0a0f,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.3
        });

        this.groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
        this.groundPlane.rotation.x = -Math.PI / 2; // Rotate to horizontal
        this.groundPlane.position.y = -0.1; // Slightly below grid to avoid z-fighting

        this.gridGroup.add(this.groundPlane);
    }

    /**
     * Update ground plane to follow camera (creates infinite ground effect)
     */
    update() {
        const camera = this.sceneManager.getCamera();
        if (!camera) return;

        // Move ground plane and grid to follow camera's horizontal position
        // This creates the illusion of an infinite ground plane
        if (this.groundPlane) {
            this.groundPlane.position.x = camera.position.x;
            this.groundPlane.position.z = camera.position.z;
        }
        if (this.gridHelper) {
            this.gridHelper.position.x = camera.position.x;
            this.gridHelper.position.z = camera.position.z;
        }
    }

    /**
     * Create world axes
     * Red = North (X-axis)
     * Green = Up (Y-axis)
     * Blue = East (Z-axis)
     */
    createAxes() {
        const axisLength = 1000;
        const axisRadius = 5;

        // North axis (Red, +X)
        const northGeometry = new THREE.CylinderGeometry(axisRadius, axisRadius, axisLength, 8);
        const northMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        const northAxis = new THREE.Mesh(northGeometry, northMaterial);
        northAxis.rotation.z = -Math.PI / 2;
        northAxis.position.set(axisLength / 2, 0, 0);
        this.gridGroup.add(northAxis);

        // North label
        this.addAxisLabel('N', new THREE.Vector3(axisLength + 100, 0, 0), 0xff0000);

        // Up axis (Green, +Y)
        const upGeometry = new THREE.CylinderGeometry(axisRadius, axisRadius, axisLength, 8);
        const upMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
        const upAxis = new THREE.Mesh(upGeometry, upMaterial);
        upAxis.position.set(0, axisLength / 2, 0);
        this.gridGroup.add(upAxis);

        // Up label
        this.addAxisLabel('U', new THREE.Vector3(0, axisLength + 100, 0), 0x00ff00);

        // East axis (Blue, +Z)
        const eastGeometry = new THREE.CylinderGeometry(axisRadius, axisRadius, axisLength, 8);
        const eastMaterial = new THREE.MeshStandardMaterial({ color: 0x0000ff });
        const eastAxis = new THREE.Mesh(eastGeometry, eastMaterial);
        eastAxis.rotation.x = Math.PI / 2;
        eastAxis.position.set(0, 0, axisLength / 2);
        this.gridGroup.add(eastAxis);

        // East label
        this.addAxisLabel('E', new THREE.Vector3(0, 0, axisLength + 100), 0x0000ff);

        // Also add AxesHelper for reference at origin
        const axesHelper = new THREE.AxesHelper(500);
        this.gridGroup.add(axesHelper);
    }

    /**
     * Add text label for axis
     * @param {string} text - Label text
     * @param {THREE.Vector3} position - Label position
     * @param {number} color - Label color
     */
    addAxisLabel(text, position, color) {
        // Create a sprite for the label (simple approach)
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 128;
        canvas.height = 128;

        context.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
        context.font = 'Bold 80px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, 64, 64);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.copy(position);
        sprite.scale.set(200, 200, 1);

        this.gridGroup.add(sprite);
    }

    /**
     * Remove grid from scene
     */
    dispose() {
        this.sceneManager.remove(this.gridGroup);

        // Dispose geometries and materials
        this.gridGroup.traverse((object) => {
            if (object.geometry) {
                object.geometry.dispose();
            }
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => {
                        if (material.map) material.map.dispose();
                        material.dispose();
                    });
                } else {
                    if (object.material.map) object.material.map.dispose();
                    object.material.dispose();
                }
            }
        });
    }
}
