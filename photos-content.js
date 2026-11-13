function getVisibleText(element) {
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || element.getClientRects().length === 0) {
    return "";
  }
  return (element.innerText || element.getAttribute("aria-label") || "").trim();
}

function inspectSelection() {
  const matches = Array.from(document.querySelectorAll("body *"))
    .map(getVisibleText)
    .filter((text) => text.length > 0)
    .flatMap((text) =>
      Array.from(text.matchAll(/\b(\d[\d,]*)\s+(?:photos?\s+|items?\s+)?selected\b/gi), (match) =>
        Number(match[1].replace(/,/g, ""))
      )
    );

  const textCounts = Array.from(new Set(matches));
  if (textCounts.length > 0) {
    const maxCount = Math.max(...textCounts);
    if (Number.isSafeInteger(maxCount) && maxCount >= 1) {
      return { ok: true, count: maxCount };
    }
  }

  const checkedElements = Array.from(
    document.querySelectorAll('[role="checkbox"][aria-checked="true"], [aria-checked="true"]')
  );
  if (checkedElements.length > 0) {
    return { ok: true, count: checkedElements.length };
  }

  return {
    ok: false,
    error: "No selected items detected. Click 'Select All Visible' or choose photos in Google Photos first."
  };
}

function forceClick(element, shiftKey = false) {
  if (!element) return;

  try {
    element.scrollIntoView({ block: "nearest", inline: "nearest" });
  } catch (e) {}

  element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, view: window }));
  element.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true, cancelable: true, view: window }));

  const rect = element.getBoundingClientRect();
  let clickX = rect.left + rect.width / 2;
  let clickY = rect.top + rect.height / 2;

  if (rect.width > 50 && rect.height > 50) {
    clickX = rect.left + 18;
    clickY = rect.top + 18;
  }

  const eventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: clickX,
    clientY: clickY,
    screenX: clickX,
    screenY: clickY,
    shiftKey: shiftKey,
    button: 0,
    buttons: 1
  };

  element.dispatchEvent(new PointerEvent("pointerdown", eventInit));
  element.dispatchEvent(new MouseEvent("mousedown", eventInit));
  if (typeof element.focus === "function") {
    try {
      element.focus();
    } catch (e) {}
  }
  element.dispatchEvent(new PointerEvent("pointerup", eventInit));
  element.dispatchEvent(new MouseEvent("mouseup", eventInit));
  element.dispatchEvent(new MouseEvent("click", eventInit));
}

function findAllPhotoCheckboxes() {
  const elements = Array.from(
    document.querySelectorAll('[role="checkbox"], [aria-label*="Select"], [aria-label*="select"], .ck-select-button')
  );

  return elements.filter((el) => {
    if (el.offsetWidth === 0 && el.offsetHeight === 0 && el.getClientRects().length === 0) {
      return false;
    }

    if (el.getAttribute("aria-checked") === "true") {
      return false;
    }

    const label = (
      el.getAttribute("aria-label") ||
      el.getAttribute("title") ||
      el.innerText ||
      ""
    ).toLowerCase();

    if (
      label.includes("trash") ||
      label.includes("delete") ||
      label.includes("clear") ||
      label.includes("download") ||
      label.includes("share") ||
      label.includes("search") ||
      label.includes("navigation") ||
      label.includes("settings")
    ) {
      return false;
    }

    return true;
  });
}

function findAllPhotoCards() {
  const selectors = [
    'div[role="gridcell"]',
    'a[href*="/photo/"]',
    'a[href*="./photo/"]',
    '[data-item-id]',
    '[aria-label*="Photo -"]',
    '[aria-label*="Video -"]',
    '[aria-label*="Photo –"]',
    '[aria-label*="Video –"]'
  ];
  const candidates = Array.from(document.querySelectorAll(selectors.join(",")));
  return candidates.filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0);
}

function selectAllVisible() {
  let unselected = findAllPhotoCheckboxes();

  if (unselected.length === 0) {
    const cards = findAllPhotoCards();
    for (const card of cards) {
      const chk = card.querySelector('[role="checkbox"], [aria-label*="Select"], [aria-label*="select"]') || card;
      if (chk.getAttribute("aria-checked") !== "true") {
        unselected.push(chk);
      }
    }
  }

  if (unselected.length === 0) {
    const current = inspectSelection();
    return {
      ok: true,
      newlySelected: 0,
      count: current.ok ? current.count : 0
    };
  }

  if (unselected.length === 1) {
    forceClick(unselected[0]);
  } else {
    forceClick(unselected[0]);
    forceClick(unselected[unselected.length - 1], true);

    const remaining = findAllPhotoCheckboxes();
    for (const el of remaining) {
      forceClick(el);
    }
  }

  const current = inspectSelection();
  return {
    ok: true,
    newlySelected: unselected.length,
    count: current.ok ? current.count : unselected.length
  };
}

function deselectAll() {
  const clearButtons = Array.from(document.querySelectorAll('button, [role="button"], [aria-label]')).filter((el) => {
    const label = (el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText || "").toLowerCase();
    return label.includes("clear selection") || label.includes("deselect") || label.includes("unselect") || label === "clear";
  });

  if (clearButtons.length > 0) {
    forceClick(clearButtons[0]);
  } else {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));

    const checked = Array.from(document.querySelectorAll('[role="checkbox"][aria-checked="true"], [aria-checked="true"]'));
    for (const el of checked) {
      forceClick(el);
    }
  }

  return { ok: true };
}

let noNewItemsStepCount = 0;
let lastSeenCount = 0;

function autoSelectStep() {
  const selectResult = selectAllVisible();
  const currentInspect = inspectSelection();
  const currentCount = currentInspect.ok ? currentInspect.count : (selectResult.ok ? selectResult.count : lastSeenCount);

  if (currentCount === lastSeenCount) {
    noNewItemsStepCount++;
  } else {
    noNewItemsStepCount = 0;
    lastSeenCount = currentCount;
  }

  window.scrollBy(0, window.innerHeight * 1.8);
  const mainContainer = document.querySelector("main") || document.querySelector('[role="main"]') || document.querySelector('.photos-main-content');
  if (mainContainer) {
    mainContainer.scrollBy(0, window.innerHeight * 1.8);
  }

  const reachedEnd = noNewItemsStepCount >= 5;
  return {
    ok: true,
    count: currentCount,
    reachedEnd
  };
}

function findTrashButton() {
  const labels = new Set(["trash", "move to trash", "delete"]);
  const candidates = Array.from(document.querySelectorAll("button, [role='button']")).filter((element) => {
    const label = (
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      element.innerText ||
      ""
    ).trim().toLowerCase();
    const style = window.getComputedStyle(element);
    return (
      labels.has(label) &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      element.getClientRects().length > 0 &&
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-disabled") !== "true"
    );
  });
  return candidates;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "inspect-selection") {
    sendResponse(inspectSelection());
    return;
  }
  if (message.type === "select-all-visible") {
    sendResponse(selectAllVisible());
    return;
  }
  if (message.type === "auto-select-step") {
    sendResponse(autoSelectStep());
    return;
  }
  if (message.type === "deselect-all") {
    noNewItemsStepCount = 0;
    lastSeenCount = 0;
    sendResponse(deselectAll());
    return;
  }
  if (message.type === "reset-auto-select-tracker") {
    noNewItemsStepCount = 0;
    lastSeenCount = 0;
    sendResponse({ ok: true });
    return;
  }
  if (message.type === "move-selection-to-trash") {
    const current = inspectSelection();
    if (!current.ok) {
      sendResponse(current);
      return;
    }
    if (current.count !== message.expectedCount) {
      sendResponse({
        ok: false,
        error: "The selection changed after preview. Check it again and confirm the new count."
      });
      return;
    }
    const buttons = findTrashButton();
    if (buttons.length !== 1) {
      sendResponse({
        ok: false,
        error: "Could not find exactly one enabled Google Photos Trash button. No action was taken."
      });
      return;
    }
    buttons[0].click();
    sendResponse({ ok: true });
  }
});
