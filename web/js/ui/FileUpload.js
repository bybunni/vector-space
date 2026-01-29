/**
 * FileUpload.js
 *
 * Handles CSV file upload and parsing. Supports loading multiple files simultaneously.
 */

export class FileUpload {
    constructor(fileInputElement, onFilesLoaded, onError) {
        this.fileInput = fileInputElement;
        this.onFilesLoaded = onFilesLoaded;
        this.onError = onError;

        this.setupEventListeners();
    }

    /**
     * Set up file input event listeners
     */
    setupEventListeners() {
        this.fileInput.addEventListener('change', (event) => {
            this.handleFileSelect(event);
        });

        // Also handle drag-and-drop
        const dropZone = document.getElementById('canvas');
        if (dropZone) {
            dropZone.addEventListener('dragover', (event) => {
                event.preventDefault();
                event.stopPropagation();
                dropZone.style.opacity = '0.5';
            });

            dropZone.addEventListener('dragleave', (event) => {
                event.preventDefault();
                event.stopPropagation();
                dropZone.style.opacity = '1.0';
            });

            dropZone.addEventListener('drop', (event) => {
                event.preventDefault();
                event.stopPropagation();
                dropZone.style.opacity = '1.0';

                const files = event.dataTransfer.files;
                if (files.length > 0) {
                    this.loadFiles(files);
                }
            });
        }
    }

    /**
     * Handle file selection from input
     * @param {Event} event
     */
    handleFileSelect(event) {
        const files = event.target.files;
        if (files.length > 0) {
            this.loadFiles(files);
        }
    }

    /**
     * Read a single file as text
     * @param {File} file
     * @returns {Promise<{text: string, name: string}>}
     */
    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            if (!file.name.endsWith('.csv')) {
                reject(new Error(`Not a CSV file: ${file.name}`));
                return;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                resolve({ text: event.target.result, name: file.name });
            };
            reader.onerror = () => {
                reject(new Error(`Failed to read file: ${file.name}`));
            };
            reader.readAsText(file);
        });
    }

    /**
     * Load and parse multiple files in parallel
     * @param {FileList} files
     */
    async loadFiles(files) {
        try {
            const promises = Array.from(files).map(file => this.readFileAsText(file));
            const results = await Promise.all(promises);
            this.onFilesLoaded(results);
        } catch (error) {
            this.onError(error);
        }

        // Reset so re-selecting the same files triggers change event
        this.fileInput.value = '';
    }

    /**
     * Trigger file selection dialog programmatically
     */
    selectFile() {
        this.fileInput.click();
    }
}
