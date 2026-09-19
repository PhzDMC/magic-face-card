const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const statusText = document.getElementById('status');
const landingContainer = document.getElementById('landing-container');
const statusContainer = document.getElementById('status-container');
const cameraContainer = document.getElementById('camera-container');
const cardContainer = document.getElementById('card-container');
const cardInner = document.getElementById('card-inner');
const cardFront = document.getElementById('card-front');
const cropCanvas = document.getElementById('crop-canvas');
const cardAvatar = document.getElementById('card-avatar');

let userData = [];
let scanInterval = null;
let matchCount = 0;
let lastDetectedLabel = '';
let isProcessingCard = false;
const REQUIRED_MATCH_FRAMES = 5;

// 1. Tải hồ sơ người dùng
async function loadUserData() {
    const res = await fetch('./data.json');
    userData = await res.json();
}

// 2. Mở camera
function startVideo() {
    return navigator.mediaDevices
        .getUserMedia({ video: { width: { ideal: 480 }, height: { ideal: 480 } } })
        .then((stream) => {
            video.srcObject = stream;
        })
        .catch((err) => {
            console.error('Lỗi camera:', err);
            statusText.innerText = 'Không thể mở Camera. Hãy cấp quyền truy cập!';
            throw err;
        });
}

// 3. Tải vector từ descriptors.json
async function loadDescriptorsFromJson() {
    const res = await fetch('./descriptors.json');
    const data = await res.json();
    return data.map((item) => faceapi.LabeledFaceDescriptors.fromJSON(item));
}

// 4. Chụp & Cắt avatar trực tiếp từ Video
function captureAvatar(box) {
    if (!box || !video.videoWidth) return;

    const ctx = cropCanvas.getContext('2d');

    // Mở rộng viền xung quanh khuôn mặt một chút để lấy trọn chân dung
    const pad = box.width * 0.25;
    const x = Math.max(0, box.x - pad);
    const y = Math.max(0, box.y - pad * 1.2);
    const size = Math.max(box.width + pad * 2, box.height + pad * 2);

    cropCanvas.width = 240;
    cropCanvas.height = 240;

    // Lật ngược trục X vì video gốc bị mirror (scaleX(-1))
    ctx.translate(cropCanvas.width, 0);
    ctx.scale(-1, 1);

    ctx.drawImage(
        video,
        x, y, size, size,
        0, 0, cropCanvas.width, cropCanvas.height
    );

    cardAvatar.src = cropCanvas.toDataURL('image/jpeg', 0.9);
}

// 5. Gieo quẻ từ Gemini API qua Vercel
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
        console.error("Lỗi:", err);
        oracleEl.innerText = '"Hôm nay xuất hành gặp bạn hiền, nên tránh xa deadline."';
    }
}

// 6. Phối style thẻ bài theo giới tính (Nam / Nữ)
function applyGenderTheme(gender) {
    const isMale = !gender || gender.toLowerCase() === 'nam';
    const avatarWrapper = document.getElementById('avatar-wrapper');
    const genderBadge = document.getElementById('card-gender');
    const descTitle = document.getElementById('desc-title');
    const descIcon = document.getElementById('desc-icon');
    const oracleBox = document.getElementById('oracle-box');
    const oracleTitle = document.getElementById('oracle-title');
    const oracleText = document.getElementById('card-oracle');
    const btnDownload = document.getElementById('btn-download');

    const baseCard = 'absolute inset-0 backface-hidden rotate-y-180 rounded-2xl p-5 border-2 shadow-2xl flex flex-col justify-between';

    if (isMale) {
        // Chủ đề Nam: Cosmic Blue & Gold
        cardFront.className = `${baseCard} border-amber-500/80 bg-gradient-to-b from-[#0a1128] via-[#050b1a] to-[#02050f] shadow-[0_0_35px_rgba(245,158,11,0.25)]`;
        avatarWrapper.className = 'relative w-24 h-24 rounded-xl overflow-hidden border-2 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)] flex-shrink-0 bg-slate-900';
        genderBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/40';
        descTitle.className = 'text-[11px] uppercase font-bold tracking-wider mb-1 flex items-center gap-1.5 text-amber-400';
        descIcon.innerText = '✦';
        oracleBox.className = 'rounded-xl p-3 border border-amber-500/30 mt-3 bg-amber-950/25';
        oracleTitle.className = 'text-[11px] uppercase font-bold tracking-wider mb-1 flex items-center gap-1.5 text-amber-400';
        oracleText.className = 'text-xs leading-relaxed italic font-medium text-amber-100';
        btnDownload.className = 'w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg transition bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-600 hover:to-yellow-700 text-slate-950 shadow-amber-500/25';
    } else {
        // Chủ đề Nữ: Mystic Purple & Quartz Pink
        cardFront.className = `${baseCard} border-pink-500/80 bg-gradient-to-b from-[#21092f] via-[#12051d] to-[#08020d] shadow-[0_0_35px_rgba(236,72,153,0.25)]`;
        avatarWrapper.className = 'relative w-24 h-24 rounded-xl overflow-hidden border-2 border-pink-400 shadow-[0_0_15px_rgba(236,72,153,0.3)] flex-shrink-0 bg-slate-900';
        genderBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-pink-500/20 text-pink-400 border border-pink-500/40';
        descTitle.className = 'text-[11px] uppercase font-bold tracking-wider mb-1 flex items-center gap-1.5 text-pink-400';
        descIcon.innerText = '☽';
        oracleBox.className = 'rounded-xl p-3 border border-pink-500/30 mt-3 bg-pink-950/25';
        oracleTitle.className = 'text-[11px] uppercase font-bold tracking-wider mb-1 flex items-center gap-1.5 text-pink-400';
        oracleText.className = 'text-xs leading-relaxed italic font-medium text-pink-100';
        btnDownload.className = 'w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg transition bg-gradient-to-r from-pink-500 via-purple-500 to-pink-600 hover:from-pink-600 hover:to-purple-700 text-white shadow-pink-500/25';
    }
}

// 7. Hiển thị thẻ bài
function showCard(person, faceBox) {
    if (isProcessingCard) return;
    isProcessingCard = true;
    clearInterval(scanInterval);

    // Chụp avatar ngay thời điểm nhận diện
    captureAvatar(faceBox);

    const displayName = person.fullName || person.name || 'Vô Danh Pháp Sư';
    document.getElementById('card-name').innerText = displayName;
    document.getElementById('card-gender').innerText = person.gender || 'Bí ẩn';
    document.getElementById('card-year').innerText = `Căn cơ: ${person.birthYear || 'Vô hạn'}`;
    document.getElementById('card-desc').innerText = `"${person.description || 'Hành tung bí ẩn, chưa rõ lai lịch.'}"`;

    applyGenderTheme(person.gender);
    getDailyOracle(displayName, person.birthYear);

    // Ẩn camera, hiện và lật thẻ
    cameraContainer.classList.add('hidden');
    cardContainer.classList.remove('hidden');
    statusText.innerText = '✦ Nhận diện chân dung thành công! ✦';

    setTimeout(() => {
        cardInner.classList.add('rotate-y-180');
    }, 200);
}

// 8. Bắt đầu phiên quét khuôn mặt
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
            const displaySize = { width: video.videoWidth || 310, height: video.videoHeight || 310 };
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

// 9. Sự kiện bấm nút bắt đầu
document.getElementById('btn-start').addEventListener('click', () => {
    startScanningSession();
});

// 10. Xuất ảnh thẻ với html2canvas
document.getElementById('btn-download').addEventListener('click', async () => {
    const btnDownload = document.getElementById('btn-download');
    const btnRescan = document.getElementById('btn-rescan');

    btnDownload.style.visibility = 'hidden';
    btnRescan.style.visibility = 'hidden';

    try {
        const capturedCanvas = await html2canvas(cardFront, {
            backgroundColor: null,
            scale: 2,
            useCORS: true,
            onclone: (clonedDoc) => {
                const clonedFront = clonedDoc.getElementById('card-front');
                if (clonedFront) clonedFront.style.transform = 'none';
            }
        });

        const link = document.createElement('a');
        const cardName = document.getElementById('card-name').innerText.replace(/\s+/g, '_');
        link.download = `The_Ma_Thuat_${cardName}.png`;
        link.href = capturedCanvas.toDataURL('image/png');
        link.click();
    } catch (err) {
        console.error('Lỗi khi xuất ảnh:', err);
        alert('Không thể tạo file ảnh thẻ bài!');
    } finally {
        btnDownload.style.visibility = 'visible';
        btnRescan.style.visibility = 'visible';
    }
});

// 11. Quét lại
document.getElementById('btn-rescan').addEventListener('click', () => {
    location.reload();
});
