/**
 * UI module for DailyDose CID, Episode Badges, Exact Ranking Search, Real Leaderboard Data, and Clean Theme Card Design.
 */

let allArticlesMap = {};
let masterEpNumberMap = {};
let currentModalEpNum = null;

// LocalStorage Keys
const STORAGE_COMPLETED = 'cid_completed_watched_eps';
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
        
        bgCheckerTimeout = setTimeout(() => {
            cleanupAndNext(true);
        }, 4000);

    } catch (e) {
        cleanupAndNext(false);
    }
}

function handleCheckerResult(article, isUnavailable) {
    if (isUnavailable) {
        markArticleGeoBlocked(article);
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

function markArticleGeoBlocked(article) {
    saveVideoVerification(article.videoId, true);
    
    const cards = document.querySelectorAll(`[data-article-id="${article.id}"]`);
    cards.forEach(card => {
        let badge = card.querySelector('.geo-blocked-badge');
        if (!badge) {
            const imgWrap = card.querySelector('.card-img-wrap');
            if (imgWrap) {
                badge = document.createElement('span');
                badge.className = 'geo-blocked-badge';
                badge.style.position = 'absolute';
                badge.style.top = '8px';
                badge.style.left = '8px';
                badge.style.background = 'rgba(220, 38, 38, 0.9)';
                badge.style.color = 'white';
                badge.style.fontSize = '10px';
                badge.style.fontWeight = '800';
                badge.style.padding = '4px 8px';
                badge.style.borderRadius = '4px';
                badge.style.zIndex = '5';
                badge.style.backdropFilter = 'blur(4px)';
                badge.textContent = '🔒 Geo-Restricted (VPN Req)';
                imgWrap.appendChild(badge);
            }
        }
    });
}

export function initializeIpCache() {
    return fetch('https://api.ipify.org?format=json')
        .then(r => r.json())
        .then(data => {
            const currentIp = data.ip;
            const lastIp = localStorage.getItem("cid_last_ip");
            if (lastIp && lastIp !== currentIp) {
                localStorage.removeItem("cid_checker_cache");
            }
            localStorage.setItem("cid_last_ip", currentIp);
        })
        .catch(() => {});
}

function saveVideoVerification(videoId, isBlocked) {
    try {
        const cache = JSON.parse(localStorage.getItem("cid_checker_cache") || "{}");
        cache[videoId] = { blocked: isBlocked, time: Date.now() };
        localStorage.setItem("cid_checker_cache", JSON.stringify(cache));
    } catch(e) {}
}

function isVideoCachedBlocked(videoId) {
    try {
        const cache = JSON.parse(localStorage.getItem("cid_checker_cache") || "{}");
        const entry = cache[videoId];
        if (entry && (Date.now() - entry.time < 7 * 86400000)) {
            return entry.blocked;
        }
    } catch(e) {}
    return null;
}

function isVideoCachedWorking(videoId) {
    try {
        const cache = JSON.parse(localStorage.getItem("cid_checker_cache") || "{}");
        const entry = cache[videoId];
        if (entry && (Date.now() - entry.time < 7 * 86400000)) {
            return !entry.blocked;
        }
    } catch(e) {}
    return false;
}

export function registerMasterArticles(articles) {
    articles.forEach(article => {
        allArticlesMap[article.id] = article;
        masterEpNumberMap[article.epNumber] = article;
    });
}

export function getCompletedWatchedList() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_COMPLETED) || '[]');
    } catch(e) {
        return [];
    }
}

function saveCompletedWatchedList(list) {
    localStorage.setItem(STORAGE_COMPLETED, JSON.stringify(list));
    updateFanDashboard();
}

function getTimestampsMap() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_TIMESTAMPS) || '{}');
    } catch(e) {
        return {};
    }
}

function getExactWatchSeconds() {
    try {
        return parseInt(localStorage.getItem(STORAGE_EXACT_WATCH_SECONDS) || '0', 10);
    } catch(e) {
        return 0;
    }
}

function saveExactWatchSeconds(seconds) {
    localStorage.setItem(STORAGE_EXACT_WATCH_SECONDS, seconds.toString());
    updateFanDashboard();
}

function startActiveWatchTracker(epId) {
    stopActiveWatchTracker();
    currentActiveEpId = epId;
    activeWatchTrackerTimer = setInterval(() => {
        if (currentActiveEpId) {
            let total = getExactWatchSeconds();
            total += 1;
            saveExactWatchSeconds(total);
        }
    }, 1000);
}

function stopActiveWatchTracker() {
    if (activeWatchTrackerTimer) {
        clearInterval(activeWatchTrackerTimer);
        activeWatchTrackerTimer = null;
    }
    currentActiveEpId = null;
}

export function updateWatchProgressUI(articleId) {
    const completedList = getCompletedWatchedList();
    const isCompleted = completedList.includes(articleId);
    
    const timestamps = getTimestampsMap();
    const savedTime = timestamps[articleId] || 0;

    const cards = document.querySelectorAll(`[data-article-id="${articleId}"]`);
    cards.forEach(card => {
        let badge = card.querySelector('.watched-status-badge');
        let progressBar = card.querySelector('.card-watch-progress-bar');
        
        if (isCompleted) {
            if (!badge) {
                const imgWrap = card.querySelector('.card-img-wrap');
                if (imgWrap) {
                    badge = document.createElement('span');
                    badge.className = 'watched-status-badge';
                    badge.innerHTML = `✓ Watched`;
                    imgWrap.appendChild(badge);
                }
            }
            if (progressBar) progressBar.style.width = '100%';
        } else if (savedTime > 0) {
            if (badge) badge.remove();
            if (progressBar) {
                const article = allArticlesMap[articleId];
                if (article) {
                    const durSecs = parseDurationToSeconds(article.durationText);
                    const pct = Math.min(100, Math.max(0, (savedTime / durSecs) * 100));
                    progressBar.style.width = `${pct}%`;
                }
            }
        }
    });
}

function parseDurationToSeconds(durStr) {
    if (!durStr) return 1300;
    const parts = durStr.split(':').map(p => parseInt(p, 10));
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 1300;
}

export function renderArticles(articles, containerId, isAppend = false) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!isAppend) {
        container.innerHTML = '';
        checkObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const articleId = entry.target.getAttribute('data-article-id');
                    const article = allArticlesMap[articleId];
                    if (article && article.videoId) {
                        const cachedBlocked = isVideoCachedBlocked(article.videoId);
                        const cachedWorking = isVideoCachedWorking(article.videoId);

                        if (cachedBlocked === true) {
                            markArticleGeoBlocked(article);
                        } else if (!cachedWorking && !verifiedVideos.has(article.videoId) && !bgCheckerQueue.some(item => item.videoId === article.videoId)) {
                            bgCheckerQueue.push(article);
                            processBgCheckerQueue();
                        }
                    }
                    checkObserver.unobserve(entry.target);
                }
            });
        }, { rootMargin: '200px' });
    }

    if (!articles || articles.length === 0) {
        if (!isAppend) {
            container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 4rem 1rem; opacity: 0.6;">No CID episodes found matching your filter.</div>';
        }
        return;
    }

    const fragment = document.createDocumentFragment();
    const completedList = getCompletedWatchedList();
    const timestampsMap = getTimestampsMap();

    articles.forEach(article => {
        allArticlesMap[article.id] = article;
        masterEpNumberMap[article.epNumber] = article;

        const isWatched = completedList.includes(article.id);
        const savedTime = timestampsMap[article.id] || 0;
        const durSecs = parseDurationToSeconds(article.durationText);
        const progressPct = isWatched ? 100 : (savedTime > 0 ? Math.min(100, (savedTime / durSecs) * 100) : 0);

        const card = document.createElement('article');
        card.className = 'card';
        card.setAttribute('data-article-id', article.id);

        const imageUrl = article.image;

        card.innerHTML = `
            <div class="card-img-wrap" onclick="openCleanPlayerById('${article.id}')" style="cursor: pointer;">
                <img src="${imageUrl}" alt="${article.title}" loading="lazy" class="card-img" onerror="this.src='https://via.placeholder.com/480x270/18181b/818cf8?text=CID+Episode'">
                <span class="card-duration-badge">${article.durationText}</span>
                ${isWatched ? `<span class="watched-status-badge">✓ Watched</span>` : ''}
                <div class="card-watch-progress-bar" style="width: ${progressPct}%;"></div>
            </div>
            <div class="card-content">
                <div class="card-meta">
                    <span class="card-source">${article.source}</span>
                    <span class="card-date">• ${article.airDate}</span>
                </div>
                <h2 class="card-title">
                    <a href="javascript:void(0)" onclick="openCleanPlayerById('${article.id}')">${article.title}</a>
                </h2>
                <div class="card-footer-action">
                    <button class="watch-now-btn" onclick="openCleanPlayerById('${article.id}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                        ${isWatched ? 'Re-watch Case' : (savedTime > 0 ? 'Resume Case' : 'Watch Case')}
                    </button>
                </div>
            </div>
        `;

        fragment.appendChild(card);
    });

    container.appendChild(fragment);

    if (checkObserver) {
        const newCards = container.querySelectorAll('.card');
        newCards.forEach(card => checkObserver.observe(card));
    }
}

window.openCleanPlayerById = function(articleId) {
    const article = allArticlesMap[articleId];
    if (article) openCleanPlayer(article);
};

export function openCleanPlayer(article) {
    currentModalEpNum = article.epNumber;
    let backdrop = document.getElementById('cid-clean-backdrop');
    
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'cid-clean-backdrop';
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
                    <div id="clean-player-target"></div>
                </div>
                <div class="tmkoc-modal-footer" style="justify-content: space-between; align-items: center; display: flex;">
                    <button class="tmkoc-nav-btn" onclick="navCleanEp(-1)">◀ Previous Ep</button>
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; cursor: pointer;">
                        <input type="checkbox" id="autoplay-next-chk" onchange="toggleAutoplay(this.checked)"> Autoplay Next
                    </label>
                    <button class="tmkoc-nav-btn" onclick="navCleanEp(1)">Next Ep ▶</button>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);

        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) closeCleanPlayer();
        });
    }

    const badge = document.getElementById('clean-badge');
    const title = document.getElementById('clean-title');
    const warning = document.getElementById('clean-modal-warning');
    const chk = document.getElementById('autoplay-next-chk');

    if (badge) badge.textContent = `EP ${article.epNumber}`;
    if (title) title.textContent = article.title;
    if (chk) chk.checked = (localStorage.getItem('autoplayNext') !== 'false');

    if (warning) {
        if (isVideoCachedBlocked(article.videoId)) {
            warning.style.display = 'block';
            warning.innerHTML = `⚠️ This CID episode is restricted in your region. Connect to an Indian VPN to unlock playback!`;
        } else {
            warning.style.display = 'none';
        }
    }

    const timestamps = getTimestampsMap();
    const startSeconds = timestamps[article.id] || 0;

    backdrop.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    if (ytPlayer) {
        try { ytPlayer.destroy(); } catch(e) {}
        ytPlayer = null;
    }

    const targetDiv = document.getElementById('clean-player-target');
    if (targetDiv) {
        targetDiv.innerHTML = '<div id="yt-embed-instance"></div>';
    }

    ytPlayer = new window.YT.Player('yt-embed-instance', {
        height: '100%',
        width: '100%',
        videoId: article.videoId,
        playerVars: {
            'autoplay': 1,
            'start': Math.floor(startSeconds),
            'rel': 0,
            'modestbranding': 1,
            'playsinline': 1
        },
        events: {
            'onStateChange': (event) => {
                if (event.data === window.YT.PlayerState.PLAYING) {
                    startActiveWatchTracker(article.id);
                } else if (event.data === window.YT.PlayerState.PAUSED || event.data === window.YT.PlayerState.ENDED) {
                    stopActiveWatchTracker();
                }

                if (event.data === window.YT.PlayerState.ENDED) {
                    const completedList = getCompletedWatchedList();
                    if (!completedList.includes(article.id)) {
                        completedList.push(article.id);
                        saveCompletedWatchedList(completedList);
                        updateWatchProgressUI(article.id);
                    }
                    if (chk && chk.checked) {
                        navCleanEp(1);
                    }
                }
            }
        }
    });

    startActiveWatchTracker(article.id);
}

window.closeCleanPlayer = function() {
    const backdrop = document.getElementById('cid-clean-backdrop');
    if (backdrop) backdrop.style.display = 'none';
    if (ytPlayer) {
        try { ytPlayer.destroy(); } catch(e) {}
        ytPlayer = null;
    }
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

function getFanLevel(watchedCount) {
    if (watchedCount >= 1000) return { title: 'ACP Pradyuman Rank', color: 'var(--text-primary)' };
    if (watchedCount >= 301) return { title: 'Senior Inspector (Daya/Abhijeet)', color: 'var(--text-primary)' };
    if (watchedCount >= 51) return { title: 'Sub-Inspector Freddy', color: 'var(--text-primary)' };
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
                No watched CID episodes logged yet.<br>Start watching cases to claim your spot on the Global Leaderboard!
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

window.closeFanModal = function() {
    const backdrop = document.getElementById('fan-modal-backdrop');
    if (backdrop) backdrop.style.display = 'none';
};

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

    const shareText = `I've watched ${count} CID episodes (${hours} Hours) on Daily Dose! My Agent Rank: ${level.title} (${handle}). Check your rank at CodeMasterAbhishek.github.io/Daily-Dose-of-CID/`;

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
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 4rem 1rem; opacity: 0.6;">No CID storylines found.</div>';
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
