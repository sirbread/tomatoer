let cropper;
let ffmpeg;
let croppedBlob = null;
let targetPosX = 50; 
let targetPosY = 50; 
const BASE_MARKER_SIZE = 24;
let throwMode = 'single';
let multiThrowType = 'synced';
let throwQueue = [];
let liveThrowStartTime = null;

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
const throwMarkers = document.getElementById('throwMarkers');
const targetHelpText = document.getElementById('targetHelpText');

const singleModeBtn = document.getElementById('singleModeBtn');
const multiModeBtn = document.getElementById('multiModeBtn');
const multiOptions = document.getElementById('multiOptions');
const multiTypeSelect = document.getElementById('multiTypeSelect');
const clearThrowsBtn = document.getElementById('clearThrowsBtn');

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

function resetQueuedThrows() {
    throwQueue = [];
    liveThrowStartTime = null;
    throwMarkers.innerHTML = '';
}

function updateThrowUi() {
    const isSingle = throwMode === 'single';

    singleModeBtn.classList.toggle('active', isSingle);
    multiModeBtn.classList.toggle('active', !isSingle);
    multiOptions.classList.toggle('hidden', isSingle);
    targetMarker.classList.toggle('hidden', !isSingle);

    if (isSingle) {
        targetHelpText.textContent = 'click the image to place the target throw';
        clearThrowsBtn.classList.add('hidden');
        resetQueuedThrows();
        return;
    }

    const isLive = multiThrowType === 'live';
    targetHelpText.textContent = isLive
        ? 'tap to queue throws in order (timed live), then hit tomato!'
        : 'tap to add spots for tomatoes (all throws happen at once)';
    clearThrowsBtn.classList.remove('hidden');
}

function renderQueuedThrows() {
    throwMarkers.innerHTML = '';
    const markerSize = Math.max(16, Math.round(BASE_MARKER_SIZE * parseFloat(zoomSlider.value)));

    throwQueue.forEach((throwPoint) => {
        const marker = document.createElement('div');
        marker.className = 'queued-marker';
        marker.style.left = `${throwPoint.x}%`;
        marker.style.top = `${throwPoint.y}%`;
        marker.style.width = `${markerSize}px`;
        marker.style.height = `${markerSize}px`;
        throwMarkers.appendChild(marker);
    });
}

function getGifDurationSeconds(gifData) {
    let totalDelayHundredths = 0;

    for (let i = 0; i < gifData.length - 7; i += 1) {
        if (gifData[i] === 0x21 && gifData[i + 1] === 0xF9 && gifData[i + 2] === 0x04) {
            const delay = gifData[i + 4] + (gifData[i + 5] << 8);
            totalDelayHundredths += delay;
            i += 7;
        }
    }

    if (totalDelayHundredths <= 0) return 1;
    return totalDelayHundredths / 100;
}

speedSlider.addEventListener('input', (e) => speedValue.textContent = `${e.target.value}x`);
zoomSlider.addEventListener('input', (e) => {
    zoomValue.textContent = `${e.target.value}x`;
    updateMarkerSize();
    if (throwMode === 'multi') {
        renderQueuedThrows();
    }
});

singleModeBtn.addEventListener('click', () => {
    throwMode = 'single';
    updateThrowUi();
});

multiModeBtn.addEventListener('click', () => {
    throwMode = 'multi';
    updateThrowUi();
});

multiTypeSelect.addEventListener('change', (e) => {
    multiThrowType = e.target.value;
    resetQueuedThrows();
    updateThrowUi();
});

clearThrowsBtn.addEventListener('click', () => {
    resetQueuedThrows();
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
        throwMode = 'single';
        multiThrowType = 'synced';
        multiTypeSelect.value = 'synced';
        updateThrowUi();

        showStep(step3);
    }, 'image/png');
});

backToCropBtn.addEventListener('click', () => showStep(step2));

targetContainer.addEventListener('click', (e) => {
    const rect = targetContainer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (throwMode === 'single') {
        targetPosX = (x / rect.width) * 100;
        targetPosY = (y / rect.height) * 100;

        targetMarker.style.left = `${targetPosX}%`;
        targetMarker.style.top = `${targetPosY}%`;
        return;
    }

    const timestamp = performance.now();
    if (multiThrowType === 'live' && liveThrowStartTime === null) {
        liveThrowStartTime = timestamp;
    }

    const delay = multiThrowType === 'live' ? (timestamp - liveThrowStartTime) / 1000 : 0;
    throwQueue.push({
        x: (x / rect.width) * 100,
        y: (y / rect.height) * 100,
        delay
    });
    renderQueuedThrows();
});

processBtn.addEventListener('click', async () => {
    if (!ffmpeg || !ffmpeg.loaded) return alert("ffmpeg is still loading, chill");

    const throwPlan = throwMode === 'single'
        ? [{ x: targetPosX, y: targetPosY, delay: 0 }]
        : throwQueue.map((throwPoint) => ({
            x: throwPoint.x,
            y: throwPoint.y,
            delay: multiThrowType === 'live' ? throwPoint.delay : 0
        }));

    if (!throwPlan.length) {
        return alert("tap the image first so i know where to throw");
    }

    showStep(step4);
    loading.classList.remove('hidden');
    resultContainer.classList.add('hidden');

    try {
        const { fetchFile } = window.FFmpegUtil;
        const baseURL = new URL('.', window.location.href).href;

        await ffmpeg.writeFile('bg.png', await fetchFile(croppedBlob));
        const tomatoGifData = await fetchFile(new URL('assets/tomato-throw.gif', baseURL).href);
        await ffmpeg.writeFile('tomato.gif', tomatoGifData);

        const speed = parseFloat(speedSlider.value);
        const ptsFactor = 1 / speed;
        const zoom = parseFloat(zoomSlider.value);
        const gifSize = Math.round(720 * zoom);
        const tomatoGifDurationSeconds = getGifDurationSeconds(tomatoGifData) * ptsFactor;

        const filterParts = [];
        throwPlan.forEach((throwPoint, index) => {
            const targetPixelX = (720 * (throwPoint.x / 100));
            const targetPixelY = (720 * (throwPoint.y / 100));
            const overlayX = Math.round(targetPixelX - (gifSize / 2));
            const overlayY = Math.round(targetPixelY - (gifSize / 2));
            const streamLabel = `gif_${index}`;
            const delayShift = throwPoint.delay > 0 ? `+${throwPoint.delay.toFixed(3)}/TB` : '';
            filterParts.push(`[1:v]setpts=${ptsFactor}*PTS${delayShift},scale=${gifSize}:${gifSize}[${streamLabel}]`);
            const previousLabel = index === 0 ? '0:v' : `comp_${index - 1}`;
            const composedLabel = `comp_${index}`;
            filterParts.push(`[${previousLabel}][${streamLabel}]overlay=${overlayX}:${overlayY}:format=auto:eof_action=pass[${composedLabel}]`);
        });

        const maxDelay = throwPlan.reduce((maxValue, throwPoint) => Math.max(maxValue, throwPoint.delay || 0), 0);
        const finalDuration = (maxDelay + tomatoGifDurationSeconds + 0.05).toFixed(3);
        const finalComposite = `comp_${throwPlan.length - 1}`;
        filterParts.push(`[${finalComposite}]trim=duration=${finalDuration},setpts=PTS-STARTPTS[composed]`);
        filterParts.push('[composed]split[s0][s1]');
        filterParts.push('[s0]palettegen[p]');
        filterParts.push('[s1][p]paletteuse');

        await ffmpeg.exec([
            '-loop', '1',
            '-i', 'bg.png',
            '-i', 'tomato.gif',
            '-filter_complex', filterParts.join(';'),
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
