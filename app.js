const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const statusText = document.getElementById('status');
const landingContainer = document.getElementById('landing-container');
const statusContainer = document.getElementById('status-container');
const cameraContainer = document.getElementById('camera-container');
const cardContainer = document.getElementById('card-container');
const cardFront = document.getElementById('card-front');
const cropCanvas = document.getElementById('crop-canvas');
const cardAvatar = document.getElementById('card-avatar');
const btnStart = document.getElementById('btn-start');
const bgGlowTop = document.getElementById('bg-glow-top');
const bgGlowBottom = document.getElementById('bg-glow-bottom');

let userData = [];
let scanInterval = null;
let matchCount = 0;
let lastDetectedLabel = '';
let isProcessingCard = false;
const REQUIRED_MATCH_FRAMES = 5;

// 1. Nạp hồ sơ từ data.json
async function loadUserData() {
    const res = await fetch('./data.json');
    userData = await res.json();
}

// 2. Mở Camera
function startVideo() {
    return navigator.mediaDevices
        .getUserMedia({ video: { width: { ideal: 480 }, height: { ideal: 480 } } })
        .then((stream) => {
            video.srcObject = stream;
        })
        .catch((err) => {
            console.error('Lỗi camera:', err);
            statusText.innerText = 'Không thể mở Camera. Hãy cấp quyền!';
            throw err;
        });
}

// 3. Nạp vector nhận diện từ descriptors.json
async function loadDescriptorsFromJson() {
    const res = await fetch('./descriptors.json');
    const data = await res.json();
    return data.map((item) => faceapi.LabeledFaceDescriptors.fromJSON(item));
}

// 4. Cắt chân dung trực tiếp từ luồng Video
function captureAvatar(box) {
    if (!box || !video.videoWidth) return;
    const ctx = cropCanvas.getContext('2d');
    const pad = box.width * 0.25;
    const x = Math.max(0, box.x - pad);
    const y = Math.max(0, box.y - pad * 1.2);
    const size = Math.max(box.width + pad * 2, box.height + pad * 2);

    cropCanvas.width = 240;
    cropCanvas.height = 240;

    ctx.translate(cropCanvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, x, y, size, size, 0, 0, cropCanvas.width, cropCanvas.height);
    cardAvatar.src = cropCanvas.toDataURL('image/jpeg', 0.9);
}

// 5. Gieo quẻ qua Gemini API
async function getDailyOracle(fullName, birthYear) {
    const oracleEl = document.getElementById('card-oracle');
    oracleEl.innerText = "Đang gieo quẻ thiên cơ...";

    const prompt = `Bạn là một pháp sư bói toán thần bí. Hãy phán đúng 1 câu cực ngắn (dưới 20 từ) về vận mệnh ngày hôm nay cho người tên "${fullName}", sinh năm ${birthYear}. Giọng điệu hài hước, phong cách kiếm hiệp ma thuật. Không tiêu đề, chỉ trả về đúng câu phán.`;

    try {
        const res = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt })
        });
        const data = await res.json();
        const oracleText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        oracleEl.innerText = oracleText ? `"${oracleText}"` : '"Hôm nay linh khí bình ổn, làm việc gì cũng hanh thông."';
    } catch (err) {
        console.error("Lỗi Gemini:", err);
        oracleEl.innerText = '"Hôm nay xuất hành gặp bạn hiền, nên tránh xa deadline."';
    }
}

// 6. Áp dụng phong cách và ảnh nền theo Nam / Nữ
function applyGenderTheme(gender) {
    const isMale = !gender || gender.toLowerCase() === 'nam';
    const genderBadge = document.getElementById('card-gender');
    const descTitle = document.getElementById('desc-title');
    const oracleTitle = document.getElementById('oracle-title');
    const oracleText = document.getElementById('card-oracle');
    const btnDownload = document.getElementById('btn-download');

    if (isMale) {
        cardFront.style.backgroundImage = "url('./assets/card_male_bg.png')";
        genderBadge.innerText = 'NAM';
        genderBadge.className = 'text-[11px] font-black tracking-[0.25em] text-amber-300 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]';

        descTitle.className = 'text-[10px] uppercase font-bold tracking-wider mb-0.5 text-amber-300';
        oracleTitle.className = 'text-[10px] uppercase font-bold tracking-wider mb-0.5 text-amber-300';
        oracleText.className = 'text-[10.5px] leading-relaxed italic line-clamp-3 font-medium text-amber-100 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]';

        btnDownload.className = 'absolute top-[72.8%] left-[15%] right-[15%] h-[38px] flex items-center justify-center font-black text-[11px] sm:text-xs uppercase tracking-widest text-amber-200 hover:text-amber-100 transition active:scale-95 cursor-pointer drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] z-20';

        // Ambient Glow: Cosmic Blue & Gold
        document.body.style.backgroundColor = '#030714';
        if (bgGlowTop) bgGlowTop.className = 'absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-blue-600/25 rounded-full blur-[140px] transition-all duration-1000';
        if (bgGlowBottom) bgGlowBottom.className = 'absolute -bottom-40 left-1/2 -translate-x-1/2 w-[650px] h-[650px] bg-amber-500/20 rounded-full blur-[150px] transition-all duration-1000';
    } else {
        cardFront.style.backgroundImage = "url('./assets/card_female_bg.png')";
        genderBadge.innerText = 'NỮ';
        genderBadge.className = 'text-[11px] font-black tracking-[0.25em] text-pink-300 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]';

        descTitle.className = 'text-[10px] uppercase font-bold tracking-wider mb-0.5 text-pink-300';
        oracleTitle.className = 'text-[10px] uppercase font-bold tracking-wider mb-0.5 text-pink-300';
        oracleText.className = 'text-[10.5px] leading-relaxed italic line-clamp-3 font-medium text-pink-100 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]';

        btnDownload.className = 'absolute top-[72.8%] left-[15%] right-[15%] h-[38px] flex items-center justify-center font-black text-[11px] sm:text-xs uppercase tracking-widest text-pink-200 hover:text-pink-100 transition active:scale-95 cursor-pointer drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] z-20';

        // Ambient Glow: Mystic Purple & Rose
        document.body.style.backgroundColor = '#0c0314';
        if (bgGlowTop) bgGlowTop.className = 'absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-purple-600/30 rounded-full blur-[140px] transition-all duration-1000';
        if (bgGlowBottom) bgGlowBottom.className = 'absolute -bottom-40 left-1/2 -translate-x-1/2 w-[650px] h-[650px] bg-pink-500/25 rounded-full blur-[150px] transition-all duration-1000';
    }
}

// 7. Hiển thị thẻ kết quả
function showCard(person, faceBox) {
    if (isProcessingCard) return;
    isProcessingCard = true;
    clearInterval(scanInterval);

    captureAvatar(faceBox);

    const displayName = person.fullName || person.name || 'Vô Danh Pháp Sư';
    document.getElementById('card-name').innerText = displayName;
    document.getElementById('card-year').innerText = `Căn cơ: ${person.birthYear || 'Vô hạn'}`;
    document.getElementById('card-desc').innerText = `"${person.description || 'Hành tung bí ẩn, chưa rõ lai lịch.'}"`;

    applyGenderTheme(person.gender);
    getDailyOracle(displayName, person.birthYear);

    cameraContainer.classList.add('hidden');
    cardContainer.classList.remove('hidden');
    statusText.innerText = '✦ Nhận diện chân dung thành công! ✦';
}

// 8. Kích hoạt quét camera
async function startScanningSession() {
    landingContainer.classList.add('hidden');
    statusContainer.classList.remove('hidden');
    cameraContainer.classList.remove('hidden');
    statusText.innerText = 'Đang kích hoạt ma trận...';

    const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';

    try {
        const [_, labeledDescriptors] = await Promise.all([
            loadUserData(),
            loadDescriptorsFromJson(),
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);

        const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.48);
        statusText.innerText = 'Đang dò tìm linh hồn... Hãy nhìn thẳng camera';
        await startVideo();

        video.addEventListener('play', () => {
            const displaySize = { width: video.videoWidth || 290, height: video.videoHeight || 290 };
            faceapi.matchDimensions(canvas, displaySize);

            scanInterval = setInterval(async () => {
                if (isProcessingCard) return;

                const detection = await faceapi
                    .detectSingleFace(video)
                    .withFaceLandmarks()
                    .withFaceDescriptor();

                if (detection) {
                    const bestMatch = faceMatcher.findBestMatch(detection.descriptor);

                    if (bestMatch.label !== 'unknown') {
                        if (bestMatch.label === lastDetectedLabel) {
                            matchCount++;
                            statusText.innerText = `Đang kết nối: ${Math.min(100, Math.round((matchCount / REQUIRED_MATCH_FRAMES) * 100))}%`;
                        } else {
                            lastDetectedLabel = bestMatch.label;
                            matchCount = 1;
                        }

                        if (matchCount >= REQUIRED_MATCH_FRAMES) {
                            const person = userData.find((u) => u.id === bestMatch.label);
                            if (person) showCard(person, detection.detection.box);
                        }
                    } else {
                        matchCount = 0;
                        lastDetectedLabel = '';
                        statusText.innerText = 'Đang dò tìm linh hồn... Hãy nhìn thẳng camera';
                    }
                }
            }, 160);
        });
    } catch (error) {
        console.error('Lỗi khởi động:', error);
        statusText.innerText = 'Lỗi nạp tài nguyên ma thuật!';
    }
}

if (btnStart) {
    btnStart.addEventListener('click', startScanningSession);
}

// 9. Tải thẻ về máy
const btnDownload = document.getElementById('btn-download');
if (btnDownload) {
    btnDownload.addEventListener('click', async () => {
        const btnRescan = document.getElementById('btn-rescan');
        btnDownload.style.visibility = 'hidden';
        btnRescan.style.visibility = 'hidden';

        try {
            const capturedCanvas = await html2canvas(cardFront, {
                backgroundColor: null,
                scale: 2,
                useCORS: true
            });

            const link = document.createElement('a');
            const cardName = document.getElementById('card-name').innerText.replace(/\s+/g, '_');
            link.download = `The_Ma_Thuat_${cardName}.png`;
            link.href = capturedCanvas.toDataURL('image/png');
            link.click();
        } catch (err) {
            console.error('Lỗi xuất ảnh:', err);
            alert('Không thể tạo file ảnh thẻ bài!');
        } finally {
            btnDownload.style.visibility = 'visible';
            btnRescan.style.visibility = 'visible';
        }
    });
}

// 10. Nút quét lại
const btnRescan = document.getElementById('btn-rescan');
if (btnRescan) {
    btnRescan.addEventListener('click', () => {
        location.reload();
    });
}