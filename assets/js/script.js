/* =========================================================
   공통 인터랙션 + 게임 로직 (jQuery 3.2.1)
========================================================= */
$(function () {
    initGlobalNav();
    initAimTrainer();
    initDodgeTrainer();
});

function initGlobalNav() {
    var $menuToggle = $(".menu-toggle");
    var $gnb = $(".gnb");
    var mobileBreakpoint = 768;

    $menuToggle.on("click", function () {
        var isExpanded = $(this).attr("aria-expanded") === "true";
        $(this).attr("aria-expanded", String(!isExpanded));
        $gnb.stop(true, true).slideToggle(220).toggleClass("is-open");
    });

    $gnb.find("a").on("click", function () {
        if (window.innerWidth <= mobileBreakpoint && $gnb.hasClass("is-open")) {
            $gnb.stop(true, true).slideUp(180).removeClass("is-open");
            $menuToggle.attr("aria-expanded", "false");
        }
    });

    $(window).on("resize", function () {
        if (window.innerWidth > mobileBreakpoint) {
            $gnb.removeClass("is-open").removeAttr("style");
            $menuToggle.attr("aria-expanded", "false");
        }
    });
}

function initAimTrainer() {
    var $aimBoard = $("#aimBoard");
    if ($aimBoard.length === 0) {
        return;
    }

    var tiers = [
        { key: "bronze", label: "Bronze", duration: 1400, spread: 0.28, targetScore: 16 },
        { key: "silver", label: "Silver", duration: 1200, spread: 0.34, targetScore: 17 },
        { key: "gold", label: "Gold", duration: 1050, spread: 0.45, targetScore: 18 },
        { key: "platinum", label: "Platinum", duration: 850, spread: 0.56, targetScore: 19 },
        { key: "diamond", label: "Diamond", duration: 680, spread: 0.8, targetScore: 21 },
        { key: "master", label: "Master", duration: 520, spread: 0.9, targetScore: 23 },
        { key: "challenger", label: "Challenger", duration: 360, spread: 1.0, targetScore: 25 }
    ];
    var modes = [
        { key: "classic", label: "Classic", desc: "기본 반응 에임", targetCount: 1, size: 22, move: false, scorePerHit: 1, missDelay: 500, reactionWindow: 0 },
        { key: "precision", label: "Precision", desc: "작은 타겟 정밀 사격", targetCount: 1, size: 14, move: false, scorePerHit: 2, missDelay: 420, reactionWindow: 0 },
        { key: "doubleshot", label: "Double Shot", desc: "동시 2개 타겟", targetCount: 2, size: 18, move: false, scorePerHit: 1, missDelay: 520, reactionWindow: 0 },
        { key: "moving", label: "Moving Targets", desc: "이동 표적 트래킹", targetCount: 1, size: 20, move: true, scorePerHit: 1, missDelay: 380, reactionWindow: 0 },
        { key: "reflex", label: "Reflex Test", desc: "짧은 반응 시간 테스트", targetCount: 1, size: 18, move: false, scorePerHit: 1, missDelay: 300, reactionWindow: 700 }
    ];

    var totalRounds = 30;
    var currentRound = 0;
    var currentScore = 0;
    var selectedTier = null;
    var selectedMode = modes[0];
    var activeTargetTimeout = null;
    var interTargetDelayTimeout = null;
    var gameRunning = false;
    var previousTargetPoint = null;
    var activeTargetsCount = 0;
    var totalClicks = 0;
    var totalHits = 0;
    var reactionTimeSamples = [];

    var $difficultyOverlay = $("#difficultyOverlay");
    var $resultOverlay = $("#resultOverlay");
    var $modeButtons = $("#modeButtons");
    var $difficultyButtons = $("#difficultyButtons");
    var $currentScore = $("#currentScore");
    var $currentRound = $("#currentRound");
    var $totalRounds = $("#totalRounds");
    var $modeLabel = $("#modeLabel");
    var $tierLabel = $("#tierLabel");
    var $finalScore = $("#finalScore");
    var $targetScore = $("#targetScore");
    var $resultTitle = $("#resultTitle");
    var $resultBadge = $("#resultBadge");
    var $retryButton = $("#retryButton");
    var $changeDifficultyButton = $("#changeDifficultyButton");
    var $accuracyValue = $("#accuracyValue");
    var $avgReactionValue = $("#avgReactionValue");

    function updateHud() {
        $currentScore.text(currentScore);
        $currentRound.text(currentRound);
        $tierLabel.text(selectedTier ? selectedTier.label : "-");
        $modeLabel.text(selectedMode ? selectedMode.label : "-");
    }

    function renderModeButtons() {
        var html = "";
        var i = 0;
        for (i = 0; i < modes.length; i += 1) {
            html += '<button type="button" class="difficulty-btn mode-btn' + (i === 0 ? " active" : "") + '" data-mode-index="' + i + '">' + modes[i].label + "</button>";
        }
        $modeButtons.html(html);
    }

    function renderTierButtons() {
        var html = "";
        var i = 0;
        for (i = 0; i < tiers.length; i += 1) {
            html += '<button type="button" class="difficulty-btn tier-btn" data-tier-index="' + i + '">' + tiers[i].label + "</button>";
        }
        $difficultyButtons.html(html);
    }

    function clearTimers() {
        if (activeTargetTimeout) {
            clearTimeout(activeTargetTimeout);
            activeTargetTimeout = null;
        }
        if (interTargetDelayTimeout) {
            clearTimeout(interTargetDelayTimeout);
            interTargetDelayTimeout = null;
        }
    }

    function clearActiveTarget() {
        clearTimers();
        activeTargetsCount = 0;
        $aimBoard.find(".aim-target").remove();
    }

    function createRandomPointForTier(tier, size) {
        var boardWidth = $aimBoard.innerWidth();
        var boardHeight = $aimBoard.innerHeight();
        var centerX = boardWidth / 2;
        var centerY = boardHeight / 2;
        var safePadding = Math.max(18, size + 6);
        var maxOffsetX = Math.max((boardWidth * tier.spread) / 2 - safePadding, 20);
        var maxOffsetY = Math.max((boardHeight * tier.spread) / 2 - safePadding, 20);
        var x = centerX + (Math.random() * 2 - 1) * maxOffsetX;
        var y = centerY + (Math.random() * 2 - 1) * maxOffsetY;
        var attempts = 0;

        if (tier.key === "diamond" || tier.key === "master" || tier.key === "challenger") {
            x = safePadding + Math.random() * (boardWidth - safePadding * 2);
            y = safePadding + Math.random() * (boardHeight - safePadding * 2);
        }

        if (tier.key === "challenger" && previousTargetPoint) {
            var minDistance = Math.min(boardWidth, boardHeight) * 0.45;
            while (attempts < 12) {
                var testX = safePadding + Math.random() * (boardWidth - safePadding * 2);
                var testY = safePadding + Math.random() * (boardHeight - safePadding * 2);
                var dx = testX - previousTargetPoint.x;
                var dy = testY - previousTargetPoint.y;
                if (Math.sqrt(dx * dx + dy * dy) >= minDistance) {
                    x = testX;
                    y = testY;
                    break;
                }
                attempts += 1;
            }
        }

        return {
            x: Math.max(safePadding, Math.min(boardWidth - safePadding, x)),
            y: Math.max(safePadding, Math.min(boardHeight - safePadding, y))
        };
    }

    function spawnHitEffect(point) {
        var $effect = $('<span class="target-hit-effect"></span>');
        $effect.css({ left: point.x + "px", top: point.y + "px" });
        $aimBoard.append($effect);
        setTimeout(function () { $effect.remove(); }, 280);
    }

    function spawnMissEffect(point) {
        var $effect = $('<span class="miss-text-effect">Miss!</span>');
        $aimBoard.addClass("miss-flash");
        $effect.css({ left: point.x + "px", top: point.y + "px" });
        $aimBoard.append($effect);
        setTimeout(function () {
            $effect.remove();
            $aimBoard.removeClass("miss-flash");
        }, 260);
    }

    function queueNextTarget(delayMs) {
        if (interTargetDelayTimeout) {
            clearTimeout(interTargetDelayTimeout);
        }
        interTargetDelayTimeout = setTimeout(function () {
            interTargetDelayTimeout = null;
            spawnNextTarget();
        }, delayMs);
    }

    function getModeAdjustedDuration() {
        var duration = selectedTier.duration;
        if (selectedMode.key === "precision") {
            duration = Math.max(300, selectedTier.duration - 120);
        } else if (selectedMode.key === "doubleshot") {
            duration = Math.max(340, selectedTier.duration - 80);
        } else if (selectedMode.key === "moving") {
            duration = Math.max(420, selectedTier.duration + 200);
        } else if (selectedMode.key === "reflex") {
            duration = Math.max(220, selectedTier.duration - 200);
        }
        return duration;
    }

    function computeTargetScore() {
        var modeBonus = 0;
        if (selectedMode.key === "precision") {
            modeBonus = 4;
        } else if (selectedMode.key === "doubleshot") {
            modeBonus = 3;
        } else if (selectedMode.key === "moving") {
            modeBonus = 2;
        } else if (selectedMode.key === "reflex") {
            modeBonus = 3;
        }
        return selectedTier.targetScore + modeBonus;
    }

    function spawnSingleTarget(spawnDuration) {
        var point = createRandomPointForTier(selectedTier, selectedMode.size);
        var $target = $('<button type="button" class="aim-target" aria-label="target"></button>');
        var spawnedAt = Date.now();
        var boardWidth = $aimBoard.innerWidth();
        var boardHeight = $aimBoard.innerHeight();

        $target.css({
            left: point.x + "px",
            top: point.y + "px",
            width: selectedMode.size + "px",
            height: selectedMode.size + "px"
        });

        if (selectedMode.move) {
            var dx = (Math.random() * 2 - 1) * Math.max(45, boardWidth * 0.12);
            var dy = (Math.random() * 2 - 1) * Math.max(45, boardHeight * 0.12);
            var nextX = Math.max(selectedMode.size, Math.min(boardWidth - selectedMode.size, point.x + dx));
            var nextY = Math.max(selectedMode.size, Math.min(boardHeight - selectedMode.size, point.y + dy));
            $target.addClass("is-moving");
            setTimeout(function () {
                if (gameRunning && $target.parent().length > 0) {
                    $target.css({
                        left: nextX + "px",
                        top: nextY + "px",
                        transform: "translate(-50%, -50%) scale(1.05)"
                    });
                }
            }, 20);
        }

        $target.on("mousedown", function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (!gameRunning) {
                return;
            }
            totalClicks += 1;
            totalHits += 1;
            if (selectedMode.reactionWindow > 0 && Date.now() - spawnedAt > selectedMode.reactionWindow) {
                currentScore = Math.max(0, currentScore - 1);
            } else {
                currentScore += selectedMode.scorePerHit;
            }
            reactionTimeSamples.push(Date.now() - spawnedAt);
            spawnHitEffect({
                x: parseFloat($target.css("left")),
                y: parseFloat($target.css("top"))
            });
            $target.remove();
            activeTargetsCount = Math.max(0, activeTargetsCount - 1);
            updateHud();
            if (activeTargetsCount === 0) {
                clearTimers();
                queueNextTarget(40);
            }
        });
        $aimBoard.append($target);
    }

    function spawnNextTarget() {
        var i = 0;
        var spawnDuration = getModeAdjustedDuration();

        if (!gameRunning) {
            return;
        }
        if (currentRound >= totalRounds) {
            endGame();
            return;
        }

        clearActiveTarget();
        currentRound += 1;
        updateHud();
        activeTargetsCount = selectedMode.targetCount;

        for (i = 0; i < selectedMode.targetCount; i += 1) {
            spawnSingleTarget(spawnDuration);
        }
        previousTargetPoint = createRandomPointForTier(selectedTier, selectedMode.size);

        activeTargetTimeout = setTimeout(function () {
            clearActiveTarget();
            spawnNextTarget();
        }, spawnDuration);
    }

    function startGame(tierIndex) {
        selectedTier = tiers[tierIndex];
        currentRound = 0;
        currentScore = 0;
        previousTargetPoint = null;
        totalClicks = 0;
        totalHits = 0;
        reactionTimeSamples = [];
        gameRunning = true;
        $difficultyButtons.find(".tier-btn").removeClass("active");
        $difficultyButtons.find('[data-tier-index="' + tierIndex + '"]').addClass("active");
        $difficultyOverlay.addClass("hidden");
        $resultOverlay.addClass("hidden");
        $aimBoard.addClass("game-active");
        updateHud();
        spawnNextTarget();
    }

    function endGame() {
        var targetScore = computeTargetScore();
        var isVictory = currentScore >= targetScore;
        var accuracy = totalClicks === 0 ? 0 : (totalHits / totalClicks) * 100;
        var avgReaction = 0;
        var i = 0;
        gameRunning = false;
        clearActiveTarget();
        $aimBoard.removeClass("game-active");

        if (reactionTimeSamples.length > 0) {
            for (i = 0; i < reactionTimeSamples.length; i += 1) {
                avgReaction += reactionTimeSamples[i];
            }
            avgReaction = Math.round(avgReaction / reactionTimeSamples.length);
        }

        $finalScore.text(currentScore);
        $targetScore.text(targetScore);
        $accuracyValue.text(accuracy.toFixed(1) + "%");
        $avgReactionValue.text(avgReaction + " ms");
        if (isVictory) {
            $resultBadge.text("Mode Cleared");
            $resultTitle.text("VICTORY").removeClass("defeat").addClass("victory");
        } else {
            $resultBadge.text("Need More Practice");
            $resultTitle.text("DEFEAT").removeClass("victory").addClass("defeat");
        }
        $resultOverlay.removeClass("hidden");
    }

    $aimBoard.on("mousedown", function (event) {
        if (!gameRunning || $(event.target).closest(".aim-target").length > 0) {
            return;
        }
        var offset = $aimBoard.offset();
        totalClicks += 1;
        spawnMissEffect({ x: event.pageX - offset.left, y: event.pageY - offset.top });
        clearActiveTarget();
        queueNextTarget(selectedMode.missDelay);
    });

    $modeButtons.on("click", ".mode-btn", function () {
        var modeIndex = Number($(this).attr("data-mode-index"));
        if (Number.isNaN(modeIndex)) {
            return;
        }
        selectedMode = modes[modeIndex];
        $modeButtons.find(".mode-btn").removeClass("active");
        $(this).addClass("active");
        updateHud();
    });

    $difficultyButtons.on("click", ".tier-btn", function () {
        var tierIndex = Number($(this).attr("data-tier-index"));
        if (!Number.isNaN(tierIndex)) {
            startGame(tierIndex);
        }
    });

    $retryButton.on("click", function () {
        if (!selectedTier) {
            return;
        }
        var idx = 0;
        for (idx = 0; idx < tiers.length; idx += 1) {
            if (tiers[idx].key === selectedTier.key) {
                startGame(idx);
                break;
            }
        }
    });

    $changeDifficultyButton.on("click", function () {
        gameRunning = false;
        clearActiveTarget();
        selectedTier = null;
        currentRound = 0;
        currentScore = 0;
        totalClicks = 0;
        totalHits = 0;
        reactionTimeSamples = [];
        $resultOverlay.addClass("hidden");
        $difficultyOverlay.removeClass("hidden");
        $aimBoard.removeClass("game-active miss-flash");
        updateHud();
    });

    $totalRounds.text(totalRounds);
    renderModeButtons();
    renderTierButtons();
    updateHud();
}

function initDodgeTrainer() {
    var $board = $("#dodgeBoard");
    if ($board.length === 0) {
        return;
    }

    var canvas = document.getElementById("dodgeCanvas");
    var ctx = canvas.getContext("2d");
    var $overlay = $("#dodgeDifficultyOverlay");
    var $resultOverlay = $("#dodgeResultOverlay");
    var $difficultyButtons = $("#dodgeDifficultyButtons");
    var $countdown = $("#dodgeCountdown");
    var $tierLabel = $("#dodgeTierLabel");
    var $timeLabel = $("#dodgeTimeLabel");
    var $hitCount = $("#dodgeHitCount");
    var $hpBar = $("#dodgeHpBar");
    var $hpText = $("#dodgeHpText");
    var $resultTitle = $("#dodgeResultTitle");
    var $resultBadge = $("#dodgeResultBadge");
    var $survival = $("#dodgeSurvivalTime");
    var $resultHits = $("#dodgeResultHits");
    var $retryButton = $("#dodgeRetryButton");
    var $changeButton = $("#dodgeChangeDifficultyButton");

    var tiers = [
        { key: "bronze", label: "Bronze", timeLimit: 60, attackGap: [2.1, 2.8] },
        { key: "silver", label: "Silver", timeLimit: 63, attackGap: [1.9, 2.5] },
        { key: "gold", label: "Gold", timeLimit: 66, attackGap: [1.7, 2.2] },
        { key: "platinum", label: "Platinum", timeLimit: 69, attackGap: [1.5, 2.0] },
        { key: "diamond", label: "Diamond", timeLimit: 72, attackGap: [1.3, 1.8] },
        { key: "master", label: "Master", timeLimit: 75, attackGap: [1.1, 1.6] },
        { key: "challenger", label: "Challenger", timeLimit: 78, attackGap: [0.95, 1.35] }
    ];

    var state = {
        running: false,
        countdownActive: false,
        selectedTierIndex: null,
        hp: 100,
        hitCount: 0,
        elapsed: 0,
        timeLeft: 0,
        player: { x: 140, y: 580, r: 16, speed: 280, targetX: 140, targetY: 580 },
        enemy: { x: 1120, y: 110, r: 18, speed: 120, castLock: 0, facingX: -1, facingY: 1 },
        indicators: [],
        projectiles: [],
        attackCooldown: 0,
        attackQueue: [],
        ultimateLock: 0,
        rafId: 0,
        lastTs: 0
    };

    var AttackPattern = {
        projectile: { key: "projectile", damage: 5 },
        circleAoe: { key: "circleAoe", damage: 10 },
        fanSlash: { key: "fanSlash", damage: 15 },
        ultimate: { key: "ultimate", damage: 10 }
    };

    function resizeCanvas() {
        var w = $board.innerWidth();
        var h = $board.innerHeight();
        canvas.width = Math.max(960, Math.floor(w));
        canvas.height = Math.max(540, Math.floor(h));
    }

    function resetStateForTier(tierIndex) {
        var tier = tiers[tierIndex];
        state.selectedTierIndex = tierIndex;
        state.running = false;
        state.countdownActive = true;
        state.hp = 100;
        state.hitCount = 0;
        state.elapsed = 0;
        state.timeLeft = tier.timeLimit;
        state.player.x = 140;
        state.player.y = canvas.height - 120;
        state.player.targetX = state.player.x;
        state.player.targetY = state.player.y;
        state.enemy.x = canvas.width - 140;
        state.enemy.y = 120;
        state.enemy.castLock = 0;
        state.indicators = [];
        state.projectiles = [];
        state.attackQueue = [];
        state.ultimateLock = 0;
        state.attackCooldown = randomRange(tier.attackGap[0], tier.attackGap[1]);
        updateHud();
    }

    function updateHud() {
        $tierLabel.text(state.selectedTierIndex === null ? "-" : tiers[state.selectedTierIndex].label);
        $timeLabel.text(state.timeLeft.toFixed(1) + "s");
        $hitCount.text(state.hitCount);
        $hpBar.css("width", Math.max(0, state.hp) + "%");
        $hpText.text(Math.max(0, Math.round(state.hp)) + " / 100");
    }

    function randomRange(min, max) {
        return min + Math.random() * (max - min);
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function distance(ax, ay, bx, by) {
        var dx = ax - bx;
        var dy = ay - by;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function normalize(dx, dy) {
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        return { x: dx / len, y: dy / len };
    }

    function applyDamage(amount) {
        state.hp -= amount;
        state.hitCount += 1;
        updateHud();
        if (state.hp <= 0) {
            endGame(false);
        }
    }

    function drawCircle(x, y, r, color, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawGrid() {
        ctx.fillStyle = "#090d1a";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        var step = 36;
        var x = 0;
        var y = 0;
        ctx.strokeStyle = "rgba(110,125,185,0.12)";
        ctx.lineWidth = 1;
        for (x = 0; x <= canvas.width; x += step) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        for (y = 0; y <= canvas.height; y += step) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }
    }

    function updatePlayer(dt) {
        var dx = state.player.targetX - state.player.x;
        var dy = state.player.targetY - state.player.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.5) {
            return;
        }
        var step = state.player.speed * dt;
        if (step >= dist) {
            state.player.x = state.player.targetX;
            state.player.y = state.player.targetY;
        } else {
            state.player.x += (dx / dist) * step;
            state.player.y += (dy / dist) * step;
        }
        state.player.x = clamp(state.player.x, state.player.r, canvas.width - state.player.r);
        state.player.y = clamp(state.player.y, state.player.r, canvas.height - state.player.r);
    }

    function updateEnemy(dt) {
        if (state.enemy.castLock > 0 || state.ultimateLock > 0) {
            return;
        }
        var orbit = { x: state.player.x + 170, y: state.player.y - 120 };
        var dx = orbit.x - state.enemy.x;
        var dy = orbit.y - state.enemy.y;
        var dir = normalize(dx, dy);
        var speed = state.enemy.speed;
        state.enemy.x += dir.x * speed * dt;
        state.enemy.y += dir.y * speed * dt;
        state.enemy.x = clamp(state.enemy.x, state.enemy.r + 10, canvas.width - state.enemy.r - 10);
        state.enemy.y = clamp(state.enemy.y, state.enemy.r + 10, canvas.height - state.enemy.r - 10);
        state.enemy.facingX = state.player.x - state.enemy.x;
        state.enemy.facingY = state.player.y - state.enemy.y;
    }

    function queueAttack(key) {
        if (key === "projectile") {
            var nd = normalize(state.player.x - state.enemy.x, state.player.y - state.enemy.y);
            state.indicators.push({
                type: "triangleWindup",
                x: state.enemy.x,
                y: state.enemy.y,
                dirX: nd.x,
                dirY: nd.y,
                ttl: 0.55,
                onDone: function () {
                    state.projectiles.push({
                        type: "bullet",
                        x: state.enemy.x,
                        y: state.enemy.y,
                        vx: nd.x * 540,
                        vy: nd.y * 540,
                        radius: 9,
                        damage: AttackPattern.projectile.damage,
                        life: 1.25,
                        hit: false
                    });
                }
            });
            return;
        }

        if (key === "circleAoe") {
            var px = state.player.x + randomRange(-70, 70);
            var py = state.player.y + randomRange(-70, 70);
            state.indicators.push({
                type: "circleAoe",
                x: clamp(px, 40, canvas.width - 40),
                y: clamp(py, 40, canvas.height - 40),
                radius: 66,
                ttl: 0.75,
                damage: AttackPattern.circleAoe.damage,
                hit: false
            });
            return;
        }

        if (key === "fanSlash") {
            var fanDir = normalize(state.player.x - state.enemy.x, state.player.y - state.enemy.y);
            state.enemy.castLock = 0.8;
            state.indicators.push({
                type: "fanSlash",
                x: state.enemy.x,
                y: state.enemy.y,
                dirX: fanDir.x,
                dirY: fanDir.y,
                radius: 210,
                angle: Math.PI / 2.2,
                ttl: 0.8,
                damage: AttackPattern.fanSlash.damage,
                hit: false
            });
            return;
        }

        if (key === "ultimate") {
            startUltimate();
        }
    }

    function startUltimate() {
        var edge = Math.floor(Math.random() * 4);
        var ex = state.enemy.x;
        var ey = state.enemy.y;
        state.ultimateLock = 2.6;
        state.enemy.castLock = 2.6;

        if (edge === 0) { ex = randomRange(80, canvas.width - 80); ey = 30; }
        if (edge === 1) { ex = canvas.width - 30; ey = randomRange(80, canvas.height - 80); }
        if (edge === 2) { ex = randomRange(80, canvas.width - 80); ey = canvas.height - 30; }
        if (edge === 3) { ex = 30; ey = randomRange(80, canvas.height - 80); }
        state.enemy.x = ex;
        state.enemy.y = ey;

        var t = 0.2;
        var shot = 0;
        state.attackQueue = [];
        for (shot = 0; shot < 4; shot += 1) {
            t += randomRange(0.5, 3.0);
            state.attackQueue.push({
                time: t,
                fired: false
            });
        }
    }

    function fireUltimateShot() {
        var dir = normalize(state.player.x - state.enemy.x, state.player.y - state.enemy.y);
        state.indicators.push({
            type: "lineSnipe",
            x: state.enemy.x,
            y: state.enemy.y,
            dirX: dir.x,
            dirY: dir.y,
            ttl: 0.2,
            width: 18,
            damage: AttackPattern.ultimate.damage,
            hit: false
        });
    }

    function pickRandomAttack() {
        var keys = ["projectile", "circleAoe", "fanSlash", "ultimate"];
        return keys[Math.floor(Math.random() * keys.length)];
    }

    function checkCircleCollision(cx, cy, cr, px, py, pr) {
        return distance(cx, cy, px, py) <= cr + pr;
    }

    function checkLineCollision(line, px, py, pr) {
        var x1 = line.x;
        var y1 = line.y;
        var x2 = line.x + line.dirX * 2000;
        var y2 = line.y + line.dirY * 2000;
        var a = px - x1;
        var b = py - y1;
        var c = x2 - x1;
        var d = y2 - y1;
        var dot = a * c + b * d;
        var lenSq = c * c + d * d;
        var t = clamp(dot / lenSq, 0, 1);
        var nx = x1 + c * t;
        var ny = y1 + d * t;
        return distance(nx, ny, px, py) <= line.width / 2 + pr;
    }

    function updateAttacks(dt) {
        var i = 0;
        var ind;
        var proj;

        for (i = state.indicators.length - 1; i >= 0; i -= 1) {
            ind = state.indicators[i];
            ind.ttl -= dt;

            if (ind.type === "circleAoe" && ind.ttl <= 0.12 && !ind.hit) {
                if (checkCircleCollision(ind.x, ind.y, ind.radius, state.player.x, state.player.y, state.player.r)) {
                    applyDamage(ind.damage);
                }
                ind.hit = true;
            }

            if (ind.type === "fanSlash" && ind.ttl <= 0.12 && !ind.hit) {
                var toPlayer = normalize(state.player.x - ind.x, state.player.y - ind.y);
                var dot = toPlayer.x * ind.dirX + toPlayer.y * ind.dirY;
                var angle = Math.acos(clamp(dot, -1, 1));
                if (distance(ind.x, ind.y, state.player.x, state.player.y) <= ind.radius && angle <= ind.angle / 2) {
                    applyDamage(ind.damage);
                }
                ind.hit = true;
            }

            if (ind.type === "lineSnipe" && !ind.hit && checkLineCollision(ind, state.player.x, state.player.y, state.player.r)) {
                applyDamage(ind.damage);
                ind.hit = true;
            }

            if (ind.ttl <= 0) {
                if (ind.type === "triangleWindup" && ind.onDone) {
                    ind.onDone();
                }
                state.indicators.splice(i, 1);
            }
        }

        for (i = state.projectiles.length - 1; i >= 0; i -= 1) {
            proj = state.projectiles[i];
            proj.life -= dt;
            proj.x += proj.vx * dt;
            proj.y += proj.vy * dt;

            if (!proj.hit && checkCircleCollision(proj.x, proj.y, proj.radius, state.player.x, state.player.y, state.player.r)) {
                applyDamage(proj.damage);
                proj.hit = true;
            }
            if (proj.life <= 0 || proj.hit || proj.x < -30 || proj.x > canvas.width + 30 || proj.y < -30 || proj.y > canvas.height + 30) {
                state.projectiles.splice(i, 1);
            }
        }
    }

    function updateAttackAI(dt) {
        var tier = tiers[state.selectedTierIndex];
        var i = 0;
        if (state.enemy.castLock > 0) {
            state.enemy.castLock -= dt;
        }
        if (state.ultimateLock > 0) {
            state.ultimateLock -= dt;
            for (i = 0; i < state.attackQueue.length; i += 1) {
                if (!state.attackQueue[i].fired && state.attackQueue[i].time >= 0) {
                    state.attackQueue[i].time -= dt;
                    if (state.attackQueue[i].time <= 0) {
                        state.attackQueue[i].fired = true;
                        fireUltimateShot();
                    }
                }
            }
            return;
        }

        state.attackCooldown -= dt;
        if (state.attackCooldown <= 0) {
            queueAttack(pickRandomAttack());
            state.attackCooldown = randomRange(tier.attackGap[0], tier.attackGap[1]);
        }
    }

    function drawEnemyShape() {
        var dir = normalize(state.enemy.facingX, state.enemy.facingY);
        var perp = { x: -dir.y, y: dir.x };
        var r = state.enemy.r + 4;
        ctx.fillStyle = "rgba(226,90,255,0.95)";
        ctx.beginPath();
        ctx.moveTo(state.enemy.x + dir.x * r, state.enemy.y + dir.y * r);
        ctx.lineTo(state.enemy.x - dir.x * r + perp.x * r * 0.75, state.enemy.y - dir.y * r + perp.y * r * 0.75);
        ctx.lineTo(state.enemy.x - dir.x * r - perp.x * r * 0.75, state.enemy.y - dir.y * r - perp.y * r * 0.75);
        ctx.closePath();
        ctx.fill();
    }

    function drawIndicators() {
        var i = 0;
        var ind;
        for (i = 0; i < state.indicators.length; i += 1) {
            ind = state.indicators[i];
            ctx.save();
            if (ind.type === "triangleWindup") {
                var p = { x: -ind.dirY, y: ind.dirX };
                var len = 100;
                ctx.fillStyle = "rgba(255,116,116,0.25)";
                ctx.beginPath();
                ctx.moveTo(ind.x + ind.dirX * len, ind.y + ind.dirY * len);
                ctx.lineTo(ind.x - ind.dirX * 16 + p.x * 28, ind.y - ind.dirY * 16 + p.y * 28);
                ctx.lineTo(ind.x - ind.dirX * 16 - p.x * 28, ind.y - ind.dirY * 16 - p.y * 28);
                ctx.closePath();
                ctx.fill();
            } else if (ind.type === "circleAoe") {
                ctx.fillStyle = "rgba(255,84,125,0.22)";
                ctx.strokeStyle = "rgba(255,84,125,0.9)";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(ind.x, ind.y, ind.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            } else if (ind.type === "fanSlash") {
                var baseAngle = Math.atan2(ind.dirY, ind.dirX);
                ctx.fillStyle = "rgba(255,173,82,0.2)";
                ctx.strokeStyle = "rgba(255,173,82,0.9)";
                ctx.beginPath();
                ctx.moveTo(ind.x, ind.y);
                ctx.arc(ind.x, ind.y, ind.radius, baseAngle - ind.angle / 2, baseAngle + ind.angle / 2);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            } else if (ind.type === "lineSnipe") {
                ctx.strokeStyle = "rgba(255,235,114,0.9)";
                ctx.lineWidth = ind.width;
                ctx.beginPath();
                ctx.moveTo(ind.x, ind.y);
                ctx.lineTo(ind.x + ind.dirX * 2000, ind.y + ind.dirY * 2000);
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    function drawProjectiles() {
        var i = 0;
        var p;
        for (i = 0; i < state.projectiles.length; i += 1) {
            p = state.projectiles[i];
            drawCircle(p.x, p.y, p.radius, "#ff7f7f", 0.95);
        }
    }

    function render() {
        drawGrid();
        drawIndicators();
        drawProjectiles();
        drawCircle(state.player.x, state.player.y, state.player.r, "#3de8ff", 0.95);
        drawEnemyShape();
    }

    function gameLoop(ts) {
        var dt = Math.min(0.033, (ts - state.lastTs) / 1000 || 0);
        state.lastTs = ts;

        if (state.running) {
            state.elapsed += dt;
            state.timeLeft = Math.max(0, tiers[state.selectedTierIndex].timeLimit - state.elapsed);
            updatePlayer(dt);
            updateEnemy(dt);
            updateAttackAI(dt);
            updateAttacks(dt);
            updateHud();

            if (state.timeLeft <= 0) {
                endGame(true);
            }
        }

        render();
        state.rafId = requestAnimationFrame(gameLoop);
    }

    function runCountdownThenStart() {
        var steps = ["3", "2", "1", "START!"];
        var idx = 0;
        $countdown.removeClass("hidden").text(steps[idx]);

        function tick() {
            idx += 1;
            if (idx >= steps.length) {
                $countdown.addClass("hidden");
                state.countdownActive = false;
                state.running = true;
                return;
            }
            $countdown.text(steps[idx]);
            setTimeout(tick, 750);
        }
        setTimeout(tick, 750);
    }

    function startGame(tierIndex) {
        resizeCanvas();
        resetStateForTier(tierIndex);
        $overlay.addClass("hidden");
        $resultOverlay.addClass("hidden");
        runCountdownThenStart();
    }

    function endGame(isVictory) {
        state.running = false;
        $survival.text(state.elapsed.toFixed(1) + "s");
        $resultHits.text(state.hitCount);
        if (isVictory) {
            $resultBadge.text("Well Dodged");
            $resultTitle.text("VICTORY").removeClass("defeat").addClass("victory");
        } else {
            $resultBadge.text("Outplayed");
            $resultTitle.text("DEFEAT").removeClass("victory").addClass("defeat");
        }
        $resultOverlay.removeClass("hidden");
    }

    function renderDifficultyButtons() {
        var html = "";
        var i = 0;
        for (i = 0; i < tiers.length; i += 1) {
            html += '<button type="button" class="difficulty-btn" data-tier-index="' + i + '">' + tiers[i].label + " (" + tiers[i].timeLimit + "s)</button>";
        }
        $difficultyButtons.html(html);
    }

    $("#dodgeCanvas").on("mousedown", function (event) {
        if (!state.running) {
            return;
        }
        var rect = canvas.getBoundingClientRect();
        var scaleX = canvas.width / rect.width;
        var scaleY = canvas.height / rect.height;
        var tx = (event.clientX - rect.left) * scaleX;
        var ty = (event.clientY - rect.top) * scaleY;
        state.player.targetX = clamp(tx, state.player.r, canvas.width - state.player.r);
        state.player.targetY = clamp(ty, state.player.r, canvas.height - state.player.r);
    });

    $difficultyButtons.on("click", ".difficulty-btn", function () {
        var tierIndex = Number($(this).attr("data-tier-index"));
        if (!Number.isNaN(tierIndex)) {
            startGame(tierIndex);
        }
    });

    $retryButton.on("click", function () {
        if (state.selectedTierIndex !== null) {
            startGame(state.selectedTierIndex);
        }
    });

    $changeButton.on("click", function () {
        state.running = false;
        state.selectedTierIndex = null;
        state.hp = 100;
        state.hitCount = 0;
        state.elapsed = 0;
        state.timeLeft = 0;
        state.indicators = [];
        state.projectiles = [];
        updateHud();
        $resultOverlay.addClass("hidden");
        $overlay.removeClass("hidden");
    });

    $(window).on("resize", resizeCanvas);
    resizeCanvas();
    renderDifficultyButtons();
    updateHud();
    state.lastTs = performance.now();
    state.rafId = requestAnimationFrame(gameLoop);
}
