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

// ====== CẤU HÌNH (dễ chỉnh khi cần tinh chỉnh độ nhạy) ======
const REQUIRED_MATCH_FRAMES = 5;      // Số khung hình khớp liên tiếp để chốt kết quả
const MAX_MISS_STREAK = 3;            // Số khung hình "mất dấu" liên tiếp mới reset (chống rung/nhiễu)
const MATCH_THRESHOLD = 0.5;          // Ngưỡng khoảng cách để coi là "khớp" (thấp hơn = khắt khe hơn)
const SCAN_DELAY_MS = 120;            // Khoảng nghỉ giữa 2 lần quét (sau khi lần trước xử lý xong)
const DETECTOR_INPUT_SIZE = 224;      // Kích thước đầu vào TinyFaceDetector (nhỏ hơn = nhanh hơn)
const ORACLE_TIMEOUT_MS = 12000;      // Timeout khi gọi API bói toán

// Model được host cục bộ trong thư mục /models (đã có sẵn trong repo) để:
// - Không phụ thuộc CDN ngoài (ổn định hơn khi mạng yếu/CDN sập)
// - Đảm bảo app.js và generate.html luôn dùng chung đúng 1 phiên bản model
const MODEL_URL = './models';

let userData = [];
let scanning = false;          // Cờ điều khiển vòng lặp quét (thay cho setInterval + isProcessingCard)
let matchCount = 0;
let missStreak = 0;
let lastDetectedLabel = '';

// 1. Tải hồ sơ người dùng
async function loadUserData() {
    const res = await fetch('./data.json');
    if (!res.ok) throw new Error('Không tải được data.json');
    userData = await res.json();
}

// 2. Mở camera tương thích cả Mobile (camera trước) & PC
function startVideo() {
    const constraints = {
        video: {
            facingMode: 'user', // Ưu tiên camera trước trên điện thoại
            width: { ideal: 480 },
            height: { ideal: 480 }
        }
    };

    return navigator.mediaDevices
        .getUserMedia(constraints)
        .then((stream) => {
            video.srcObject = stream;
            return new Promise((resolve) => {
                video.onloadedmetadata = () => {
                    video.play();
                    resolve();
                };
            });
        })
        .catch((err) => {
            console.error('Lỗi Camera:', err);
            const camError = new Error('CAMERA_ERROR');
            camError.originalName = (err && err.name) ? err.name : 'UnknownError';
            throw camError;
        });
}

// 2.1. Tắt luồng phần cứng camera ngay khi chụp xong
function stopVideo() {
    if (video && video.srcObject) {
        const stream = video.srcObject;
        const tracks = stream.getTracks();
        tracks.forEach((track) => track.stop());
        video.srcObject = null;
    }
}

// 2.2. Diễn giải lỗi camera cụ thể để hiển thị đúng nguyên nhân cho người dùng
function describeCameraError(errorName) {
    switch (errorName) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
            return 'Bạn đã từ chối quyền Camera. Hãy cấp quyền Camera cho trình duyệt rồi tải lại trang.';
        case 'NotFoundError':
        case 'DevicesNotFoundError':
            return 'Không tìm thấy Camera trên thiết bị này.';
        case 'NotReadableError':
        case 'TrackStartError':
            return 'Camera đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó rồi thử lại.';
        case 'OverconstrainedError':
            return 'Camera của thiết bị không hỗ trợ cấu hình được yêu cầu.';
        case 'SecurityError':
            return 'Trình duyệt chặn truy cập Camera (cần chạy qua HTTPS).';
        default:
            return 'Không thể truy cập Camera. Vui lòng kiểm tra lại thiết bị và thử lại.';
    }
}

// 3. Tải vector nhận diện từ file descriptors.json
async function loadDescriptorsFromJson() {
    const res = await fetch('./descriptors.json');
    if (!res.ok) throw new Error('Không tải được descriptors.json');
    const data = await res.json();
    return data.map((item) => faceapi.LabeledFaceDescriptors.fromJSON(item));
}

// 4. Chụp và crop avatar trực tiếp từ video
function captureAvatar(box) {
    if (!box || !video.videoWidth) return;
    const ctx = cropCanvas.getContext('2d');
    const pad = box.width * 0.25;
    const x = Math.max(0, box.x - pad);
    const y = Math.max(0, box.y - pad * 1.2);
    const size = Math.max(box.width + pad * 2, box.height + pad * 2);

    cropCanvas.width = 240;
    cropCanvas.height = 240;

    ctx.save();
    ctx.translate(cropCanvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, x, y, size, size, 0, 0, cropCanvas.width, cropCanvas.height);
    ctx.restore();
    cardAvatar.src = cropCanvas.toDataURL('image/jpeg', 0.9);
}

// 5. Vẽ khung nhận diện trực quan lên canvas overlay (phản hồi thời gian thực cho người dùng)
function drawScanOverlay(detection, displaySize, isKnown) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!detection) return;

    const resized = faceapi.resizeResults(detection, displaySize);
    const { x, y, width, height } = resized.detection.box;

    ctx.lineWidth = 3;
    ctx.strokeStyle = isKnown ? 'rgba(245, 158, 11, 0.95)' : 'rgba(148, 163, 184, 0.8)';
    ctx.shadowColor = isKnown ? 'rgba(245, 158, 11, 0.6)' : 'transparent';
    ctx.shadowBlur = isKnown ? 12 : 0;
    ctx.strokeRect(x, y, width, height);
}

// Nâng cấp: Truyền ngày sinh đầy đủ và mô tả tính cách vào prompt
async function getDailyOracle(fullName, birthDate, description) {
    const oracleEl = document.getElementById('card-oracle');
    oracleEl.innerText = "Đang gieo quẻ thiên cơ...";

    const prompt = `Bạn là pháp sư bói toán thần bí hài hước. Hãy phán đúng 1 câu cực ngắn (dưới 22 từ) về vận mệnh hôm nay cho người tên "${fullName}", sinh ngày ${birthDate} (hãy ngầm liên hệ một chút chiêm tinh/căn mệnh), tính cách: "${description}". Giọng điệu kiếm hiệp pha hài hước. Không tiêu đề, không giải thích, chỉ trả về đúng câu phán trong ngoặc kép.`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ORACLE_TIMEOUT_MS);

    try {
        const res = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error('Phản hồi API không hợp lệ: ' + res.status);

        const data = await res.json();
        const oracleText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        oracleEl.innerText = oracleText ? oracleText : '"Hôm nay linh khí bình ổn, làm việc gì cũng hanh thông."';
    } catch (err) {
        clearTimeout(timeoutId);
        console.error("Lỗi Gemini:", err);
        oracleEl.innerText = '"Hôm nay xuất hành gặp bạn hiền, nên tránh xa deadline."';
    }
}

// 6. Áp dụng phong cách và quầng sáng nền theo giới tính
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

        btnDownload.className = 'absolute top-[75.5%] left-[16%] right-[16%] h-[6.3%] flex items-center justify-center font-black text-[11px] sm:text-xs uppercase tracking-widest text-amber-200 hover:text-amber-100 transition active:scale-95 cursor-pointer drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] z-20';

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

        btnDownload.className = 'absolute top-[75.5%] left-[16%] right-[16%] h-[6.3%] flex items-center justify-center font-black text-[11px] sm:text-xs uppercase tracking-widest text-pink-200 hover:text-pink-100 transition active:scale-95 cursor-pointer drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] z-20';

        document.body.style.backgroundColor = '#0c0314';
        if (bgGlowTop) bgGlowTop.className = 'absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-purple-600/30 rounded-full blur-[140px] transition-all duration-1000';
        if (bgGlowBottom) bgGlowBottom.className = 'absolute -bottom-40 left-1/2 -translate-x-1/2 w-[650px] h-[650px] bg-pink-500/25 rounded-full blur-[150px] transition-all duration-1000';
    }
}

function showCard(person, faceBox) {
    if (!scanning) return; // Đã xử lý xong hoặc đã dừng trước đó, tránh chạy lặp lại
    scanning = false;

    captureAvatar(faceBox);
    stopVideo();

    const displayName = person.fullName || person.name || 'Vô Danh Pháp Sư';
    const birthDate = person.birthDate || 'Bí ẩn';
    const description = person.description || 'Hành tung bí ẩn, chưa rõ lai lịch.';

    document.getElementById('card-name').innerText = displayName;

    // Hiển thị ngày sinh đầy đủ lên thẻ
    document.getElementById('card-year').innerText = `Căn cơ: ${birthDate}`;
    document.getElementById('card-desc').innerText = `"${description}"`;

    applyGenderTheme(person.gender);

    // Gọi hàm bói toán với đủ thông tin
    getDailyOracle(displayName, birthDate, description);

    cameraContainer.classList.add('hidden');
    cardContainer.classList.remove('hidden');
    statusText.innerText = '✦ Nhận diện chân dung thành công! ✦';
}

// 7. Một vòng quét — tự lên lịch vòng tiếp theo sau khi xử lý xong (không chồng lệnh như setInterval)
async function scanLoop(faceMatcher, displaySize) {
    if (!scanning) return;

    try {
        const options = new faceapi.TinyFaceDetectorOptions({
            inputSize: DETECTOR_INPUT_SIZE,
            scoreThreshold: 0.5
        });

        const detection = await faceapi
            .detectSingleFace(video, options)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!scanning) return; // Có thể đã bị dừng trong lúc đang detect (đã ra thẻ)

        if (detection) {
            const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
            const isKnown = bestMatch.label !== 'unknown';
            drawScanOverlay(detection, displaySize, isKnown);

            if (isKnown) {
                missStreak = 0;
                if (bestMatch.label === lastDetectedLabel) {
                    matchCount++;
                } else {
                    lastDetectedLabel = bestMatch.label;
                    matchCount = 1;
                }

                statusText.innerText = `Đang kết nối: ${Math.min(100, Math.round((matchCount / REQUIRED_MATCH_FRAMES) * 100))}%`;

                if (matchCount >= REQUIRED_MATCH_FRAMES) {
                    const person = userData.find((u) => u.id === bestMatch.label);
                    if (person) {
                        showCard(person, detection.detection.box);
                        return; // Đã dừng quét, không lên lịch tiếp
                    }
                }
            } else {
                registerMiss();
            }
        } else {
            drawScanOverlay(null, displaySize, false);
            registerMiss();
        }
    } catch (err) {
        console.error('Lỗi khi xử lý khung hình:', err);
    }

    if (scanning) {
        setTimeout(() => scanLoop(faceMatcher, displaySize), SCAN_DELAY_MS);
    }
}

// 7.1. Không reset ngay khi mất dấu 1 khung hình — cho phép "khoan dung" vài frame nhiễu
function registerMiss() {
    missStreak++;
    if (missStreak >= MAX_MISS_STREAK) {
        matchCount = 0;
        lastDetectedLabel = '';
        statusText.innerText = 'Đang dò tìm linh hồn... Hãy nhìn thẳng camera';
    }
}

// 8. Bắt đầu phiên quét
async function startScanningSession() {
    landingContainer.classList.add('hidden');
    statusContainer.classList.remove('hidden');
    cameraContainer.classList.remove('hidden');
    statusText.innerText = 'Đang kích hoạt ma trận...';

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        statusText.innerText = 'Trình duyệt này không hỗ trợ truy cập Camera (hoặc trang chưa chạy qua HTTPS).';
        return;
    }

    try {
        statusText.innerText = 'Đang nạp AI nhận diện (1/2)...';

        const [_, __, labeledDescriptors] = await Promise.all([
            loadUserData(),
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            loadDescriptorsFromJson(),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);

        statusText.innerText = 'Đang nạp AI nhận diện (2/2)...';

        const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, MATCH_THRESHOLD);

        statusText.innerText = 'Đang mở Camera... Hãy bấm CHO PHÉP (Allow)';
        await startVideo();

        statusText.innerText = 'Đang dò tìm linh hồn... Hãy nhìn thẳng camera';

        const displaySize = { width: video.videoWidth || 290, height: video.videoHeight || 290 };
        faceapi.matchDimensions(canvas, displaySize);

        matchCount = 0;
        missStreak = 0;
        lastDetectedLabel = '';
        scanning = true;
        scanLoop(faceMatcher, displaySize);

    } catch (error) {
        console.error('Chi tiết lỗi:', error);
        scanning = false;
        if (error && error.message === 'CAMERA_ERROR') {
            statusText.innerText = describeCameraError(error.originalName);
        } else {
            statusText.innerText = 'Lỗi nạp dữ liệu nhận diện (kiểm tra lại mạng hoặc file data.json/descriptors.json)!';
        }
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
        scanning = false;
        stopVideo();
        location.reload();
    });
}