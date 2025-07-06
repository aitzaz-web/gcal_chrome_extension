// content.js

let calendarButton = null;

document.addEventListener("mouseup", () => {
  const selectedText = window.getSelection().toString().trim();
  if (!selectedText) {
    removeCalendarButton();
    return;
  }

  const range = window.getSelection().getRangeAt(0);
  const rect = range.getBoundingClientRect();
  showCalendarButton(rect, selectedText);
});

function showCalendarButton(rect, text) {
  removeCalendarButton();

  calendarButton = document.createElement("button");
  calendarButton.innerText = "📅";
  calendarButton.style.position = "fixed";
  calendarButton.style.top = `${rect.bottom + window.scrollY + 5}px`;
  calendarButton.style.left = `${rect.left + window.scrollX}px`;
  calendarButton.style.zIndex = 999999;
  calendarButton.style.padding = "4px 6px";
  calendarButton.style.border = "none";
  calendarButton.style.borderRadius = "6px";
  calendarButton.style.background = "#007bff";
  calendarButton.style.color = "white";
  calendarButton.style.fontSize = "16px";
  calendarButton.style.cursor = "pointer";
  calendarButton.style.boxShadow = "0px 2px 6px rgba(0,0,0,0.2)";

  calendarButton.addEventListener("click", () => {
    chrome.storage.local.set({ selectedText: text }, () => {
      chrome.runtime.sendMessage({ openPopup: true });
    });
  });

  document.body.appendChild(calendarButton);
}

function removeCalendarButton() {
  if (calendarButton) {
    calendarButton.remove();
    calendarButton = null;
  }
}
