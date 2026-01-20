import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * SceneManager.js
 *
 * Manages the three.js scene, camera, renderer, and lighting.
 */

export class SceneManager {
    constructor(canvasElement) {
        this.canvas = canvasElement;

        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);

        // Create camera
        this.camera = new THREE.PerspectiveCamera(
            60, // FOV
            window.innerWidth / window.innerHeight, // Aspect ratio
            0.1, // Near plane
            50000 // Far plane
        );
        this.camera.position.set(2000, 1000, 2000);
        this.camera.lookAt(0, 0, 0);

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // Add orbit controls
        this.controls = new OrbitControls(this.camera, this.canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = true;
        this.controls.minDistance = 10;
        this.controls.maxDistance = 30000;

        // Add lighting
        this.setupLighting();

        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize());

        // Animation loop
        this.isAnimating = false;
        this.animationCallbacks = [];
    }

    /**
     * Set up scene lighting
     */
    setupLighting() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        // Directional light (sun)
        const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
        sunLight.position.set(1000, 2000, 500);
        sunLight.castShadow = false; // Disable shadows for performance
        this.scene.add(sunLight);

        // Hemisphere light for better ground/sky differentiation
        const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x545454, 0.3);
        this.scene.add(hemiLight);
    }

    /**
     * Handle window resize
     */
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    /**
     * Add object to scene
     * @param {THREE.Object3D} object
     */
    add(object) {
        this.scene.add(object);
    }

    /**
     * Remove object from scene
     * @param {THREE.Object3D} object
     */
    remove(object) {
        this.scene.remove(object);
    }

    /**
     * Register animation callback
     * @param {Function} callback - Called each frame with (time)
     */
    onAnimate(callback) {
        this.animationCallbacks.push(callback);
    }

    /**
     * Start animation loop
     */
    startAnimation() {
        if (this.isAnimating) return;

        this.isAnimating = true;
        this.animate();
    }

    /**
     * Stop animation loop
     */
    stopAnimation() {
        this.isAnimating = false;
    }

    /**
     * Animation loop
     */
    animate() {
        if (!this.isAnimating) return;

        requestAnimationFrame(() => this.animate());

        const time = performance.now();

        // Update controls
        this.controls.update();

        // Call animation callbacks
        for (const callback of this.animationCallbacks) {
            callback(time);
        }

        // Render
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Focus camera on specific position
     * @param {THREE.Vector3} position
     * @param {number} distance - Distance from target
     */
    focusOn(position, distance = 1000) {
        this.controls.target.copy(position);

        // Position camera at distance
        const direction = new THREE.Vector3(1, 0.5, 1).normalize();
        this.camera.position.copy(position).add(direction.multiplyScalar(distance));

        this.controls.update();
    }

    /**
     * Get the scene
     * @returns {THREE.Scene}
     */
    getScene() {
        return this.scene;
    }

    /**
     * Get the camera
     * @returns {THREE.Camera}
     */
    getCamera() {
        return this.camera;
    }

    /**
     * Get the renderer
     * @returns {THREE.WebGLRenderer}
     */
    getRenderer() {
        return this.renderer;
    }

    /**
     * Clear the scene
     */
    clear() {
        // Remove all objects except lights
        const objectsToRemove = [];
        this.scene.traverse((object) => {
            if (object !== this.scene && !(object instanceof THREE.Light)) {
                objectsToRemove.push(object);
            }
        });

        for (const object of objectsToRemove) {
            this.scene.remove(object);

            // Dispose geometry and materials
            if (object.geometry) {
                object.geometry.dispose();
            }
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => material.dispose());
                } else {
                    object.material.dispose();
                }
            }
        }
    }
}
