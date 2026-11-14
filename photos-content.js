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

function getDuplicatePhotoCards() {
  const cards = findAllPhotoCards().map((element) =>
    element.closest('[role="gridcell"]') ||
    element.closest('a[href*="/photo/"], a[href*="./photo/"]') ||
    element
  );
  return Array.from(new Set(cards));
}

function getCardThumbnail(card) {
  const images = Array.from(card.querySelectorAll("img"))
    .filter((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0)
    .sort((left, right) =>
      right.naturalWidth * right.naturalHeight - left.naturalWidth * left.naturalHeight
    );
  if (images.length > 0) {
    return { image: images[0], source: images[0].currentSrc || images[0].src };
  }

  const elements = [card, ...card.querySelectorAll("*")];
  for (const element of elements) {
    const background = window.getComputedStyle(element).backgroundImage;
    const match = background && background.match(/url\(["']?(.*?)["']?\)/);
    if (match) {
      return { image: null, source: match[1] };
    }
  }
  return null;
}

function createDifferenceHash(image) {
  const canvas = document.createElement("canvas");
  canvas.width = 9;
  canvas.height = 8;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Could not create a canvas to compare photo thumbnails.");
  }

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const cropSize = Math.min(width, height);
  context.drawImage(
    image,
    (width - cropSize) / 2,
    (height - cropSize) / 2,
    cropSize,
    cropSize,
    0,
    0,
    canvas.width,
    canvas.height
  );
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const luminance = (x, y) => {
    const offset = (y * canvas.width + x) * 4;
    return 0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2];
  };
  const bits = [];
  const colors = [];
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (x < 8) {
        const offset = (y * canvas.width + x) * 4;
        colors.push(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
        if (luminance(x, y) > luminance(x + 1, y)) {
          bits.push("1");
        } else {
          bits.push("0");
        }
      }
    }
  }
  return { hash: bits.join(""), colors };
}

function hashDistance(left, right) {
  let distance = 0;
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) {
      distance++;
    }
  }
  return distance;
}

function averageColorDifference(left, right) {
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference += Math.abs(left[index] - right[index]);
  }
  return difference / left.length;
}

function sameThumbnail(left, right) {
  return hashDistance(left.hash, right.hash) <= 2 &&
    averageColorDifference(left.colors, right.colors) <= 12;
}

function loadCorsImage(source) {
  return new Promise((resolve) => {
    const image = new Image();
    const timeout = setTimeout(() => resolve(null), 5000);
    image.crossOrigin = "anonymous";
    image.onload = () => {
      clearTimeout(timeout);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timeout);
      resolve(null);
    };
    image.src = source;
  });
}

async function getThumbnailFingerprint(thumbnail) {
  if (thumbnail.image) {
    try {
      return createDifferenceHash(thumbnail.image);
    } catch (error) {
      if (error.name !== "SecurityError") {
        throw error;
      }
    }
  }

  const image = await loadCorsImage(thumbnail.source);
  if (!image) {
    return null;
  }
  try {
    return createDifferenceHash(image);
  } catch (error) {
    if (error.name === "SecurityError") {
      return null;
    }
    throw error;
  }
}

async function findDuplicatePhotos() {
  if (inspectSelection().ok) {
    return {
      ok: false,
      error: "Deselect the current photos before scanning for duplicates so the retained copy is not included in the Trash selection."
    };
  }

  const cards = getDuplicatePhotoCards();
  const photoFingerprints = [];
  let unreadableCount = 0;
  for (let index = 0; index < cards.length; index += 6) {
    const batch = await Promise.all(cards.slice(index, index + 6).map(async (card) => {
      const thumbnail = getCardThumbnail(card);
      return thumbnail ? getThumbnailFingerprint(thumbnail) : null;
    }));
    batch.forEach((fingerprint, batchIndex) => {
      if (fingerprint) {
        photoFingerprints.push({ card: cards[index + batchIndex], fingerprint });
      } else {
        unreadableCount++;
      }
    });
  }

  if (photoFingerprints.length === 0) {
    return {
      ok: false,
      error: "Could not read any loaded photo thumbnails for visual comparison. Google Photos or the browser may be blocking thumbnail pixel access."
    };
  }

  const duplicateGroups = [];
  for (const item of photoFingerprints) {
    const group = duplicateGroups.find((candidate) =>
      sameThumbnail(candidate[0].fingerprint, item.fingerprint)
    );
    if (group) {
      group.push(item);
    } else {
      duplicateGroups.push([item]);
    }
  }

  const matchedGroups = duplicateGroups.filter((group) => group.length > 1);
  const duplicateCount = matchedGroups.reduce((count, group) => count + group.length - 1, 0);
  let newlySelected = 0;
  for (const group of matchedGroups) {
    for (const item of group.slice(1)) {
      const card = item.card;
      const checkbox = card.querySelector('[role="checkbox"], [aria-label*="Select"], [aria-label*="select"]');
      const target = checkbox || card;
      if (target.getAttribute("aria-checked") === "true") {
        continue;
      }
      forceClick(target);
      newlySelected++;
    }
  }

  return {
    ok: true,
    scannedCount: photoFingerprints.length,
    unreadableCount,
    groupCount: matchedGroups.length,
    duplicateCount,
    newlySelected
  };
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
  if (message.type === "find-duplicate-photos") {
    findDuplicatePhotos()
      .then(sendResponse)
      .catch((error) => sendResponse({
        ok: false,
        error: error.message || "An unexpected error occurred while comparing photo thumbnails."
      }));
    return true;
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
