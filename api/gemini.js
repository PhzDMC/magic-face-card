// Giới hạn an toàn để tránh bị lạm dụng gọi tràn lan / prompt quá dài gây tốn phí
const MAX_PROMPT_LENGTH = 800;
const UPSTREAM_TIMEOUT_MS = 15000;

export default async function handler(req, res) {
    // Chỉ nhận phương thức POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 1. Chặn bớt các lời gọi rõ ràng đến từ domain khác (giảm nguy cơ bị "cày" quota từ nơi khác).
    //    Lưu ý: đây chỉ là lớp phòng vệ cơ bản (Origin/Referer có thể bị giả mạo bởi script phía server),
    //    không thay thế được rate-limit/captcha thực sự nếu app được public rộng rãi.
    const origin = req.headers.origin || req.headers.referer || '';
    const host = req.headers.host || '';
    if (origin && host && !origin.includes(host)) {
        return res.status(403).json({ error: 'Yêu cầu không hợp lệ (sai nguồn gốc).' });
    }

    // 2. Validate input
    const body = req.body || {};
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';

    if (!prompt) {
        return res.status(400).json({ error: 'Thiếu nội dung prompt.' });
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
        return res.status(400).json({ error: 'Nội dung prompt quá dài.' });
    }

    // Key sẽ được lấy tự động từ cài đặt bí mật trên Vercel
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'Chưa cấu hình GEMINI_API_KEY trên Vercel' });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                }),
                signal: controller.signal
            }
        );

        clearTimeout(timeoutId);

        const data = await response.json();

        if (!response.ok) {
            console.error('Gemini API trả lỗi:', response.status, data);
            return res.status(502).json({ error: 'Gemini API trả về lỗi.', status: response.status });
        }

        return res.status(200).json(data);
    } catch (error) {
        clearTimeout(timeoutId);
        const isAbort = error && error.name === 'AbortError';
        console.error('Lỗi gọi Gemini:', error);
        return res.status(isAbort ? 504 : 500).json({ error: isAbort ? 'Hết thời gian chờ phản hồi.' : error.message });
    }
}