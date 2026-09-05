/**
 * UI module for DailyDose CID, Episode Badges, Exact Ranking Search, Real Leaderboard Data, and Clean Theme Card Design.
 */

let allArticlesMap = {};
let masterEpNumberMap = {};
let currentModalEpNum = null;

// LocalStorage Keys
const STORAGE_COMPLETED = 'cid_completed_watched_eps'; // Only >= 90% completed
const STORAGE_TIMESTAMPS = 'cid_timestamps';
const STORAGE_EXACT_WATCH_SECONDS = 'cid_exact_watch_seconds';
const STORAGE_HANDLE = 'cid_user_handle';

let activeWatchTrackerTimer = null;
let currentActiveEpId = null;
window.userIsIndia = false;
let ytPlayer = null;

// Load YouTube IFrame API dynamically
const ytScript = document.createElement('script');
ytScript.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
if(firstScriptTag) {
    firstScriptTag.parentNode.insertBefore(ytScript, firstScriptTag);
} else {
    document.head.appendChild(ytScript);
}

// --- Background Geo-block Checker ---
let bgCheckerQueue = [];
let bgCheckerProcessing = false;
let checkObserver = null;
let bgCheckerTimeout = null;
const verifiedVideos = new Set();

window.onYouTubeIframeAPIReady = function() {
    if (bgCheckerQueue.length > 0) processBgCheckerQueue();
};

function processBgCheckerQueue() {
    if (bgCheckerProcessing || bgCheckerQueue.length === 0 || !window.YT || !window.YT.Player) return;
    
    bgCheckerProcessing = true;
    const article = bgCheckerQueue[0];
    
    const wrapperDiv = document.createElement('div');
    wrapperDiv.id = 'bg-checker-wrapper';
    wrapperDiv.style.position = 'fixed';
    wrapperDiv.style.bottom = '0';
    wrapperDiv.style.right = '0';
    wrapperDiv.style.width = '1px';
    wrapperDiv.style.height = '1px';
    wrapperDiv.style.overflow = 'hidden';
    wrapperDiv.style.zIndex = '-9999';
    wrapperDiv.style.pointerEvents = 'none';
    
    const tempDiv = document.createElement('div');
    tempDiv.id = 'bg-checker-temp';
    wrapperDiv.appendChild(tempDiv);
    document.body.appendChild(wrapperDiv);

    let tempPlayer = null;
    let handled = false;

    function cleanupAndNext(isUnavailable) {
        if (handled) return;
        handled = true;
        if (bgCheckerTimeout) clearTimeout(bgCheckerTimeout);
        try { if (tempPlayer) tempPlayer.destroy(); } catch(e) {}
        try { 
            const el = document.getElementById('bg-checker-wrapper');
            if (el) document.body.removeChild(el); 
        } catch(e) {}
        
        handleCheckerResult(article, isUnavailable);
    }

    try {
        tempPlayer = new window.YT.Player('bg-checker-temp', {
            height: '200',
            width: '200',
            videoId: article.videoId,
            playerVars: { 'playsinline': 1, 'controls': 0, 'disablekb': 1, 'rel': 0, 'mute': 1, 'autoplay': 1 },
            events: {
                'onReady': function() {
                    setTimeout(() => cleanupAndNext(false), 1500);
                },
                'onStateChange': function(event) {
                    if (event.data === window.YT.PlayerState.PLAYING || event.data === window.YT.PlayerState.BUFFERING) {
                        cleanupAndNext(false);
                    }
                },
                'onError': function(event) {
                    cleanupAndNext(true);
                }
            }
        });
        
        if (bgCheckerTimeout) clearTimeout(bgCheckerTimeout);
        bgCheckerTimeout = setTimeout(() => cleanupAndNext(false), 6000);
        
    } catch(e) {
        cleanupAndNext(false);
    }
}

function handleCheckerResult(article, isUnavailable) {
    if (isUnavailable) {
        saveVideoVerification(article.videoId, true);
    } else {
        verifiedVideos.add(article.videoId);
        saveVideoVerification(article.videoId, false);
    }
    
    bgCheckerQueue.shift();
    bgCheckerProcessing = false;
    
    if (bgCheckerQueue.length > 0) {
        setTimeout(processBgCheckerQueue, 100);
    }
}

function saveVideoVerification(videoId, isUnavailable) {
    try {
        const cache = JSON.parse(localStorage.getItem('cid_geo_verification_cache') || '{}');
        cache[videoId] = { isUnavailable: isUnavailable, timestamp: Date.now() };
        localStorage.setItem('cid_geo_verification_cache', JSON.stringify(cache));
    } catch(e) {}
}

function getCheckerCache() {
    try {
        return JSON.parse(localStorage.getItem('cid_geo_verification_cache') || '{}');
    } catch(e) {
        return {};
    }
}

export async function initializeIpCache() {
    try {
        const res = await fetch('https://api.ipify.org?format=json');
        const data = await res.json();
        const currentIp = data.ip;
        
        const lastIp = localStorage.getItem("cid_last_ip");
        if (lastIp !== currentIp) {
            localStorage.setItem("cid_last_ip", currentIp);
        }
    } catch(e) {
        console.warn("Could not check IP:", e);
    }
}

export function registerMasterArticles(articles) {
    articles.forEach(article => {
        allArticlesMap[article.id] = article;
        if (article.epNumber) {
            masterEpNumberMap[article.epNumber] = article;
        }
    });
}

export function getCompletedWatchedList() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_COMPLETED) || '[]');
    } catch(e) {
        return [];
    }
}

function saveCompletedEpisode(articleId) {
    const list = getCompletedWatchedList();
    if (!list.includes(articleId)) {
        list.push(articleId);
        localStorage.setItem(STORAGE_COMPLETED, JSON.stringify(list));
        
        const card = document.querySelector(`.card[data-id="${articleId}"]`);
        if (card) {
            card.classList.add('read-article', 'watched-article');
        }
        updateFanDashboard();
    }
}

function getTimestamps() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_TIMESTAMPS) || '{}');
    } catch(e) {
        return {};
    }
}

function getExactWatchSeconds() {
    return parseInt(localStorage.getItem(STORAGE_EXACT_WATCH_SECONDS) || '0', 10);
}

function initIntersectionObserver() {
    if (checkObserver) return;
    checkObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const card = entry.target;
                const articleId = card.getAttribute('data-id');
                const article = allArticlesMap[articleId];
                if (article && article.videoId && !verifiedVideos.has(article.videoId)) {
                    const cache = getCheckerCache();
                    if (!cache[article.videoId]) {
                        bgCheckerQueue.push(article);
                        processBgCheckerQueue();
                    }
                }
            }
        });
    }, { rootMargin: '200px' });
}

function createCardHTML(article) {
    allArticlesMap[article.id] = article;
    if (article.epNumber) {
        masterEpNumberMap[article.epNumber] = article;
    }
    const imageUrl = article.image;
    
    let readClass = '';
    const completed = getCompletedWatchedList();
    if (completed.includes(article.id)) {
        readClass = 'read-article watched-article';
    }
    
    let unavailableClass = '';
    const cache = getCheckerCache();
    if (cache[article.videoId] && cache[article.videoId].isUnavailable) {
        unavailableClass = 'ep-unavailable';
    }

    const timestamps = getTimestamps();
    const savedTimeSec = timestamps[article.id] || 0;
    const totalEpSecs = parseDurationTextToSec(article.durationText) || 2520; // Default 42 mins
    const progressPercent = savedTimeSec ? Math.min(100, Math.round((savedTimeSec / totalEpSecs) * 100)) : 0;
    
    return `
        <article class="card ${readClass} ${unavailableClass}" data-id="${article.id}" data-category="${(article.category || 'all').toLowerCase()}">
            <a href="javascript:void(0)" class="card-img-wrap" onclick="playEpisode('${article.id}')">
                <img src="${imageUrl}" alt="${article.title}" loading="lazy" class="card-img" onerror="this.src='https://via.placeholder.com/480x270/18181b/818cf8?text=CID+Episode'">
                <span class="card-duration-badge">${article.durationText || '42:00'}</span>
                ${progressPercent > 0 ? `<div class="card-progress-container"><div class="card-progress-bar" style="width: ${progressPercent}%;"></div></div>` : ''}
            </a>
            <div class="card-content">
                <div class="card-meta">
                    <span class="card-source" style="font-weight: 800; color: var(--text-primary); text-transform: uppercase; letter-spacing: 0.5px;">EP ${article.epNumber}</span>
                    <span>•</span>
                    <span class="card-date">${article.airDate || ''}</span>
                </div>
                <h2 class="card-title">
                    <a href="javascript:void(0)" onclick="playEpisode('${article.id}')">${article.title}</a>
                </h2>
                <div class="card-actions">
                    <button onclick="playEpisode('${article.id}')" class="chip active" style="width: 100%; justify-content: center; display: flex; align-items: center; gap: 6px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                        Watch Now
                    </button>
                </div>
            </div>
        </article>
    `;
}

function parseDurationTextToSec(text) {
    if (!text) return 0;
    const parts = text.split(':');
    if (parts.length === 3) return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
    if (parts.length === 2) return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    return 0;
}

export function renderArticles(articles, containerId, append = false) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!append) container.innerHTML = '';

    if (articles.length === 0 && !append) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 4rem 1rem; opacity: 0.6;">No CID episodes found matching your search.</div>';
        return;
    }

    initIntersectionObserver();

    const fragment = document.createDocumentFragment();
    const tempDiv = document.createElement('div');

    articles.forEach(article => {
        tempDiv.innerHTML = createCardHTML(article);
        const cardElem = tempDiv.firstElementChild;
        fragment.appendChild(cardElem);
        if (checkObserver) checkObserver.observe(cardElem);
    });

    container.appendChild(fragment);
}

// ----------------------------------------------------
// STRICT WATCHED ENGINE (>= 90% COMPLETION & EXACT SECONDS)
// ----------------------------------------------------
function startActiveWatchTracker(articleId) {
    stopActiveWatchTracker();
    currentActiveEpId = articleId;

    activeWatchTrackerTimer = setInterval(() => {
        const totalSecs = getExactWatchSeconds() + 1;
        localStorage.setItem(STORAGE_EXACT_WATCH_SECONDS, totalSecs.toString());

        const timestamps = getTimestamps();
        const currentEpSecs = (timestamps[articleId] || 0) + 1;
        timestamps[articleId] = currentEpSecs;
        localStorage.setItem(STORAGE_TIMESTAMPS, JSON.stringify(timestamps));

        const article = allArticlesMap[articleId];
        const totalEpSecs = article ? parseDurationTextToSec(article.durationText) || 2520 : 2520;
        if (currentEpSecs >= totalEpSecs * 0.90) {
            saveCompletedEpisode(articleId);
        }
    }, 1000);
}

function stopActiveWatchTracker() {
    if (activeWatchTrackerTimer) {
        clearInterval(activeWatchTrackerTimer);
        activeWatchTrackerTimer = null;
    }
}

export function openCleanPlayer(article) {
    currentModalEpNum = article.epNumber;

    let backdrop = document.getElementById('tmkoc-clean-backdrop');
    if (!backdrop) {
        const autoplayState = localStorage.getItem('autoplayNext') !== 'false' ? 'checked' : '';
        backdrop = document.createElement('div');
        backdrop.id = 'tmkoc-clean-backdrop';
        backdrop.className = 'tmkoc-modal-backdrop';
        backdrop.innerHTML = `
            <div class="tmkoc-modal-dialog">
                <div class="tmkoc-modal-header">
                    <div class="tmkoc-modal-title-wrap">
                        <span id="clean-badge" class="tmkoc-modal-badge">EP 1</span>
                        <h3 id="clean-title" class="tmkoc-modal-title">Episode Title</h3>
                    </div>
                    <button class="tmkoc-modal-close" onclick="closeCleanPlayer()">✕</button>
                </div>
                <div id="clean-modal-warning" class="tmkoc-geo-warning"></div>
                <div class="tmkoc-video-viewport">
                    <div id="clean-iframe-container"></div>
                </div>
                <div class="tmkoc-modal-footer" style="justify-content: space-between; align-items: center; display: flex;">
                    <button class="tmkoc-nav-btn" onclick="navCleanEp(-1)">◀ Previous Ep</button>
                    <div style="display: flex; align-items: center;">
                        <label style="color: var(--text-primary); font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; user-select: none;">
                            <input type="checkbox" id="autoplay-toggle" ${autoplayState} onchange="toggleAutoplay(this.checked)" style="accent-color: var(--text-primary); width: 16px; height: 16px; cursor: pointer;">
                            Autoplay Next
                        </label>
                    </div>
                    <button class="tmkoc-nav-btn" onclick="navCleanEp(1)">Next Ep ▶</button>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);
    }

    const modalWarning = document.getElementById('clean-modal-warning');
    if (modalWarning) {
        modalWarning.style.display = 'none';
    }

    document.getElementById('clean-title').textContent = article.title;
    document.getElementById('clean-badge').textContent = `EP ${article.epNumber}`;

    const timestamps = getTimestamps();
    const resumeSeconds = timestamps[article.id] || 0;

    const viewport = document.querySelector('.tmkoc-video-viewport');
    
    if (window.YT && window.YT.Player) {
        if (ytPlayer) {
            ytPlayer.destroy();
        }
        viewport.innerHTML = '<div id="clean-iframe-container"></div>';
        
        const videoIdToPlay = article.videoId || '';
        if (videoIdToPlay) {
            ytPlayer = new window.YT.Player('clean-iframe-container', {
                videoId: videoIdToPlay,
                playerVars: { 
                    'autoplay': 1, 
                    'rel': 0, 
                    'controls': 1,
                    'start': resumeSeconds,
                    'modestbranding': 1,
                    'iv_load_policy': 3,
                    'color': 'white',
                    'playsinline': 1
                },
                events: {
                    'onError': function(event) {
                        if (modalWarning) {
                            modalWarning.style.display = 'block';
                            modalWarning.innerHTML = `⚠️ <strong>Video Unavailable:</strong> YouTube refused to play this video. It may be geo-blocked, made private, or Sony disabled embedding. <a href="https://www.youtube.com/results?search_query=CID+Episode+${article.epNumber}" target="_blank" style="color: #d97706; text-decoration: underline;">Search for Ep ${article.epNumber} on YouTube</a>. (Code: ${event.data})`;
                        }
                        try {
                            verifiedVideos.add(article.id);
                            const card = document.querySelector(`.card[data-id="${article.id}"]`);
                            if (card && !card.classList.contains('ep-unavailable')) {
                                card.classList.add('ep-unavailable');
                            }
                        } catch(e) {}
                    },
                    'onStateChange': function(event) {
                        if (event.data === window.YT.PlayerState.PLAYING) {
                            currentActiveEpId = article.id;
                            try {
                                verifiedVideos.add(article.id);
                                const card = document.querySelector(`.card[data-id="${article.id}"]`);
                                if (card) card.classList.remove('ep-unavailable');
                            } catch(e) {}
                        } else if (event.data === window.YT.PlayerState.ENDED) {
                            if (localStorage.getItem('autoplayNext') !== 'false') {
                                window.navCleanEp(1);
                            }
                        }
                    }
                }
            });
        } else {
            viewport.innerHTML = `<iframe id="clean-iframe" src="https://www.youtube.com/embed?listType=search&list=CID+Episode+${article.epNumber}&modestbranding=1&rel=0&iv_load_policy=3&color=white&playsinline=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
        }
    } else {
        const startParam = resumeSeconds > 5 ? `&start=${resumeSeconds}` : '';
        if (article.videoId) {
            viewport.innerHTML = `<iframe id="clean-iframe" src="https://www.youtube.com/embed/${article.videoId}?autoplay=1&rel=0&controls=1&modestbranding=1&iv_load_policy=3&color=white&playsinline=1${startParam}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
        } else {
            viewport.innerHTML = `<iframe id="clean-iframe" src="https://www.youtube.com/embed?listType=search&list=CID+Episode+${article.epNumber}&modestbranding=1&rel=0&iv_load_policy=3&color=white&playsinline=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
        }
    }

    backdrop.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    startActiveWatchTracker(article.id);
}

window.playEpisode = function(articleId) {
    const article = allArticlesMap[articleId];
    if (article) {
        openCleanPlayer(article);
    }
};

window.openCleanPlayerById = function(articleId) {
    window.playEpisode(articleId);
};

window.closeCleanPlayer = function() {
    const backdrop = document.getElementById('tmkoc-clean-backdrop');
    if (backdrop) backdrop.style.display = 'none';
    if (ytPlayer) {
        try { ytPlayer.destroy(); } catch(e) {}
        ytPlayer = null;
    }
    const iframe = document.getElementById('clean-iframe');
    if (iframe) iframe.src = '';
    document.body.style.overflow = 'auto';
    stopActiveWatchTracker();
};

window.toggleAutoplay = function(checked) {
    localStorage.setItem('autoplayNext', checked);
};

window.navCleanEp = function(dir) {
    if (!currentModalEpNum) return;
    const targetEp = currentModalEpNum + dir;
    const targetArticle = masterEpNumberMap[targetEp];
    if (targetArticle) {
        openCleanPlayer(targetArticle);
    }
};

// ----------------------------------------------------
// REAL CID DASHBOARD & LEADERBOARD ENGINE
// ----------------------------------------------------
function getFanLevel(watchedCount) {
    if (watchedCount >= 1000) return { title: 'ACP Pradyuman Legend', color: 'var(--text-primary)' };
    if (watchedCount >= 301) return { title: 'Senior Inspector', color: 'var(--text-primary)' };
    if (watchedCount >= 51) return { title: 'Forensic Specialist', color: 'var(--text-primary)' };
    return { title: 'Junior Investigator', color: 'var(--text-primary)' };
}

export function updateFanDashboard() {
    const completedList = getCompletedWatchedList();
    const watchedCount = completedList.length;

    const totalWatchSecs = getExactWatchSeconds();
    const watchHours = Math.floor(totalWatchSecs / 3600);
    const watchMins = Math.floor((totalWatchSecs % 3600) / 60);

    const level = getFanLevel(watchedCount);

    const countEl = document.getElementById('stat-episodes-count');
    const hoursEl = document.getElementById('stat-watch-hours');
    const levelEl = document.getElementById('stat-fan-level');

    if (countEl) countEl.textContent = watchedCount;
    if (hoursEl) hoursEl.innerHTML = `${watchHours}<span style="font-size:16px; font-weight:700; margin-left:2px; margin-right:6px;">h</span>${watchMins}<span style="font-size:16px; font-weight:700; margin-left:2px;">m</span>`;
    if (levelEl) {
        levelEl.textContent = level.title;
        levelEl.style.color = level.color;
    }

    const savedHandle = localStorage.getItem(STORAGE_HANDLE) || '@CIDSuperfan';
    const handleInput = document.getElementById('user-handle-input');
    if (handleInput && !handleInput.value) {
        handleInput.value = savedHandle;
    }

    const cardUserBadge = document.getElementById('card-user-badge');
    const cardTierBadge = document.getElementById('card-tier-badge');
    const cardMainStat = document.getElementById('card-main-stat');
    const cardSubStat = document.getElementById('card-sub-stat');

    if (cardUserBadge) cardUserBadge.textContent = savedHandle;
    if (cardTierBadge) cardTierBadge.textContent = level.title;
    if (cardMainStat) cardMainStat.textContent = `${watchedCount} Cases Solved`;
    if (cardSubStat) cardSubStat.textContent = `${watchHours} Hours ${watchMins} Mins Investigation Time`;

    renderLeaderboardList(savedHandle, watchedCount, watchHours, level.title);
}

function renderLeaderboardList(userHandle, userCount, userHours, userLevel) {
    const leaderboardEl = document.getElementById('leaderboard-list');
    if (!leaderboardEl) return;

    const realEntries = [];
    if (userCount > 0 || userHours > 0 || userHandle) {
        realEntries.push({
            rank: '1',
            handle: userHandle || '@CIDSuperfan',
            count: userCount,
            hours: userHours,
            level: userLevel,
            isUser: true
        });
    }

    const nowStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    let html = `
        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0, 0, 0, 0.2); padding: 10px 14px; border-radius: 10px; font-size: 11px; color: var(--text-primary); opacity: 0.8; margin-bottom: 12px; border: 1px solid var(--border-color);">
            <span style="font-weight: 600;">Last Sync: Daily at 18:00 UTC (11:30 PM IST)</span>
            <span style="font-weight: 800;">${nowStr}</span>
        </div>
    `;

    if (realEntries.length === 0) {
        html += `
            <div style="padding: 30px 20px; text-align: center; background: var(--bg-primary); border-radius: 12px; border: 1px dashed var(--border-color); font-size: 13px; color: var(--text-primary); opacity: 0.7;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 12px; opacity: 0.5;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><br>
                No cases solved yet.<br>Start watching episodes to claim your spot on the Global CID Leaderboard!
            </div>
        `;
    } else {
        realEntries.forEach((item) => {
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-radius: 12px; border: 1px solid var(--border-color); background: var(--bg-primary); box-shadow: inset 0 2px 4px rgba(0,0,0,0.05); position: relative; overflow: hidden;">
                    <div style="position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: linear-gradient(to bottom, #f59e0b, #fbbf24);"></div>
                    <div style="display: flex; align-items: center; gap: 16px;">
                        <span style="font-weight: 900; font-size: 18px; min-width: 30px; background: linear-gradient(135deg, #f59e0b, #fbbf24); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">#1</span>
                        <div>
                            <div style="font-weight: 800; font-size: 14px; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                                ${item.handle} 
                                <span style="font-size: 9px; background: var(--text-primary); color: var(--bg-primary); padding: 2px 6px; border-radius: 4px; font-weight: 800; letter-spacing: 0.5px;">YOU</span>
                            </div>
                            <div style="font-size: 11px; font-weight: 600; opacity: 0.7; color: var(--text-primary); margin-top: 2px;">${item.level}</div>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: 900; font-size: 14px; color: var(--text-primary);">${item.count} Cases</div>
                        <div style="font-size: 11px; font-weight: 600; opacity: 0.7; color: var(--text-primary); margin-top: 2px;">${item.hours} hrs</div>
                    </div>
                </div>
            `;
        });
    }

    leaderboardEl.innerHTML = html;
}

window.toggleFullScreen = function() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.warn(`Error attempting to enable fullscreen: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
};

window.saveUserHandle = function() {
    const input = document.getElementById('user-handle-input');
    if (input && input.value.trim()) {
        localStorage.setItem(STORAGE_HANDLE, input.value.trim());
        updateFanDashboard();
    }
};

window.copyShareCardText = function() {
    const handle = localStorage.getItem(STORAGE_HANDLE) || '@CIDSuperfan';
    const completedList = getCompletedWatchedList();
    const count = completedList.length;
    const totalSecs = getExactWatchSeconds();
    const hours = Math.floor(totalSecs / 3600);
    const level = getFanLevel(count);

    const shareText = `I've watched ${count} CID cases (${hours} Hours) on Daily Dose of CID! My Rank: ${level.title} (${handle}). Check your level at CodeMasterAbhishek.github.io/Daily-Dose-of-CID/`;

    navigator.clipboard.writeText(shareText).then(() => {
        alert('Copied Social Share Card text to clipboard!');
    });
};

window.allStorylinesMap = {};

window.viewStorylineDetail = function(arcId) {
    const storyline = window.allStorylinesMap[arcId];
    if (!storyline) return;
    
    const event = new CustomEvent('selectStorylineArc', { detail: storyline });
    window.dispatchEvent(event);
};

export function renderStorylinesGrid(storylines, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    if (!storylines || storylines.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 4rem 1rem; opacity: 0.6;">No storylines found.</div>';
        return;
    }

    const fragment = document.createDocumentFragment();

    storylines.forEach(arc => {
        window.allStorylinesMap[arc.id] = arc;
        const coverEpObj = masterEpNumberMap[arc.coverEp] || masterEpNumberMap[arc.startEp];
        const coverImg = coverEpObj ? coverEpObj.image : `https://img.youtube.com/vi/placeholder/hqdefault.jpg`;

        const card = document.createElement('article');
        card.className = 'card storyline-card';
        card.style.cursor = 'pointer';
        card.onclick = () => window.viewStorylineDetail(arc.id);

        card.innerHTML = `
            <div class="card-img-wrap">
                <img src="${coverImg}" alt="${arc.title}" loading="lazy" class="card-img" onerror="this.src='https://via.placeholder.com/480x270/18181b/818cf8?text=CID+Storyline'">
                <span class="card-duration-badge" style="background: rgba(15,23,42,0.85); font-weight: 800;">${arc.totalEpisodes} EPISODES</span>
            </div>
            <div class="card-content">
                <div class="card-meta">
                    <span class="card-source" style="font-weight: 800; color: var(--text-primary); text-transform: uppercase;">EP ${arc.startEp} TO EP ${arc.endEp}</span>
                </div>
                <h2 class="card-title" style="margin-top: 4px;">
                    <a href="javascript:void(0)" onclick="window.viewStorylineDetail('${arc.id}')">${arc.title}</a>
                </h2>
                <p style="font-size: 12px; opacity: 0.75; margin-top: 6px; line-height: 1.4; color: var(--text-primary);">${arc.description}</p>
            </div>
        `;

        fragment.appendChild(card);
    });

    container.appendChild(fragment);
}
