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
let liveRecording = false;

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

// live recording elements
const liveControls = document.getElementById('liveControls');
const recordBtn = document.getElementById('recordBtn');
const stopRecordBtn = document.getElementById('stopRecordBtn');
const recordingIndicator = document.getElementById('recordingIndicator');

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
    liveRecording = false;
    throwMarkers.innerHTML = '';
    updateLiveControlsUi();
}

function updateLiveControlsUi() {
    if (multiThrowType === 'live' && throwMode === 'multi') {
        liveControls.classList.remove('hidden');
    } else {
        liveControls.classList.add('hidden');
    }

    if (liveRecording) {
        recordBtn.classList.add('hidden');
        stopRecordBtn.classList.remove('hidden');
        recordingIndicator.classList.remove('hidden');
        targetContainer.style.cursor = 'crosshair';
    } else {
        recordBtn.classList.remove('hidden');
        stopRecordBtn.classList.add('hidden');
        recordingIndicator.classList.add('hidden');
        if (multiThrowType === 'live' && throwMode === 'multi') {
            targetContainer.style.cursor = 'default';
        } else {
            targetContainer.style.cursor = 'crosshair';
        }
    }
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
        updateLiveControlsUi();
        return;
    }

    const isLive = multiThrowType === 'live';
    targetHelpText.textContent = isLive
        ? 'hit record, then tap the image to place timed throws'
        : 'tap to add spots for tomatoes (all throws happen at once)';
    clearThrowsBtn.classList.remove('hidden');
    updateLiveControlsUi();
}

function renderQueuedThrows() {
    throwMarkers.innerHTML = '';
    const markerSize = Math.max(16, Math.round(BASE_MARKER_SIZE * parseFloat(zoomSlider.value)));

    throwQueue.forEach((throwPoint, index) => {
        const marker = document.createElement('div');
        marker.className = 'queued-marker';
        marker.style.left = `${throwPoint.x}%`;
        marker.style.top = `${throwPoint.y}%`;
        marker.style.width = `${markerSize}px`;
        marker.style.height = `${markerSize}px`;

        if (multiThrowType === 'live') {
            const label = document.createElement('span');
            label.className = 'marker-label';
            label.textContent = `${throwPoint.delay.toFixed(1)}s`;
            marker.appendChild(label);
        }

        if (multiThrowType === 'synced') {
            const label = document.createElement('span');
            label.className = 'marker-label';
            label.textContent = `#${index + 1}`;
            marker.appendChild(label);
        }

        throwMarkers.appendChild(marker);
    });
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
    renderQueuedThrows();
    updateLiveControlsUi();
});

// live record / stop
recordBtn.addEventListener('click', () => {
    throwQueue = [];
    liveThrowStartTime = null;
    throwMarkers.innerHTML = '';
    liveRecording = true;
    targetHelpText.textContent = 'tap the image to place throws... timestamps are live!';
    updateLiveControlsUi();
});

stopRecordBtn.addEventListener('click', () => {
    liveRecording = false;
    if (throwQueue.length > 0) {
        targetHelpText.textContent = `${throwQueue.length} throw${throwQueue.length === 1 ? '' : 's'} recorded! adjust size/speed, then hit tomato!`;
    } else {
        targetHelpText.textContent = 'hit record, then tap the image to place timed throws';
    }
    updateLiveControlsUi();
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
        liveRecording = false;
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

    if (multiThrowType === 'synced') {
        throwQueue.push({
            x: (x / rect.width) * 100,
            y: (y / rect.height) * 100,
            delay: 0
        });
        renderQueuedThrows();
        return;
    }

    if (multiThrowType === 'live') {
        if (!liveRecording) return;

        const timestamp = performance.now();
        if (liveThrowStartTime === null) {
            liveThrowStartTime = timestamp;
        }

        const delay = (timestamp - liveThrowStartTime) / 1000;
        throwQueue.push({
            x: (x / rect.width) * 100,
            y: (y / rect.height) * 100,
            delay
        });
        renderQueuedThrows();
        return;
    }
});

processBtn.addEventListener('click', async () => {
    if (!ffmpeg || !ffmpeg.loaded) return alert("ffmpeg is still loading, chill");

    if (liveRecording) {
        liveRecording = false;
        updateLiveControlsUi();
    }

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

        const speed = parseFloat(speedSlider.value);
        const ptsFactor = 1 / speed;
        const zoom = parseFloat(zoomSlider.value);
        const gifSize = Math.round(720 * zoom);

        // -----------------------------------------------------------
        // single throw: exact working filter, untouched
        // -----------------------------------------------------------
        if (throwPlan.length === 1) {
            await ffmpeg.writeFile('tomato.gif', new Uint8Array(tomatoGifData));

            const tp = throwPlan[0];
            const targetPixelX = (720 * (tp.x / 100));
            const targetPixelY = (720 * (tp.y / 100));
            const overlayX = Math.round(targetPixelX - (gifSize / 2));
            const overlayY = Math.round(targetPixelY - (gifSize / 2));

            await ffmpeg.exec([
                '-loop', '1',
                '-i', 'bg.png',
                '-i', 'tomato.gif',
                '-filter_complex',
                `[1:v]setpts=${ptsFactor}*PTS,scale=${gifSize}:${gifSize}[gif_scaled];` +
                `[0:v][gif_scaled]overlay=${overlayX}:${overlayY}:format=auto:shortest=1[composed];` +
                `[composed]split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
                '-y', 'output.gif'
            ]);
        }
        // -----------------------------------------------------------
        // multiple throws
        // -----------------------------------------------------------
        else {
            // sort by delay so the last overlay = the throw that
            // finishes last (shortest=1 on that one ends the output)
            const sorted = throwPlan
                .map((tp, i) => ({ ...tp, origIndex: i }))
                .sort((a, b) => a.delay - b.delay);

            // write a separate copy per throw — each writeFile needs
            // its own Uint8Array because the ArrayBuffer gets detached
            // (transferred to the worker) on each call
            for (let i = 0; i < sorted.length; i++) {
                await ffmpeg.writeFile(`tomato_${i}.gif`, new Uint8Array(tomatoGifData));
            }

            const inputArgs = ['-loop', '1', '-i', 'bg.png'];
            for (let i = 0; i < sorted.length; i++) {
                inputArgs.push('-i', `tomato_${i}.gif`);
            }

            const filterParts = [];

            sorted.forEach((tp, index) => {
                const inputIdx = index + 1;
                const targetPixelX = (720 * (tp.x / 100));
                const targetPixelY = (720 * (tp.y / 100));
                const overlayX = Math.round(targetPixelX - (gifSize / 2));
                const overlayY = Math.round(targetPixelY - (gifSize / 2));
                const streamLabel = `gif_${index}`;
                const isLast = index === sorted.length - 1;

                // speed + delay shift
                const throwDelay = tp.delay || 0;
                let setptsExpr = `${ptsFactor}*PTS`;
                if (throwDelay > 0.001) {
                    setptsExpr += `+${throwDelay.toFixed(3)}/TB`;
                }

                filterParts.push(
                    `[${inputIdx}:v]setpts=${setptsExpr},scale=${gifSize}:${gifSize}[${streamLabel}]`
                );

                const prevLabel = index === 0 ? '0:v' : `comp_${index - 1}`;
                const compLabel = `comp_${index}`;

                if (isLast) {
                    // last overlay: shortest=1 ends output when this
                    // gif finishes — mirrors the working single path
                    filterParts.push(
                        `[${prevLabel}][${streamLabel}]overlay=${overlayX}:${overlayY}:format=auto:shortest=1[${compLabel}]`
                    );
                } else {
                    // earlier overlays: eof_action=repeat freezes the
                    // splat on screen until the output ends
                    filterParts.push(
                        `[${prevLabel}][${streamLabel}]overlay=${overlayX}:${overlayY}:format=auto:eof_action=repeat[${compLabel}]`
                    );
                }
            });

            const finalComp = `comp_${sorted.length - 1}`;
            filterParts.push(`[${finalComp}]split[s0][s1]`);
            filterParts.push('[s0]palettegen[p]');
            filterParts.push('[s1][p]paletteuse');

            const filterStr = filterParts.join(';');
            console.log("filter_complex:", filterStr);

            await ffmpeg.exec([
                ...inputArgs,
                '-filter_complex', filterStr,
                '-y', 'output.gif'
            ]);

            for (let i = 0; i < sorted.length; i++) {
                try { await ffmpeg.deleteFile(`tomato_${i}.gif`); } catch (_) {}
            }
        }

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