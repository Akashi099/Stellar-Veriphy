const NOTIFICATION_DURATION = 5000;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getPageContent") {
    sendResponse({
      content: document.documentElement.innerText,
      title: document.title,
    });
  } else if (request.action === "showNotification") {
    showNotification(request.notification);
  }
});

function showNotification(notification) {
  const notificationDiv = document.createElement("div");
  notificationDiv.id = "stellar-veriphy-notification";
  notificationDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 16px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    max-width: 400px;
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
  `;

  const typeStyles = {
    success: {
      backgroundColor: "#22c55e",
      color: "white",
      icon: "✓",
    },
    error: {
      backgroundColor: "#ef4444",
      color: "white",
      icon: "✕",
    },
    warning: {
      backgroundColor: "#f59e0b",
      color: "white",
      icon: "⚠",
    },
    info: {
      backgroundColor: "#3b82f6",
      color: "white",
      icon: "ℹ",
    },
  };

  const style = typeStyles[notification.type] || typeStyles.info;
  Object.assign(notificationDiv.style, {
    backgroundColor: style.backgroundColor,
    color: style.color,
  });

  const content = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <span style="font-size: 18px; font-weight: bold;">${style.icon}</span>
      <div>
        <div style="font-weight: 600; margin-bottom: 4px;">${notification.type.toUpperCase()}</div>
        <div>${notification.message}</div>
        ${notification.certificate ? `
          <div style="margin-top: 8px; font-size: 12px; opacity: 0.9;">
            Certificate ID: ${notification.certificate.id}
          </div>
        ` : ""}
      </div>
    </div>
  `;

  notificationDiv.innerHTML = content;

  const style_tag = document.createElement("style");
  style_tag.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style_tag);

  document.body.appendChild(notificationDiv);

  setTimeout(() => {
    notificationDiv.style.animation = "slideIn 0.3s ease-out reverse";
    setTimeout(() => {
      notificationDiv.remove();
    }, 300);
  }, NOTIFICATION_DURATION);
}

const style = document.createElement("style");
style.textContent = `
  .stellar-veriphy-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    margin-left: 8px;
  }

  .stellar-veriphy-badge.verified {
    background-color: #dcfce7;
    color: #166534;
  }

  .stellar-veriphy-badge.unverified {
    background-color: #fee2e2;
    color: #991b1b;
  }
`;
document.head.appendChild(style);
