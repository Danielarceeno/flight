const MONITOR_URL = 'https://danielarceeno.github.io/flight/';

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: MONITOR_URL });
});
