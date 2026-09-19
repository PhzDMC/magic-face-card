const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const statusText = document.getElementById('status');
const cameraContainer = document.getElementById('camera-container');
const cardContainer = document.getElementById('card-container');
const card = document.getElementById('card');

let userData = [];
let scanInterval = null;

// 1. Tải hồ sơ người dùng từ data.json
async function loadUserData() {
    const res = await fetch('./data.json');
    userData = await res.json();
}

// 2. Mở Camera máy tính / điện thoại
function startVideo() {
    navigator.mediaDevices
        .getUserMedia({ video: {} })
        .then((stream) => {
            video.srcObject = stream;
        })
        .catch((err) => {
            console.error('Lỗi khi mở camera:', err);
            statusText.innerText = 'Không thể mở Camera. Vui lòng cấp quyền!';
        });
}

// 3. Tải các vector đặc trưng khuôn mặt từ file descriptors.json
async function loadDescriptorsFromJson() {
    const res = await fetch('./descriptors.json');
    const data = await res.json();
    return data.map((item) => faceapi.LabeledFaceDescriptors.fromJSON(item));
}

// 4. Hiển thị thẻ bài ma thuật khi nhận diện chính xác
function showCard(person) {
    // Dừng quét tiếp để giữ ổn định
    clearInterval(scanInterval);

    // Ẩn camera, hiện thẻ bài
    cameraContainer.classList.add('hidden');
    cardContainer.classList.remove('hidden');
    cardContainer.classList.add('flex');
    statusText.innerText = 'Nhận diện thành công!';

    // Đổ dữ liệu vào thẻ
    document.getElementById('card-name').innerText = person.fullName;
    document.getElementById('card-gender').innerText = person.gender;
    document.getElementById('card-year').innerText = `Căn cơ: ${person.birthYear}`;
    document.getElementById('card-desc').innerText = `"${person.description}"`;

    // Đổi màu giao diện theo Giới tính
    if (person.gender && person.gender.toLowerCase() === 'nam') {
        card.className =
            'w-80 rounded-2xl p-6 border-2 border-amber-500 bg-gradient-to-b from-slate-900 via-slate-900 to-amber-950 shadow-amber-500/20 shadow-2xl';
        document.getElementById('card-gender').className =
            'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/40';
    } else {
        card.className =
            'w-80 rounded-2xl p-6 border-2 border-pink-500 bg-gradient-to-b from-slate-900 via-slate-900 to-pink-950 shadow-pink-500/20 shadow-2xl';
        document.getElementById('card-gender').className =
            'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-pink-500/20 text-pink-400 border border-pink-500/40';
    }
}

// 5. Khởi tạo toàn bộ hệ thống
async function init() {
    statusText.innerText = 'Đang nạp ma trận nhận diện...';

    // Dùng link CDN GitHub Raw chứa sẵn weights model chính thức của face-api.js
    const MODEL_URL =
        'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';

    try {
        const [_, labeledDescriptors] = await Promise.all([
            loadUserData(),
            loadDescriptorsFromJson(),
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);

        const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.48);

        statusText.innerText = 'Đang quét luồng khí... Hãy nhìn thẳng camera';
        startVideo();

        video.addEventListener('play', () => {
            const displaySize = { width: video.width, height: video.height };
            faceapi.matchDimensions(canvas, displaySize);

            scanInterval = setInterval(async () => {
                const detection = await faceapi
                    .detectSingleFace(video)
                    .withFaceLandmarks()
                    .withFaceDescriptor();

                if (detection) {
                    const bestMatch = faceMatcher.findBestMatch(detection.descriptor);

                    if (bestMatch.label !== 'unknown') {
                        const person = userData.find((u) => u.id === bestMatch.label);
                        if (person) {
                            showCard(person);
                        }
                    }
                }
            }, 200);
        });
    } catch (error) {
        console.error('Lỗi khởi động:', error);
        statusText.innerText = 'Lỗi nạp dữ liệu! Hãy kiểm tra Console (F12).';
    }
}

// 6. Xử lý tải thẻ bài thành ảnh PNG
document.getElementById('btn-download').addEventListener('click', () => {
    const cardElement = document.getElementById('card');
    const btnDownload = document.getElementById('btn-download');
    const btnRescan = document.getElementById('btn-rescan');

    btnDownload.style.display = 'none';
    btnRescan.style.display = 'none';

    html2canvas(cardElement, {
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

// 7. Nút quét lại
document.getElementById('btn-rescan').addEventListener('click', () => {
    location.reload();
});

init();