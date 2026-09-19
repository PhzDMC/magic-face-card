// 6. Phối màu và gắn ảnh nền theo giới tính
function applyGenderTheme(gender) {
    const isMale = !gender || gender.toLowerCase() === 'nam';
    const genderBadge = document.getElementById('card-gender');
    const descTitle = document.getElementById('desc-title');
    const descIcon = document.getElementById('desc-icon');
    const oracleTitle = document.getElementById('oracle-title');
    const oracleText = document.getElementById('card-oracle');
    const btnDownload = document.getElementById('btn-download');

    if (isMale) {
        // Áp dụng background Nam
        cardFront.style.backgroundImage = "url('./assets/card_male_bg.png')";
        genderBadge.innerText = 'NAM';
        genderBadge.className = 'text-xs font-black tracking-[0.2em] text-amber-300 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]';

        descTitle.className = 'text-[10px] uppercase font-bold tracking-wider mb-0.5 flex items-center gap-1 text-amber-300';
        descIcon.innerText = '✦';

        oracleTitle.className = 'text-[10px] uppercase font-bold tracking-wider mb-0.5 flex items-center gap-1 text-amber-300';
        oracleText.className = 'text-[11px] leading-relaxed italic line-clamp-2 font-medium text-amber-100';

        btnDownload.className = 'absolute top-[78.5%] left-[11%] right-[11%] h-[38px] flex items-center justify-center font-black text-xs uppercase tracking-widest text-amber-200 hover:text-amber-100 transition active:scale-95 cursor-pointer drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]';
    } else {
        // Áp dụng background Nữ
        cardFront.style.backgroundImage = "url('./assets/card_female_bg.png')";
        genderBadge.innerText = 'NỮ';
        genderBadge.className = 'text-xs font-black tracking-[0.2em] text-pink-300 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]';

        descTitle.className = 'text-[10px] uppercase font-bold tracking-wider mb-0.5 flex items-center gap-1 text-pink-300';
        descIcon.innerText = '☽';

        oracleTitle.className = 'text-[10px] uppercase font-bold tracking-wider mb-0.5 flex items-center gap-1 text-pink-300';
        oracleText.className = 'text-[11px] leading-relaxed italic line-clamp-2 font-medium text-pink-100';

        btnDownload.className = 'absolute top-[78.5%] left-[11%] right-[11%] h-[38px] flex items-center justify-center font-black text-xs uppercase tracking-widest text-pink-200 hover:text-pink-100 transition active:scale-95 cursor-pointer drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]';
    }
}