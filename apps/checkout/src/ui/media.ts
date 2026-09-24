/** Small behaviors for media and scrollable rows. */

export function bindHorizontalDragScroll(scroller: HTMLElement): () => void {
  const dragThreshold = 6;
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let startScrollLeft = 0;
  let dragging = false;
  let suppressClick = false;
  let suppressClickTimer = 0;

  const releasePointer = (id: number) => {
    try {
      if (scroller.hasPointerCapture?.(id)) scroller.releasePointerCapture(id);
    } catch {
      // The browser can release capture before pointerup during an interrupted gesture.
    }
  };
  const resetGesture = (id: number, shouldSuppressClick: boolean) => {
    pointerId = null;
    dragging = false;
    scroller.classList.remove("is-dragging");
    releasePointer(id);
    if (!shouldSuppressClick) return;
    suppressClick = true;
    window.clearTimeout(suppressClickTimer);
    suppressClickTimer = window.setTimeout(() => { suppressClick = false; }, 0);
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || event.pointerType === "touch" || scroller.scrollWidth <= scroller.clientWidth + 1) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    startScrollLeft = scroller.scrollLeft;
    dragging = false;
    try {
      scroller.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic pointer events and older embedded browsers may not own the id.
    }
  };
  const onPointerMove = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (!dragging) {
      if (Math.hypot(deltaX, deltaY) < dragThreshold) return;
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        resetGesture(event.pointerId, false);
        return;
      }
      dragging = true;
      scroller.classList.add("is-dragging");
    }
    event.preventDefault();
    scroller.scrollLeft = startScrollLeft - deltaX;
  };
  const onPointerUp = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    resetGesture(event.pointerId, dragging);
  };
  const onPointerCancel = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    resetGesture(event.pointerId, false);
  };
  const onLostPointerCapture = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    pointerId = null;
    dragging = false;
    scroller.classList.remove("is-dragging");
  };
  const onClick = (event: MouseEvent) => {
    if (!suppressClick) return;
    suppressClick = false;
    window.clearTimeout(suppressClickTimer);
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  const onDragStart = (event: DragEvent) => event.preventDefault();
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target !== scroller || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") {
      scroller.scrollLeft = 0;
      return;
    }
    if (event.key === "End") {
      scroller.scrollLeft = scroller.scrollWidth - scroller.clientWidth;
      return;
    }
    const step = Math.max(280, Math.min(720, scroller.clientWidth * .8));
    scroller.scrollLeft += event.key === "ArrowRight" ? step : -step;
  };

  scroller.addEventListener("pointerdown", onPointerDown);
  scroller.addEventListener("pointermove", onPointerMove, { passive: false });
  scroller.addEventListener("pointerup", onPointerUp);
  scroller.addEventListener("pointercancel", onPointerCancel);
  scroller.addEventListener("lostpointercapture", onLostPointerCapture);
  scroller.addEventListener("click", onClick, true);
  scroller.addEventListener("dragstart", onDragStart);
  scroller.addEventListener("keydown", onKeyDown);

  return () => {
    window.clearTimeout(suppressClickTimer);
    scroller.removeEventListener("pointerdown", onPointerDown);
    scroller.removeEventListener("pointermove", onPointerMove);
    scroller.removeEventListener("pointerup", onPointerUp);
    scroller.removeEventListener("pointercancel", onPointerCancel);
    scroller.removeEventListener("lostpointercapture", onLostPointerCapture);
    scroller.removeEventListener("click", onClick, true);
    scroller.removeEventListener("dragstart", onDragStart);
    scroller.removeEventListener("keydown", onKeyDown);
  };
}

export function isVideoMediaUrl(url: string): boolean {
  return /\.(mp4|webm)(?:$|[?#])/i.test(url);
}

export function playStoreVideo(video: HTMLVideoElement, onBlocked?: () => void): void {
  try {
    const attempt = video.play();
    void attempt?.catch(() => onBlocked?.());
  } catch {
    onBlocked?.();
  }
}
