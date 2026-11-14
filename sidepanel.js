const selectVisibleButton = document.querySelector("#select-visible");
const autoSelectButton = document.querySelector("#auto-select");
const findDuplicatesButton = document.querySelector("#find-duplicates");
const stopAutoSelectButton = document.querySelector("#stop-auto-select");
const deselectAllButton = document.querySelector("#deselect-all");
const inspectButton = document.querySelector("#inspect");
const statusMessage = document.querySelector("#status");
const confirmation = document.querySelector("#confirmation");
const selectionCount = document.querySelector("#selection-count");
const acknowledge = document.querySelector("#acknowledge");
const requiredPhrase = document.querySelector("#required-phrase");
const phraseInput = document.querySelector("#phrase");
const trashButton = document.querySelector("#trash");

let inspectedCount = null;
let isAutoSelecting = false;

function setStatus(message, isError) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", Boolean(isError));
}

function clearConfirmation() {
  inspectedCount = null;
  confirmation.hidden = true;
  acknowledge.checked = false;
  phraseInput.value = "";
  trashButton.disabled = true;
}

function updateConfirmationButton() {
  trashButton.disabled = !(
    inspectedCount !== null &&
    acknowledge.checked &&
    phraseInput.value.trim() === `MOVE ${inspectedCount} TO TRASH`
  );
}

async function sendToPhotos(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    throw new Error("No active browser tab was found. Open Google Photos and try again.");
  }
  if (!tab.url || !tab.url.includes("photos.google.com")) {
    throw new Error("Please open and switch to your Google Photos tab (photos.google.com).");
  }
  return chrome.tabs.sendMessage(tab.id, message);
}

// 1. Select All Visible Photos
selectVisibleButton.addEventListener("click", async () => {
  setStatus("Selecting all visible photos on screen…", false);
  try {
    const result = await sendToPhotos({ type: "select-all-visible" });
    if (!result || !result.ok) {
      throw new Error(result && result.error ? result.error : "Failed to select visible photos.");
    }
    const count = result.count || 0;
    setStatus(`Selected ${count} photo${count === 1 ? "" : "s"} on screen.`, false);
    if (count > 0) {
      await inspectSelectionCount();
    }
  } catch (error) {
    setStatus(error.message || "Could not contact Google Photos tab. Please refresh the page.", true);
  }
});

// 2. Auto-Select All (Scroll & Select)
autoSelectButton.addEventListener("click", async () => {
  isAutoSelecting = true;
  autoSelectButton.hidden = true;
  stopAutoSelectButton.hidden = false;
  selectVisibleButton.disabled = true;
  findDuplicatesButton.disabled = true;
  deselectAllButton.disabled = true;
  inspectButton.disabled = true;
  clearConfirmation();

  setStatus("Auto-selecting photos while scrolling…", false);
  try {
    await sendToPhotos({ type: "reset-auto-select-tracker" });
    runAutoSelectLoop();
  } catch (error) {
    stopAutoSelectionUI();
    setStatus(error.message || "Could not start auto-selection. Ensure Google Photos tab is active.", true);
  }
});

async function runAutoSelectLoop() {
  if (!isAutoSelecting) return;

  try {
    const result = await sendToPhotos({ type: "auto-select-step" });
    if (!result || !result.ok) {
      throw new Error(result && result.error ? result.error : "Auto-selection encountered an error.");
    }

    const currentCount = result.count || 0;
    setStatus(`Auto-selecting photos… ${currentCount} photo${currentCount === 1 ? "" : "s"} selected so far.`, false);

    if (result.reachedEnd) {
      stopAutoSelectionUI();
      setStatus(`Completed auto-selection! Total selected: ${currentCount} photo${currentCount === 1 ? "" : "s"}.`, false);
      if (currentCount > 0) {
        await inspectSelectionCount();
      }
      return;
    }

    if (isAutoSelecting) {
      setTimeout(runAutoSelectLoop, 650);
    }
  } catch (error) {
    stopAutoSelectionUI();
    setStatus(error.message || "Auto-selection stopped. Make sure Google Photos tab is open and active.", true);
  }
}

stopAutoSelectButton.addEventListener("click", () => {
  stopAutoSelectionUI();
  setStatus("Auto-selection paused by user.", false);
  inspectSelectionCount();
});

function stopAutoSelectionUI() {
  isAutoSelecting = false;
  autoSelectButton.hidden = false;
  stopAutoSelectButton.hidden = true;
  selectVisibleButton.disabled = false;
  findDuplicatesButton.disabled = false;
  deselectAllButton.disabled = false;
  inspectButton.disabled = false;
}

findDuplicatesButton.addEventListener("click", async () => {
  findDuplicatesButton.disabled = true;
  clearConfirmation();
  setStatus("Comparing the thumbnails of loaded photos…", false);
  try {
    const result = await sendToPhotos({ type: "find-duplicate-photos" });
    if (!result || !result.ok) {
      throw new Error(result && result.error ? result.error : "Could not scan loaded photos for duplicates.");
    }

    if (result.duplicateCount === 0) {
      setStatus(
        `No matching duplicates found among ${result.scannedCount} comparable loaded photos.` +
          (result.unreadableCount > 0
            ? ` Could not compare ${result.unreadableCount} thumbnail${result.unreadableCount === 1 ? "" : "s"}.`
            : ""),
        false
      );
      return;
    }

    const summary =
      `Found ${result.duplicateCount} duplicate cop${result.duplicateCount === 1 ? "y" : "ies"} ` +
      `in ${result.groupCount} group${result.groupCount === 1 ? "" : "s"}; ` +
      `selected ${result.newlySelected} new item${result.newlySelected === 1 ? "" : "s"}. ` +
      `One copy per group was left unselected.` +
      (result.unreadableCount > 0
        ? ` Could not compare ${result.unreadableCount} thumbnail${result.unreadableCount === 1 ? "" : "s"}.`
        : "");
    await inspectSelectionCount(summary);
  } catch (error) {
    setStatus(error.message || "Could not scan loaded photos for duplicates.", true);
  } finally {
    findDuplicatesButton.disabled = false;
  }
});

// 3. Deselect All
deselectAllButton.addEventListener("click", async () => {
  setStatus("Clearing photo selection…", false);
  clearConfirmation();
  try {
    await sendToPhotos({ type: "deselect-all" });
    setStatus("Deselected all photos.", false);
  } catch (error) {
    setStatus(error.message || "Could not clear selection.", true);
  }
});

// Helper to inspect selection count
async function inspectSelectionCount(reviewMessage) {
  try {
    const result = await sendToPhotos({ type: "inspect-selection" });
    if (!result || !result.ok) {
      throw new Error(result && result.error ? result.error : "Could not inspect Google Photos selection.");
    }
    inspectedCount = result.count;
    selectionCount.textContent = `Google Photos reports ${inspectedCount} selected item${inspectedCount === 1 ? "" : "s"}.`;
    requiredPhrase.textContent = `MOVE ${inspectedCount} TO TRASH`;
    confirmation.hidden = false;
    setStatus(
      reviewMessage || "Review the count and confirm only if it matches the batch you intend to remove.",
      false
    );
  } catch (error) {
    setStatus(error.message || "Could not contact Google Photos. Confirm that its tab is active and reload it.", true);
  }
}

inspectButton.addEventListener("click", async () => {
  clearConfirmation();
  setStatus("Checking the active tab…", false);
  await inspectSelectionCount();
});

acknowledge.addEventListener("change", updateConfirmationButton);
phraseInput.addEventListener("input", updateConfirmationButton);

trashButton.addEventListener("click", async () => {
  if (inspectedCount === null || trashButton.disabled) {
    return;
  }
  const expectedCount = inspectedCount;
  trashButton.disabled = true;
  inspectButton.disabled = true;
  setStatus("Rechecking the selection before requesting the move…", false);
  try {
    const result = await sendToPhotos({
      type: "move-selection-to-trash",
      expectedCount
    });
    clearConfirmation();
    if (!result || !result.ok) {
      throw new Error(result && result.error ? result.error : "Google Photos did not accept the request.");
    }
    setStatus(
      `Requested that Google Photos move ${expectedCount} selected item${expectedCount === 1 ? "" : "s"} to Trash. Check the Photos tab for any further confirmation.`,
      false
    );
  } catch (error) {
    setStatus(error.message || "The request failed. Check the Photos tab before trying again.", true);
    updateConfirmationButton();
  } finally {
    inspectButton.disabled = false;
  }
});
