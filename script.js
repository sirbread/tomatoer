let cropper;
let ffmpeg;
let croppedBlob = null;
let targetPosX = 50; 
let targetPosY = 50; 
const BASE_MARKER_SIZE = 24;

// steps
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');
const step4 = document.getElementById('step4');

// upload elements
const dropzone = document.getElementById('dropzone');
const imageUpload = document.getElementById('imageUpload');

// other elements
const imageToCrop = document.getElementById('imageToCrop');
const confirmCropBtn = document.getElementById('confirmCropBtn');
const cancelUploadBtn = document.getElementById('cancelUploadBtn');
const backToCropBtn = document.getElementById('backToCropBtn');
const processBtn = document.getElementById('processBtn');
const startOverBtn = document.getElementById('startOverBtn');

// sliders
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');
const zoomSlider = document.getElementById('zoomSlider');
const zoomValue = document.getElementById('zoomValue');

// targeting elements
const targetContainer = document.getElementById('targetContainer');
const targetImage = document.getElementById('targetImage');
const targetMarker = document.getElementById('targetMarker');

// output
const loading = document.getElementById('loading');
const resultContainer = document.getElementById('resultContainer');
const outputPreview = document.getElementById('outputPreview');
const downloadBtn = document.getElementById('downloadBtn');

function showStep(stepElement) {
    [step1, step2, step3, step4].forEach(el => el.classList.add('hidden'));
    stepElement.classList.remove('hidden');
}

// ffmpeg shtuff
async function initFFmpeg() {
    const { FFmpeg } = window.FFmpegWASM;
    ffmpeg = new FFmpeg();
    try {
        const baseURL = new URL('.', window.location.href).href;
        await ffmpeg.load({
            coreURL: new URL('assets/ffmpeg-core.js', baseURL).href,
            wasmURL: new URL('assets/ffmpeg-core.wasm', baseURL).href,
        });
        console.log("ffmpeg ready to roll");
    } catch (e) {
        console.error("ffmpeg failed:", e);
        alert("ffmpeg broke. did you download the files?");
    }
}
initFFmpeg();

// drag n drop
dropzone.addEventListener('click', () => imageUpload.click());

dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
        imageUpload.files = e.dataTransfer.files;
        imageUpload.dispatchEvent(new Event('change'));
    }
});

// file reading shtuff
imageUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        imageToCrop.src = event.target.result;
        
        if (cropper) { cropper.destroy(); }
        showStep(step2);

        cropper = new Cropper(imageToCrop, {
            aspectRatio: 1,
            viewMode: 1,
            autoCropArea: 1,
            background: false
        });
    };
    reader.readAsDataURL(file);
});

cancelUploadBtn.addEventListener('click', () => {
    imageUpload.value = ''; 
    showStep(step1);
});

function updateMarkerSize() {
    const zoom = parseFloat(zoomSlider.value);
    const newSize = BASE_MARKER_SIZE * zoom;
    targetMarker.style.width = `${newSize}px`;
    targetMarker.style.height = `${newSize}px`;
}

speedSlider.addEventListener('input', (e) => speedValue.textContent = `${e.target.value}x`);
zoomSlider.addEventListener('input', (e) => {
    zoomValue.textContent = `${e.target.value}x`;
    updateMarkerSize();
});

confirmCropBtn.addEventListener('click', () => {
    if (!cropper) return;
    
    const croppedCanvas = cropper.getCroppedCanvas({ width: 720, height: 720 });
    
    croppedCanvas.toBlob((blob) => {
        croppedBlob = blob;
        targetImage.src = URL.createObjectURL(blob);
        
        targetPosX = 50;
        targetPosY = 50;
        targetMarker.style.left = '50%';
        targetMarker.style.top = '50%';
        updateMarkerSize(); 

        showStep(step3);
    }, 'image/png');
});

backToCropBtn.addEventListener('click', () => showStep(step2));

targetContainer.addEventListener('click', (e) => {
    const rect = targetContainer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    targetPosX = (x / rect.width) * 100;
    targetPosY = (y / rect.height) * 100;
    
    targetMarker.style.left = `${targetPosX}%`;
    targetMarker.style.top = `${targetPosY}%`;
});

processBtn.addEventListener('click', async () => {
    if (!ffmpeg || !ffmpeg.loaded) return alert("ffmpeg is still loading, chill");

    showStep(step4);
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

        loading.classList.add('hidden');
        resultContainer.classList.remove('hidden');

    } catch (error) {
        console.error("processing failed:", error);
        alert("something exploded, check console");
        showStep(step3);
    }
});

startOverBtn.addEventListener('click', () => {
    imageUpload.value = '';
    showStep(step1);
});