const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const statusText = document.getElementById('status');
const cameraContainer = document.getElementById('camera-container');
const cardContainer = document.getElementById('card-container');
const cardInner = document.getElementById('card-inner');
const cardFront = document.getElementById('card-front');

// API Key vừa tạo từ Google AI Studio
const GEMINI_API_KEY = "AQ.Ab8RN6Ivh8XiyGILgh92c4uDq2ojnidNzMILgvFG78Km3oZigA";

let userData = [];
let scanInterval = null;
let matchCount = 0;
let lastDetectedLabel = '';
const REQUIRED_MATCH_FRAMES = 5;

// 1. Tải hồ sơ người dùng
async function loadUserData() {
    const res = await fetch('./data.json');
    userData = await res.json();
}

// 2. Mở camera
function startVideo() {
    navigator.mediaDevices
        .getUserMedia({ video: { width: { ideal: 480 }, height: { ideal: 480 } } })
        .then((stream) => {
            video.srcObject = stream;
        })
        .catch((err) => {
            console.error('Lỗi camera:', err);
            statusText.innerText = 'Không thể mở Camera. Hãy cấp quyền!';
        });
}

// 3. Tải vector từ descriptors.json
async function loadDescriptorsFromJson() {
    const res = await fetch('./descriptors.json');
    const data = await res.json();
    return data.map((item) => faceapi.LabeledFaceDescriptors.fromJSON(item));
}

// 4. Gọi Gemini API gieo quẻ vận mệnh
async function getDailyOracle(fullName, birthYear) {
    const oracleEl = document.getElementById('card-oracle');
    oracleEl.innerText = "Đang gieo quẻ thiên cơ...";

    const prompt = `Bạn là một pháp sư bói toán thần bí. Hãy phán đúng 1 câu cực ngắn (dưới 20 từ) về vận mệnh ngày hôm nay cho người tên "${fullName}", sinh năm ${birthYear}. Giọng điệu hài hước, phong cách kiếm hiệp ma thuật. Không tiêu đề, chỉ trả về đúng câu phán.`;

    try {
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            }
        );

        const data = await res.json();
        const oracleText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        oracleEl.innerText = oracleText ? `"${oracleText}"` : '"Hôm nay linh khí bình ổn, làm việc gì cũng hanh thông."';
    } catch (err) {
        console.error("Lỗi Gemini:", err);
        oracleEl.innerText = '"Hôm nay xuất hành gặp bạn hiền, nên tránh xa deadline."';
    }
}

// 5. Hiển thị thẻ bài với hiệu ứng lật 3D
function showCard(person) {
    clearInterval(scanInterval);

    // Điền dữ liệu tĩnh
    document.getElementById('card-name').innerText = person.fullName;
    document.getElementById('card-gender').innerText = person.gender;
    document.getElementById('card-year').innerText = `Căn cơ: ${person.birthYear}`;
    document.getElementById('card-desc').innerText = `"${person.description}"`;

    // Gọi Gemini gieo quẻ động
    getDailyOracle(person.fullName, person.birthYear);

    // Thiết lập class giao diện theo giới tính
    const baseClasses = 'absolute inset-0 backface-hidden rotate-y-180 rounded-2xl p-6 border-2 shadow-2xl flex flex-col justify-between';
    if (person.gender && person.gender.toLowerCase() === 'nam') {
        cardFront.className = `${baseClasses} border-amber-500 bg-gradient-to-b from-slate-900 via-slate-900 to-amber-950 shadow-[0_0_35px_rgba(245,158,11,0.25)]`;
        document.getElementById('card-gender').className = 'px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/40';
    } else {
        cardFront.className = `${baseClasses} border-pink-500 bg-gradient-to-b from-slate-900 via-slate-900 to-pink-950 shadow-[0_0_35px_rgba(236,72,153,0.25)]`;
        document.getElementById('card-gender').className = 'px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-pink-500/20 text-pink-400 border border-pink-500/40';
    }

    // Chuyển cảnh sang thẻ
    cameraContainer.classList.add('hidden');
    cardContainer.classList.remove('hidden');
    statusText.innerText = '✦ Nhận diện chân dung thành công! ✦';

    // Lật từ mặt úp sang mặt ngửa
    setTimeout(() => {
        cardInner.classList.add('rotate-y-180');
    }, 200);
}

// 6. Khởi động toàn bộ
async function init() {
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
        startVideo();

        video.addEventListener('play', () => {
            const displaySize = { width: video.videoWidth || 310, height: video.videoHeight || 310 };
            faceapi.matchDimensions(canvas, displaySize);

            scanInterval = setInterval(async () => {
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
                            if (person) showCard(person);
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
        console.error('Lỗi nạp hệ thống:', error);
        statusText.innerText = 'Lỗi nạp tài nguyên ma thuật!';
    }
}

// 7. Xuất ảnh thẻ
document.getElementById('btn-download').addEventListener('click', () => {
    const btnDownload = document.getElementById('btn-download');
    const btnRescan = document.getElementById('btn-rescan');

    btnDownload.style.display = 'none';
    btnRescan.style.display = 'none';

    html2canvas(cardFront, {
        backgroundColor: null,
        scale: 2,
    })
        .then((capturedCanvas) => {
            btnDownload.style.display = 'block';
            btnRescan.style.display = 'block';

            const link = document.createElement('a');
            link.download = `The_Ma_Thuat_${document.getElementById('card-name').innerText}.png`;
            link.href = capturedCanvas.toDataURL('image/png');
            link.click();
        })
        .catch((err) => {
            console.error('Lỗi khi xuất ảnh:', err);
            btnDownload.style.display = 'block';
            btnRescan.style.display = 'block';
        });
});

// 8. Quét lại
document.getElementById('btn-rescan').addEventListener('click', () => {
    location.reload();
});

init();