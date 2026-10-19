const API_BASE = "http://localhost:3000/api";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "verify-image",
    title: "Verify Image with Stellar Veriphy",
    contexts: ["image"],
  });

  chrome.contextMenus.create({
    id: "verify-link",
    title: "Verify Link with Stellar Veriphy",
    contexts: ["link"],
  });

  chrome.contextMenus.create({
    id: "verify-page",
    title: "Verify Page Content",
    contexts: ["page"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab.id) return;

  try {
    if (info.menuItemId === "verify-image" && info.srcUrl) {
      await verifyImage(info.srcUrl, tab.id);
    } else if (info.menuItemId === "verify-link" && info.linkUrl) {
      await verifyLink(info.linkUrl, tab.id);
    } else if (info.menuItemId === "verify-page") {
      await verifyPage(tab, tab.id);
    }
  } catch (error) {
    console.error("Verification error:", error);
    notifyTab(tab.id, {
      type: "error",
      message: "Verification failed. Please try again.",
    });
  }
});

async function verifyImage(imageUrl, tabId) {
  notifyTab(tabId, {
    type: "info",
    message: "Verifying image...",
  });

  const response = await fetch(imageUrl);
  const blob = await response.blob();
  const hash = await computeHash(blob);

  const verification = await fetch(`${API_BASE}/verification/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentHash: hash, contentType: "image" }),
  }).then((res) => res.json());

  if (verification.success) {
    const certificateData = verification.data;
    notifyTab(tabId, {
      type: "success",
      message: `Image verified! Certificate ID: ${certificateData.id}`,
      certificate: certificateData,
    });

    updateBadge(tabId, "verified");
  } else {
    notifyTab(tabId, {
      type: "warning",
      message: "Image not found in verification records.",
    });
    updateBadge(tabId, "unverified");
  }
}

async function verifyLink(linkUrl, tabId) {
  notifyTab(tabId, {
    type: "info",
    message: "Verifying link target...",
  });

  try {
    const response = await fetch(linkUrl, { method: "HEAD" });
    const contentHash = await computeHash(response);

    const verification = await fetch(`${API_BASE}/verification/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentHash, contentType: "link" }),
    }).then((res) => res.json());

    if (verification.success) {
      notifyTab(tabId, {
        type: "success",
        message: `Link target verified!`,
        certificate: verification.data,
      });
      updateBadge(tabId, "verified");
    } else {
      notifyTab(tabId, {
        type: "warning",
        message: "Link target not found in verification records.",
      });
      updateBadge(tabId, "unverified");
    }
  } catch (error) {
    notifyTab(tabId, {
      type: "error",
      message: "Unable to verify link target.",
    });
  }
}

async function verifyPage(tab, tabId) {
  notifyTab(tabId, {
    type: "info",
    message: "Verifying page content...",
  });

  chrome.tabs.sendMessage(
    tabId,
    { action: "getPageContent" },
    async (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error:", chrome.runtime.lastError);
        return;
      }

      const hash = await computeHash(new Blob([response.content]));

      const verification = await fetch(`${API_BASE}/verification/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentHash: hash, contentType: "page" }),
      }).then((res) => res.json());

      if (verification.success) {
        notifyTab(tabId, {
          type: "success",
          message: `Page content verified!`,
          certificate: verification.data,
        });
        updateBadge(tabId, "verified");
      } else {
        notifyTab(tabId, {
          type: "warning",
          message: "Page content not found in verification records.",
        });
        updateBadge(tabId, "unverified");
      }
    },
  );
}

async function computeHash(data) {
  let buffer;
  if (data instanceof Blob) {
    buffer = await data.arrayBuffer();
  } else if (data instanceof ArrayBuffer) {
    buffer = data;
  } else {
    buffer = new TextEncoder().encode(String(data)).buffer;
  }

  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function notifyTab(tabId, notification) {
  chrome.tabs.sendMessage(tabId, {
    action: "showNotification",
    notification,
  });
}

function updateBadge(tabId, status) {
  const badgeText = status === "verified" ? "✓" : "✗";
  const badgeColor = status === "verified" ? "#22c55e" : "#ef4444";

  chrome.action.setBadgeText({ text: badgeText, tabId });
  chrome.action.setBadgeBackgroundColor({ color: badgeColor, tabId });
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab.url && !tab.url.startsWith("chrome://")) {
      chrome.action.setBadgeText({ text: "", tabId: activeInfo.tabId });
    }
  });
});
