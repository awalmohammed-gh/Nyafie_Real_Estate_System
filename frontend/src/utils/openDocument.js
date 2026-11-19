/**
 * Opens a private document in a new tab. The tab is opened straight away (inside the click, so
 * popup blockers allow it), then sent to the short-lived link once the server has created it.
 * `getUrl` returns a promise of the link. Throws (and closes the tab) if the link can't be created.
 */
export const openDocument = async (getUrl) => {
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null; // the document page can't reach back into the app
  try {
    const url = await getUrl();
    if (tab) tab.location.href = url;
    else window.location.assign(url); // popups blocked entirely: open it here
  } catch (error) {
    tab?.close();
    throw error;
  }
};

// Reads a chosen file as a data URI for upload
export const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("This file couldn't be read. Please choose it again."));
    reader.readAsDataURL(file);
  });
