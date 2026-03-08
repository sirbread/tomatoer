let cropper;
let ffmpeg;
let croppedBlob = null;
let targetPosX = 50; 
let targetPosY = 50; 
const BASE_MARKER_SIZE = 24;

// Steps
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');
const step4 = document.getElementById('step4');

// Elements
const imageUpload = document.getElementById('imageUpload');
const imageToCrop = document.getElementById('imageToCrop');
const confirmCropBtn = document.getElementById('confirmCropBtn');
const cancelUploadBtn = document.getElementById('cancelUploadBtn');
const backToCropBtn = document.getElementById('backToCropBtn');
const processBtn = document.getElementById('processBtn');
const startOverBtn = document.getElementById('startOverBtn');

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
const resultContainer = document.getElementById('resultContainer');
const outputPreview = document.getElementById('outputPreview');
const downloadBtn = document.getElementById('downloadBtn');

// Helper to switch UI views
function showStep(stepElement) {
    [step1, step2, step3, step4].forEach(el => el.classList.add('hidden'));
    stepElement.classList.remove('hidden');
}

// 1. Initialize FFmpeg
async function initFFmpeg() {
    const { FFmpeg } = window.FFmpegWASM;
    ffmpeg = new FFmpeg();
    
    try {
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

// STEP 1 -> STEP 2: Handle Upload
imageUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        imageToCrop.src = event.target.result;
        
        if (cropper) { cropper.destroy(); }

        showStep(step2); // Switch to Crop UI

        // Initialize Cropper AFTER the element is visible
        cropper = new Cropper(imageToCrop, {
            aspectRatio: 1,
            viewMode: 1,
            autoCropArea: 1,
        });
    };
    reader.readAsDataURL(file);
});

// Cancel Upload (Back to Step 1)
cancelUploadBtn.addEventListener('click', () => {
    imageUpload.value = ''; // clear input
    showStep(step1);
});

// Helper: Scale Marker
function updateMarkerSize() {
    const zoom = parseFloat(zoomSlider.value);
    const newSize = BASE_MARKER_SIZE * zoom;
    targetMarker.style.width = `${newSize}px`;
    targetMarker.style.height = `${newSize}px`;
}

// Update sliders
speedSlider.addEventListener('input', (e) => speedValue.textContent = `${e.target.value}x`);
zoomSlider.addEventListener('input', (e) => {
    zoomValue.textContent = `${e.target.value}x`;
    updateMarkerSize();
});

// STEP 2 -> STEP 3: Confirm Crop
confirmCropBtn.addEventListener('click', () => {
    if (!cropper) return;
    
    const croppedCanvas = cropper.getCroppedCanvas({ width: 720, height: 720 });
    
    croppedCanvas.toBlob((blob) => {
        croppedBlob = blob;
        targetImage.src = URL.createObjectURL(blob);
        
        // Reset Targeting state
        targetPosX = 50;
        targetPosY = 50;
        targetMarker.style.left = '50%';
        targetMarker.style.top = '50%';
        updateMarkerSize(); 

        showStep(step3); // Move to Step 3
    }, 'image/png');
});

// Back to Step 2
backToCropBtn.addEventListener('click', () => {
    showStep(step2);
});

// Handle Targeting Clicks
targetContainer.addEventListener('click', (e) => {
    const rect = targetContainer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    targetPosX = (x / rect.width) * 100;
    targetPosY = (y / rect.height) * 100;
    
    targetMarker.style.left = `${targetPosX}%`;
    targetMarker.style.top = `${targetPosY}%`;
});

// STEP 3 -> STEP 4: Process Overlay
processBtn.addEventListener('click', async () => {
    if (!ffmpeg || !ffmpeg.loaded) {
        alert("Please wait for FFmpeg to finish loading.");
        return;
    }

    showStep(step4); // Move to result view
    loading.classList.remove('hidden');
    resultContainer.classList.add('hidden');

    try {
        const { fetchFile } = window.FFmpegUtil;
        const baseURL = new URL('.', window.location.href).href;

        await ffmpeg.writeFile('bg.png', await fetchFile(croppedBlob));
        await ffmpeg.writeFile('tomato.gif', await fetchFile(new URL('assets/tomato-throw.gif', baseURL).href));

        const speed = parseFloat(speedSlider.value);
        const ptsFactor = 1 / speed;
        const zoom = parseFloat(zoomSlider.value);
        const gifSize = Math.round(720 * zoom);

        const targetPixelX = (720 * (targetPosX / 100));
        const targetPixelY = (720 * (targetPosY / 100));
        const overlayX = Math.round(targetPixelX - (gifSize / 2));
        const overlayY = Math.round(targetPixelY - (gifSize / 2));

        await ffmpeg.exec([
            '-loop', '1',
            '-i', 'bg.png',
            '-i', 'tomato.gif',
            '-filter_complex', `[1:v]setpts=${ptsFactor}*PTS,scale=${gifSize}:${gifSize}[gif_scaled];[0:v][gif_scaled]overlay=${overlayX}:${overlayY}:format=auto:shortest=1[composed];[composed]split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
            '-y', 'output.gif'
        ]);

        const data = await ffmpeg.readFile('output.gif');
        const outputBlob = new Blob([data.buffer], { type: 'image/gif' });
        const outputUrl = URL.createObjectURL(outputBlob);

        outputPreview.src = outputUrl;
        downloadBtn.href = outputUrl;

        // Hide loader, show result
        loading.classList.add('hidden');
        resultContainer.classList.remove('hidden');

    } catch (error) {
        console.error("Processing failed:", error);
        alert("Processing failed. Please check the console.");
        showStep(step3); // Go back if error
    }
});

// START OVER (Step 4 -> Step 1)
startOverBtn.addEventListener('click', () => {
    imageUpload.value = '';
    showStep(step1);
});