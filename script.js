let cropper;
let ffmpeg;
let croppedBlob = null;
let targetPosX = 50; // Default center (50%)
let targetPosY = 50; // Default center (50%)

// The base size of the visual marker when zoom is 1x
const BASE_MARKER_SIZE = 24;

// Elements
const imageUpload = document.getElementById('imageUpload');
const imageToCrop = document.getElementById('imageToCrop');
const cropSection = document.getElementById('cropSection');
const targetSection = document.getElementById('targetSection');
const confirmCropBtn = document.getElementById('confirmCropBtn');
const backToCropBtn = document.getElementById('backToCropBtn');
const processBtn = document.getElementById('processBtn');

// Sliders
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');
const zoomSlider = document.getElementById('zoomSlider');
const zoomValue = document.getElementById('zoomValue');

// Targeting Elements
const targetContainer = document.getElementById('targetContainer');
const targetImage = document.getElementById('targetImage');
const targetMarker = document.getElementById('targetMarker');

// Output
const loading = document.getElementById('loading');
const outputPreview = document.getElementById('outputPreview');
const downloadBtn = document.getElementById('downloadBtn');

// 1. Initialize FFmpeg
async function initFFmpeg() {
    const { FFmpeg } = window.FFmpegWASM;
    ffmpeg = new FFmpeg();
    
    ffmpeg.on('log', ({ message }) => {
        console.log(message);
    });

    try {
        console.log("Loading FFmpeg.wasm...");
        const baseURL = new URL('.', window.location.href).href;
        await ffmpeg.load({
            coreURL: new URL('assets/ffmpeg-core.js', baseURL).href,
            wasmURL: new URL('assets/ffmpeg-core.wasm', baseURL).href,
        });
        console.log("FFmpeg loaded successfully!");
    } catch (e) {
        console.error("Error loading FFmpeg:", e);
        alert("Failed to load FFmpeg. Check the console for details.");
    }
}
initFFmpeg();

// 2. Handle Image Upload & Cropper Initialization
imageUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        imageToCrop.src = event.target.result;
        
        if (cropper) {
            cropper.destroy();
        }

        cropper = new Cropper(imageToCrop, {
            aspectRatio: 1,
            viewMode: 1,
            autoCropArea: 1,
        });

        confirmCropBtn.disabled = false;
        
        // Reset UI if uploading a new image
        cropSection.classList.remove('hidden');
        targetSection.classList.add('hidden');
    };
    reader.readAsDataURL(file);
});

// Helper function to dynamically scale the marker
function updateMarkerSize() {
    const zoom = parseFloat(zoomSlider.value);
    const newSize = BASE_MARKER_SIZE * zoom;
    targetMarker.style.width = `${newSize}px`;
    targetMarker.style.height = `${newSize}px`;
}

// Update slider labels and marker size
speedSlider.addEventListener('input', (e) => speedValue.textContent = `${e.target.value}x`);

zoomSlider.addEventListener('input', (e) => {
    zoomValue.textContent = `${e.target.value}x`;
    updateMarkerSize(); // Scale the circle live as the slider moves
});

// 3. Confirm Crop & Switch to Target View
confirmCropBtn.addEventListener('click', () => {
    if (!cropper) return;
    
    // Get cropped canvas
    const croppedCanvas = cropper.getCroppedCanvas({
        width: 720,
        height: 720
    });
    
    // Convert to blob and DataURL
    croppedCanvas.toBlob((blob) => {
        croppedBlob = blob;
        targetImage.src = URL.createObjectURL(blob);
        
        // Switch views
        cropSection.classList.add('hidden');
        targetSection.classList.remove('hidden');
        
        // Reset marker to center and ensure correct starting size
        targetPosX = 50;
        targetPosY = 50;
        targetMarker.style.left = '50%';
        targetMarker.style.top = '50%';
        updateMarkerSize(); 
        
    }, 'image/png');
});

// 4. Back to Crop View
backToCropBtn.addEventListener('click', () => {
    cropSection.classList.remove('hidden');
    targetSection.classList.add('hidden');
});

// 5. Handle Targeting Clicks
targetContainer.addEventListener('click', (e) => {
    const rect = targetContainer.getBoundingClientRect();
    
    // Calculate click position relative to the container
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Convert to percentages
    targetPosX = (x / rect.width) * 100;
    targetPosY = (y / rect.height) * 100;
    
    // Move visual marker
    targetMarker.style.left = `${targetPosX}%`;
    targetMarker.style.top = `${targetPosY}%`;
});

// 6. Process the Image and GIF
processBtn.addEventListener('click', async () => {
    if (!croppedBlob || !ffmpeg || !ffmpeg.loaded) {
        alert("Please wait for FFmpeg to load and ensure you have cropped the image.");
        return;
    }

    loading.classList.remove('hidden');
    outputPreview.classList.add('hidden');
    downloadBtn.classList.add('hidden');
    processBtn.disabled = true;
    backToCropBtn.disabled = true;

    try {
        const { fetchFile } = window.FFmpegUtil;

        // A. Write files to FFmpeg virtual file system
        const baseURL = new URL('.', window.location.href).href;
        await ffmpeg.writeFile('bg.png', await fetchFile(croppedBlob));
        await ffmpeg.writeFile('tomato.gif', await fetchFile(new URL('assets/tomato-throw.gif', baseURL).href));

        // B. Calculate speed, zoom, and positioning
        const speed = parseFloat(speedSlider.value);
        const ptsFactor = 1 / speed;
        
        const zoom = parseFloat(zoomSlider.value);
        const gifSize = Math.round(720 * zoom);

        // Calculate exact pixel coordinates for the overlay based on our clicks
        const targetPixelX = (720 * (targetPosX / 100));
        const targetPixelY = (720 * (targetPosY / 100));
        const overlayX = Math.round(targetPixelX - (gifSize / 2));
        const overlayY = Math.round(targetPixelY - (gifSize / 2));

        // C. Execute FFmpeg Command
        await ffmpeg.exec([
            '-loop', '1',
            '-i', 'bg.png',
            '-i', 'tomato.gif',
            '-filter_complex', `[1:v]setpts=${ptsFactor}*PTS,scale=${gifSize}:${gifSize}[gif_scaled];[0:v][gif_scaled]overlay=${overlayX}:${overlayY}:format=auto:shortest=1[composed];[composed]split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
            '-y', 'output.gif'
        ]);

        // D. Read the output file and display it
        const data = await ffmpeg.readFile('output.gif');
        const outputBlob = new Blob([data.buffer], { type: 'image/gif' });
        const outputUrl = URL.createObjectURL(outputBlob);

        outputPreview.src = outputUrl;
        outputPreview.classList.remove('hidden');
        
        downloadBtn.href = outputUrl;
        downloadBtn.classList.remove('hidden');

    } catch (error) {
        console.error("Processing failed:", error);
        alert("An error occurred during processing. Check console for details.");
    } finally {
        loading.classList.add('hidden');
        processBtn.disabled = false;
        backToCropBtn.disabled = false;
    }
});