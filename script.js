let cropper;
let ffmpeg;

const imageUpload = document.getElementById('imageUpload');
const imageToCrop = document.getElementById('imageToCrop');
const processBtn = document.getElementById('processBtn');
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');
const zoomSlider = document.getElementById('zoomSlider');
const zoomValue = document.getElementById('zoomValue');
const loading = document.getElementById('loading');
const outputPreview = document.getElementById('outputPreview');
const downloadBtn = document.getElementById('downloadBtn');

// 1. Initialize FFmpeg
async function initFFmpeg() {
    const { FFmpeg } = window.FFmpegWASM;
    ffmpeg = new FFmpeg();
    
    // Listen to log output for debugging
    ffmpeg.on('log', ({ message }) => {
        console.log(message);
    });

    try {
        console.log("Loading FFmpeg.wasm...");
        
        // Dynamically resolve the absolute URL based on your local server's root
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

        // Initialize Cropper.js (force 1:1 Square Aspect Ratio)
        cropper = new Cropper(imageToCrop, {
            aspectRatio: 1,
            viewMode: 1,
            autoCropArea: 1,
        });

        processBtn.disabled = false;
    };
    reader.readAsDataURL(file);
});

// Update slider labels
speedSlider.addEventListener('input', (e) => {
    speedValue.textContent = `${e.target.value}x`;
});

zoomSlider.addEventListener('input', (e) => {
    zoomValue.textContent = `${e.target.value}x`;
});

// 3. Process the Image and GIF
processBtn.addEventListener('click', async () => {
    if (!cropper || !ffmpeg || !ffmpeg.loaded) {
        alert("Please wait for FFmpeg to load and select an image.");
        return;
    }

    loading.classList.remove('hidden');
    outputPreview.classList.add('hidden');
    downloadBtn.classList.add('hidden');
    processBtn.disabled = true;

    try {
        const { fetchFile } = window.FFmpegUtil;

        // A. Get the cropped image data as a Blob
        const croppedCanvas = cropper.getCroppedCanvas({
            width: 720,
            height: 720
        });
        
        const croppedBlob = await new Promise(resolve => {
            croppedCanvas.toBlob(resolve, 'image/jpeg');
        });

        // B. Write files to FFmpeg virtual file system
        const baseURL = new URL('.', window.location.href).href;
        await ffmpeg.writeFile('bg.jpg', await fetchFile(croppedBlob));
        await ffmpeg.writeFile('tomato.gif', await fetchFile(new URL('assets/tomato-throw.gif', baseURL).href));

        // C. Calculate speed and zoom manipulation
        const speed = parseFloat(speedSlider.value);
        const ptsFactor = 1 / speed;
        
        const zoom = parseFloat(zoomSlider.value);
        const gifSize = Math.round(720 * zoom); // Calculate new size based on zoom

        // D. Execute FFmpeg Command
        // We updated the overlay coordinates to (W-w)/2:(H-h)/2 to keep it centered
        // no matter how much larger or smaller the GIF is compared to the background.
        await ffmpeg.exec([
            '-loop', '1',
            '-i', 'bg.jpg',
            '-i', 'tomato.gif',
            '-filter_complex', `[1:v]setpts=${ptsFactor}*PTS,scale=${gifSize}:${gifSize}[gif_scaled];[0:v][gif_scaled]overlay=(W-w)/2:(H-h)/2:format=auto:shortest=1`,
            '-gifflags', '+transdiff',
            '-y', 'output.gif'
        ]);

        // E. Read the output file and display it
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
    }
});