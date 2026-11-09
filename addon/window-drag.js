export function enableWindowDrag(windows, windowId, showStatus) {
  const root = document.documentElement;
  let drag;

  function stop(gesture) {
    drag = undefined;
    root.removeAttribute("data-window-dragging");
    if (gesture.surface.hasPointerCapture(gesture.id)) {
      gesture.surface.releasePointerCapture(gesture.id);
    }
  }

  async function moveWindow(gesture) {
    gesture.moving = true;
    try {
      if (!gesture.origin) {
        const origin = await windows.get(windowId);
        if (drag !== gesture) return;
        if (origin.state !== "normal") {
          stop(gesture);
          showStatus("Restore the Firefox window to move it from the sidebar.");
          return;
        }
        gesture.origin = origin;
      }

      // Send one update at a time and use the latest position after each update.
      while (drag === gesture && gesture.next) {
        const { x, y } = gesture.next;
        gesture.next = undefined;
        await windows.update(windowId, {
          left: Math.round(gesture.origin.left + x),
          top: Math.round(gesture.origin.top + y),
        });
      }
    } catch {
      if (drag === gesture) {
        stop(gesture);
        showStatus("Firefox could not move this window.");
      }
    } finally {
      gesture.moving = false;
      if (drag === gesture && gesture.released) stop(gesture);
    }
  }

  document.addEventListener("pointerdown", event => {
    if (drag || event.button !== 0 || event.pointerType !== "mouse" || !event.isPrimary) return;
    const surface = event.target.closest("[data-window-drag]");
    if (!surface || event.target.closest("button")) return;
    surface.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, surface, x: event.screenX, y: event.screenY };
  });

  document.addEventListener("pointermove", event => {
    if (!drag || drag.id !== event.pointerId || drag.released) return;
    const x = event.screenX - drag.x;
    const y = event.screenY - drag.y;
    if (!drag.started) {
      if (Math.hypot(x, y) < 4) return;
      drag.started = true;
      root.setAttribute("data-window-dragging", "");
      showStatus();
    }
    drag.next = { x, y };
    if (!drag.moving) void moveWindow(drag);
  });

  document.addEventListener("pointerup", event => {
    if (!drag || drag.id !== event.pointerId) return;
    drag.released = true;
    root.removeAttribute("data-window-dragging");
    if (!drag.moving) stop(drag);
  });

  function cancel(event) {
    if (drag?.id === event.pointerId && !drag.released) stop(drag);
  }
  document.addEventListener("pointercancel", cancel);
  document.addEventListener("lostpointercapture", cancel);
}
