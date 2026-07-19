(function() {
    // --- Configuration ---
    const ELASTICITY = 1;   // Resistance factor (lower = tighter feel)
    const MAX_BOUNCE = 9999999;    // i want unlimited
    const SNAP_STYLE = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)'; // Deceleration curve

    let touchStartY = 0;
    let activeTarget = null;
    let isOverscrolling = false;

    // Helper: Find the specific container the user is trying to scroll
    function getActiveScrollParent(element) {
        let el = element;
        while (el && el !== document.body && el !== document.documentElement) {
            const style = window.getComputedStyle(el);
            const overflowY = style.overflowY || style.overflow;
            const isScrollable = overflowY === 'auto' || overflowY === 'scroll';
            
            if (isScrollable && el.scrollHeight > el.clientHeight) {
                return el;
            }
            el = el.parentElement;
        }
        // Fallback to body only if the main window itself is scrollable
        return document.body.scrollHeight > window.innerHeight ? document.body : null;
    }

    // --- Touch Event Listeners ---
    window.addEventListener('touchstart', function(e) {
        touchStartY = e.touches[0].clientY;
        isOverscrolling = false;
        
        // Pinpoint the exact scrolling pane
        activeTarget = getActiveScrollParent(e.target);
        
        // Reset its transition so tracking feels attached to your finger
        if (activeTarget) {
            activeTarget.style.transition = 'none';
        }
    }, { passive: true });

    window.addEventListener('touchmove', function(e) {
        if (!activeTarget) return; // Ignore if nothing is scrollable

        const currentY = e.touches[0].clientY;
        const deltaY = currentY - touchStartY;

        // 1. Check Top Boundary Conditions
        const isAtTop = (activeTarget === document.body) 
            ? (window.scrollY === 0) 
            : (activeTarget.scrollTop <= 0);

        // 2. Check Bottom Boundary Conditions (including 1px buffer for subpixel rounding)
        const isAtBottom = (activeTarget === document.body)
            ? (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 1)
            : (activeTarget.scrollHeight - activeTarget.scrollTop <= activeTarget.clientHeight + 1);

        // Handle pulling DOWN at the TOP
        if (deltaY > 0 && isAtTop) {
            isOverscrolling = true;
            if (e.cancelable) e.preventDefault(); 
            
            const pull = Math.min(MAX_BOUNCE, Math.pow(deltaY, 0.85) * ELASTICITY);
            activeTarget.style.transform = `translateY(${pull}px)`;
        } 
        // Handle pulling UP at the BOTTOM
        else if (deltaY < 0 && isAtBottom) {
            isOverscrolling = true;
            if (e.cancelable) e.preventDefault(); 

            // Convert deltaY to a positive absolute value for calculation, then make the transform negative
            const pull = Math.min(MAX_BOUNCE, Math.pow(Math.abs(deltaY), 0.85) * ELASTICITY);
            activeTarget.style.transform = `translateY(${-pull}px)`;
        }
    }, { passive: false });

    window.addEventListener('touchend', function() {
        if (isOverscrolling && activeTarget) {
            // Snap the targeted container back to normal
            activeTarget.style.transition = SNAP_STYLE;
            activeTarget.style.transform = 'translateY(0px)';
            
            // Clean up inline styles after animation finishes to keep DOM pristine
            const transientTarget = activeTarget;
            setTimeout(function() {
                if (transientTarget && transientTarget.style.transform === 'translateY(0px)') {
                    transientTarget.style.transition = '';
                    transientTarget.style.transform = '';
                }
            }, 400);
        }
        isOverscrolling = false;
        activeTarget = null;
    }, { passive: true });


    // --- Desktop Mouse Wheel Listeners ---
    let lastWheelTime = Date.now();
    window.addEventListener('wheel', function(e) {
        const targetPane = getActiveScrollParent(e.target);
        if (!targetPane) return;

        const isAtTop = (targetPane === document.body) 
            ? (window.scrollY === 0) 
            : (targetPane.scrollTop <= 0);

        const isAtBottom = (targetPane === document.body)
            ? (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 1)
            : (targetPane.scrollHeight - targetPane.scrollTop <= targetPane.clientHeight + 1);

        let directionMultiplier = 0;

        // Identify wheel interaction context
        if (e.deltaY < 0 && isAtTop) {
            directionMultiplier = 1;  // Bounce downwards
        } else if (e.deltaY > 0 && isAtBottom) {
            directionMultiplier = -1; // Bounce upwards
        }

        // If a boundary hit is validated
        if (directionMultiplier !== 0) {
            const now = Date.now();
            const timeDiff = Math.max(1, now - lastWheelTime);
            lastWheelTime = now;

            const velocity = Math.abs(e.deltaY) / timeDiff;
            const dynamicBounce = Math.min(MAX_BOUNCE, velocity * 30);

            if (dynamicBounce > 8) {
                targetPane.style.transition = 'none';
                targetPane.style.transform = `translateY(${dynamicBounce * directionMultiplier}px)`;
                
                targetPane.offsetHeight; // Force layout reflow

                targetPane.style.transition = SNAP_STYLE;
                targetPane.style.transform = 'translateY(0px)';
                
                // Clean up inline styles
                setTimeout(function() {
                    if (targetPane.style.transform === 'translateY(0px)') {
                        targetPane.style.transition = '';
                        targetPane.style.transform = '';
                    }
                }, 400);
            }
        }
    }, { passive: true });
})();