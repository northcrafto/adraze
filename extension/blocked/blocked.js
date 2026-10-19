// Stoppsidan: visar adressen som stoppades, gå tillbaka eller släpp igenom sajten
(async () => {
  const url = await chrome.runtime.sendMessage({ typ: "stoppad-url" });
  document.getElementById("url").textContent = url || "okänd adress";
  document.getElementById("tillbaka").addEventListener("click", () => (history.length > 1 ? history.back() : window.close()));
  const fortsatt = document.getElementById("fortsatt");
  if (!url) fortsatt.hidden = true;
  fortsatt.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ typ: "fortsatt", url });
    location.replace(url);
  });
})();
