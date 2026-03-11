let cropper;
let ffmpeg;
let croppedBlob = null;
let targetPosX = 50; 
let targetPosY = 50; 
const BASE_MARKER_SIZE = 24;
let liveTaps = [];

// multi-tomato constants
const SYNCED_TOMATO_COUNT = 8;
const SYNCED_TOMATO_SIZE = 200; // px on the 720x720 canvas
const LIVE_TOMATO_SIZE = 200;   // px on the 720x720 canvas
const TOMATO_GIF_DURATION = 2.5; // estimated duration of tomato-throw.gif in seconds
const MIN_SPACING_MULTIPLIER = 0.6; // minimum gap between tomato centers as a fraction of tomato size
const MAX_PLACEMENT_ATTEMPTS = 2000; // cap to avoid infinite loop when placing tomatoes

// steps
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step2b = document.getElementById('step2b');
const step2c = document.getElementById('step2c');
const step2d = document.getElementById('step2d');
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

// live mode elements
const liveContainer = document.getElementById('liveContainer');
const liveImage = document.getElementById('liveImage');
const tapCountEl = document.getElementById('tapCount');
const generateLiveBtn = document.getElementById('generateLiveBtn');

// output
const loading = document.getElementById('loading');
const resultContainer = document.getElementById('resultContainer');
const outputPreview = document.getElementById('outputPreview');
const downloadBtn = document.getElementById('downloadBtn');

function showStep(stepElement) {
    [step1, step2, step2b, step2c, step2d, step3, step4].forEach(el => el.classList.add('hidden'));
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
        showStep(step2b);
    }, 'image/png');
});

backToCropBtn.addEventListener('click', () => showStep(step2b));

// step2b: how many tomatoes?
document.getElementById('backFromCountBtn').addEventListener('click', () => showStep(step2));

document.getElementById('oneTomaBtn').addEventListener('click', () => {
    targetImage.src = URL.createObjectURL(croppedBlob);
    targetPosX = 50;
    targetPosY = 50;
    targetMarker.style.left = '50%';
    targetMarker.style.top = '50%';
    updateMarkerSize();
    showStep(step3);
});

document.getElementById('manyTomaBtn').addEventListener('click', () => showStep(step2c));

// step2c: synced or live?
document.getElementById('backFromModeBtn').addEventListener('click', () => showStep(step2b));

document.getElementById('syncedModeBtn').addEventListener('click', () => processSynced());

document.getElementById('liveModeBtn').addEventListener('click', () => {
    liveImage.src = URL.createObjectURL(croppedBlob);
    liveTaps = [];
    clearTapMarkers();
    updateTapCount();
    generateLiveBtn.disabled = true;
    showStep(step2d);
});

// step2d: live tapping
document.getElementById('backFromLiveBtn').addEventListener('click', () => showStep(step2c));

document.getElementById('clearTapsBtn').addEventListener('click', () => {
    liveTaps = [];
    clearTapMarkers();
    updateTapCount();
    generateLiveBtn.disabled = true;
});

generateLiveBtn.addEventListener('click', () => processLive());

liveContainer.addEventListener('click', (e) => {
    const rect = liveContainer.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * 100;
    const y = (e.clientY - rect.top) / rect.height * 100;
    liveTaps.push({ x, y, t: Date.now() });
    addTapMarker(x, y, liveTaps.length - 1);
    updateTapCount();
    generateLiveBtn.disabled = false;
});

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
    liveTaps = [];
    clearTapMarkers();
    showStep(step1);
});

// ── helpers ──────────────────────────────────────────────────────────────────

function clearTapMarkers() {
    liveContainer.querySelectorAll('.tap-marker').forEach(m => m.remove());
}

function addTapMarker(xPct, yPct, index) {
    const marker = document.createElement('div');
    marker.className = 'tap-marker';
    marker.style.left = `${xPct}%`;
    marker.style.top = `${yPct}%`;
    marker.textContent = index + 1;
    liveContainer.appendChild(marker);
}

function updateTapCount() {
    const n = liveTaps.length;
    tapCountEl.textContent = `${n} tap${n !== 1 ? 's' : ''} recorded`;
}

function generateSyncedPositions(count, imageSize, gifSize) {
    const margin = gifSize / 2;
    const minDist = gifSize * MIN_SPACING_MULTIPLIER;
    const positions = [];
    let attempts = 0;
    while (positions.length < count && attempts < MAX_PLACEMENT_ATTEMPTS) {
        const cx = margin + Math.random() * (imageSize - 2 * margin);
        const cy = margin + Math.random() * (imageSize - 2 * margin);
        const tooClose = positions.some(p => {
            const dx = p.cx - cx;
            const dy = p.cy - cy;
            return Math.sqrt(dx * dx + dy * dy) < minDist;
        });
        if (!tooClose) {
            positions.push({ cx, cy, x: Math.round(cx - gifSize / 2), y: Math.round(cy - gifSize / 2) });
        }
        attempts++;
    }
    // fallback: fill remaining slots without spacing guarantee
    while (positions.length < count) {
        const cx = margin + Math.random() * (imageSize - 2 * margin);
        const cy = margin + Math.random() * (imageSize - 2 * margin);
        positions.push({ cx, cy, x: Math.round(cx - gifSize / 2), y: Math.round(cy - gifSize / 2) });
    }
    return positions;
}

// ── synced processing ─────────────────────────────────────────────────────────

async function processSynced() {
    if (!ffmpeg || !ffmpeg.loaded) return alert("ffmpeg is still loading, chill");

    showStep(step4);
    loading.classList.remove('hidden');
    resultContainer.classList.add('hidden');

    try {
        const { fetchFile } = window.FFmpegUtil;
        const baseURL = new URL('.', window.location.href).href;

        await ffmpeg.writeFile('bg.png', await fetchFile(croppedBlob));
        await ffmpeg.writeFile('tomato.gif', await fetchFile(new URL('assets/tomato-throw.gif', baseURL).href));

        const numTomatoes = SYNCED_TOMATO_COUNT;
        const gifSize = SYNCED_TOMATO_SIZE;
        const positions = generateSyncedPositions(numTomatoes, 720, gifSize);

        const splitLabels = Array.from({ length: numTomatoes }, (_, i) => `[r${i}]`).join('');
        const filterParts = [];

        filterParts.push(`[1:v]split=${numTomatoes}${splitLabels}`);
        for (let i = 0; i < numTomatoes; i++) {
            filterParts.push(`[r${i}]scale=${gifSize}:${gifSize}[g${i}]`);
        }
        for (let i = 0; i < numTomatoes; i++) {
            const { x, y } = positions[i];
            const inLabel = i === 0 ? '[0:v]' : `[c${i - 1}]`;
            const isLast = i === numTomatoes - 1;
            const outLabel = isLast ? '[composed]' : `[c${i}]`;
            const extra = isLast ? ':shortest=1' : ':eof_action=pass';
            filterParts.push(`${inLabel}[g${i}]overlay=${x}:${y}:format=auto${extra}${outLabel}`);
        }
        filterParts.push(`[composed]split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`);

        await ffmpeg.exec([
            '-loop', '1', '-i', 'bg.png',
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
        showStep(step2c);
    }
}

// ── live processing ───────────────────────────────────────────────────────────

async function processLive() {
    if (!ffmpeg || !ffmpeg.loaded) return alert("ffmpeg is still loading, chill");
    if (liveTaps.length === 0) return;

    showStep(step4);
    loading.classList.remove('hidden');
    resultContainer.classList.add('hidden');

    try {
        const { fetchFile } = window.FFmpegUtil;
        const baseURL = new URL('.', window.location.href).href;

        await ffmpeg.writeFile('bg.png', await fetchFile(croppedBlob));
        await ffmpeg.writeFile('tomato.gif', await fetchFile(new URL('assets/tomato-throw.gif', baseURL).href));

        const gifSize = LIVE_TOMATO_SIZE;

        const firstTapTime = liveTaps[0].t;
        const taps = liveTaps.map(tap => ({
            x: Math.round(720 * tap.x / 100 - gifSize / 2),
            y: Math.round(720 * tap.y / 100 - gifSize / 2),
            delay: (tap.t - firstTapTime) / 1000
        }));

        const totalDuration = taps[taps.length - 1].delay + TOMATO_GIF_DURATION;
        const N = taps.length;

        const filterParts = [];

        if (N === 1) {
            filterParts.push(`[1:v]setpts=PTS-STARTPTS,scale=${gifSize}:${gifSize}[g0]`);
        } else {
            const splitLabels = Array.from({ length: N }, (_, i) => `[r${i}]`).join('');
            filterParts.push(`[1:v]split=${N}${splitLabels}`);
            for (let i = 0; i < N; i++) {
                const delay = taps[i].delay;
                filterParts.push(`[r${i}]setpts=PTS-STARTPTS+(${delay}/TB),scale=${gifSize}:${gifSize}[g${i}]`);
            }
        }

        for (let i = 0; i < N; i++) {
            const { x, y } = taps[i];
            const inLabel = i === 0 ? '[0:v]' : `[c${i - 1}]`;
            const outLabel = i === N - 1 ? '[composed]' : `[c${i}]`;
            filterParts.push(`${inLabel}[g${i}]overlay=${x}:${y}:eof_action=pass:format=auto${outLabel}`);
        }
        filterParts.push(`[composed]split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`);

        await ffmpeg.exec([
            '-loop', '1', '-i', 'bg.png',
            '-i', 'tomato.gif',
            '-filter_complex', filterParts.join(';'),
            '-t', String(totalDuration),
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
        showStep(step2d);
    }
}