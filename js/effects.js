// Apple-style subtle parallax and scroll logic

document.addEventListener('DOMContentLoaded', () => {
    // --- Apple-style Glass Cards Spotlight ---
    window.init3DEffects = function () {
        const grid = document.getElementById('reportsGrid');
        if (grid) {
            const observer = new MutationObserver((mutations) => {
                let shouldUpdate = false;
                mutations.forEach(m => { if (m.addedNodes.length) shouldUpdate = true; });
                if (shouldUpdate) setupGlassCards();
            });
            observer.observe(grid, { childList: true, subtree: true });
        }
        setupGlassCards();
    };

    function setupGlassCards() {
        const cards = document.querySelectorAll('.report-card:not([data-has-glass])');
        cards.forEach(card => {
            card.dataset.hasGlass = 'true';
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
                card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
            });
        });
    }

    // --- High-Res Galactic Canvas Starfield ---
    const canvas = document.getElementById('starfield');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let stars = [];
    const numStars = 200; // Reduced for premium pure black contrast

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Initialize Stars
    for (let i = 0; i < numStars; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 1.5 + 0.5,
            baseAlpha: Math.random() * 0.7 + 0.1, // Softer alphas
            speedY: Math.random() * 0.15 + 0.05,
            twinkleSpeed: Math.random() * 0.015 + 0.005,
            twinkleDir: Math.random() > 0.5 ? 1 : -1,
            alpha: Math.random()
        });
    }

    // Scroll parallax optimization
    let currentScrollY = 0;
    let targetScrollY = 0;
    window.addEventListener('scroll', () => {
        targetScrollY = window.scrollY;
    }, { passive: true });

    function renderStarfield() {
        // Clear frame
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Premium Apple soft glow effect
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';

        // Lerp scroll for smooth parallax feeling on star drift
        currentScrollY += (targetScrollY - currentScrollY) * 0.05;
        const scrollOffset = currentScrollY * 0.2; // Move stars slightly based on scroll

        stars.forEach(star => {
            // Twinkle logic
            star.alpha += star.twinkleSpeed * star.twinkleDir;
            if (star.alpha >= star.baseAlpha) {
                star.alpha = star.baseAlpha;
                star.twinkleDir = -1;
            } else if (star.alpha <= 0.1) {
                star.alpha = 0.1;
                star.twinkleDir = 1;
            }

            // Upward drift movement
            let currentY = star.y - scrollOffset - (performance.now() * star.speedY / 10);

            // Wrap stars vertically so they infinite loop
            currentY = currentY % canvas.height;
            if (currentY < 0) currentY += canvas.height;

            // Draw star
            ctx.beginPath();
            ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
            ctx.arc(star.x, currentY, star.size, 0, Math.PI * 2);
            ctx.fill();
        });

        window.requestAnimationFrame(renderStarfield);
    }

    // Start rendering
    window.requestAnimationFrame(renderStarfield);
});
