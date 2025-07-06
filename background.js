chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "addToCalendar",
    title: "Add to Google Calendar",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "addToCalendar") {
    chrome.storage.local.set({ selectedText: info.selectionText });
    chrome.action.openPopup(); // Opens the extension popup
  }
});
