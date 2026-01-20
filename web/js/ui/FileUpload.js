/**
 * FileUpload.js
 *
 * Handles CSV file upload and parsing.
 */

export class FileUpload {
    constructor(fileInputElement, onFileLoaded, onError) {
        this.fileInput = fileInputElement;
        this.onFileLoaded = onFileLoaded;
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
                    this.loadFile(files[0]);
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
            this.loadFile(files[0]);
        }
    }

    /**
     * Load and parse file
     * @param {File} file
     */
    loadFile(file) {
        // Check file extension
        if (!file.name.endsWith('.csv')) {
            this.onError(new Error('Please select a CSV file'));
            return;
        }

        const reader = new FileReader();

        reader.onload = (event) => {
            try {
                const csvText = event.target.result;
                this.onFileLoaded(csvText, file.name);
            } catch (error) {
                this.onError(error);
            }
        };

        reader.onerror = () => {
            this.onError(new Error('Failed to read file'));
        };

        reader.readAsText(file);
    }

    /**
     * Trigger file selection dialog programmatically
     */
    selectFile() {
        this.fileInput.click();
    }
}
