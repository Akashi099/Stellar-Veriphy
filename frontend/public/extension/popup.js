document.addEventListener("DOMContentLoaded", () => {
  const verifyImageBtn = document.getElementById("verifyImageBtn");
  const verifyPageBtn = document.getElementById("verifyPageBtn");
  const viewCertificateBtn = document.getElementById("viewCertificateBtn");
  const settingsBtn = document.getElementById("settingsBtn");

  verifyImageBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "openImageVerifier" }, (response) => {
      updateStatus("Verification in progress...", "info");
    });
  });

  verifyPageBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "openPageVerifier" }, (response) => {
      updateStatus("Verification in progress...", "info");
    });
  });

  viewCertificateBtn.addEventListener("click", () => {
    chrome.storage.local.get("lastCertificate", (data) => {
      if (data.lastCertificate) {
        chrome.tabs.create({
          url: `https://stellar-veriphy.com/certificate/${data.lastCertificate.id}`,
        });
      } else {
        updateStatus("No certificate found", "warning");
      }
    });
  });

  settingsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  chrome.storage.local.get("lastVerification", (data) => {
    if (data.lastVerification) {
      const verification = data.lastVerification;
      if (verification.status === "verified") {
        updateStatus("✓ Verified", "verified");
      } else if (verification.status === "unverified") {
        updateStatus("⚠ Unverified", "unverified");
      }
    }
  });
});

function updateStatus(text, status) {
  const statusIcon = document.getElementById("statusIcon");
  const statusText = document.getElementById("statusText");

  const statusMap = {
    verified: { icon: "✓", color: "#22c55e" },
    unverified: { icon: "⚠", color: "#fbbf24" },
    info: { icon: "ℹ", color: "#3b82f6" },
    warning: { icon: "!", color: "#fbbf24" },
  };

  const statusConfig = statusMap[status] || statusMap.info;
  statusIcon.textContent = statusConfig.icon;
  statusIcon.style.color = statusConfig.color;
  statusText.textContent = text;
  statusText.className = `status-text ${status}`;
}
