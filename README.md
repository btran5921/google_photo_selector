# Google Photos Batch Trash Assistant

A Chrome Manifest V3 extension that helps you select and move photos to Trash in Google Photos with one click.

## Features

- **Select All Visible Photos**: Selects all currently rendered photo cards and date group headers on screen with a single click.
- **Find & Select Duplicate Copies**: Compares loaded photo thumbnails visually, keeps one copy per matching group unselected, and selects the other copies for review.
- **Auto-Select All (Scroll & Select)**: Automatically scrolls down through your Google Photos library while selecting photos as they load.
- **Deselect All**: Clears the selection with one click if you want to start over.
- **Batch Trash Request**: Confirms the selected item count, asks for explicit user acknowledgment, and requests Google Photos to move the batch to Trash.

## Install locally

1. Open `chrome://extensions` in Google Chrome.
2. Turn on **Developer mode** in the top right.
3. Click **Load unpacked** and choose this project folder (`delete_all_google_photo`).
4. Open [Google Photos](https://photos.google.com/) and sign in.
5. Open the extension side panel from the toolbar icon.
6. Click **Find & Select Duplicate Copies** to select matching copies among the currently loaded photos, or use **Select All Visible Photos** / **Auto-Select All (Scroll & Select)**.
7. Review the selected count in step 2, check the acknowledgment box, type the confirmation phrase (e.g. `MOVE 250 TO TRASH`), and click **Move selected batch to Trash**.

## Important limitations

- Uses Google Photos' web page DOM elements to select and move photos.
- Auto-selection depends on browser performance and DOM rendering as you scroll.
- Duplicate matching compares readable thumbnail images, not filenames or capture dates. It only scans loaded photo cards; thumbnails blocked by browser cross-origin protections are skipped. Similar-looking thumbnails can match, so review every selected photo before moving items to Trash.
- Moving photos to Trash removes backed-up items, which may sync across devices. Review Google's [deletion guidance](https://support.google.com/photos/answer/6128858?hl=en).
- This extension moves items to Trash; it never empties Trash or permanently deletes items immediately.

## Permissions

Uses the `sidePanel` permission and is restricted to `https://photos.google.com/*`.
