const STRINGS = {
  connected: "connected",
  offline: "not connected to tailscale VPN",
  copy: "Copy",
  copied: "Copied",
  copyFailed: "Copy failed — select the URL manually",
  empty: "No services configured.",
  loadError: "Could not load services.json (open this page over HTTP/HTTPS, not as a file).",
};

const status = document.getElementById("status");
const statusText = document.getElementById("status-text");
const resetTimers = new WeakMap();
let probeUrl = null;

function setStatus(connected) {
  status.classList.toggle("is-online", connected);
  status.classList.toggle("is-offline", !connected);
  statusText.textContent = connected ? STRINGS.connected : STRINGS.offline;
}

// A no-cors fetch resolves for any HTTP response and rejects when the name does
// not resolve — which is exactly what happens without Tailscale's MagicDNS.
async function checkTailscale() {
  if (!probeUrl) {
    setStatus(false);
    return;
  }
  try {
    await fetch(probeUrl, { mode: "no-cors", cache: "no-store" });
    setStatus(true);
  } catch {
    setStatus(false);
  }
}

function card(service) {
  const item = document.createElement("li");
  item.className = "card";

  const link = document.createElement("a");
  link.className = "name";
  link.href = service.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = service.name;

  const url = document.createElement("code");
  url.textContent = service.url;

  const urlRow = document.createElement("div");
  urlRow.className = "url-row";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = STRINGS.copy;
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(service.url);
      button.textContent = STRINGS.copied;
    } catch {
      button.textContent = STRINGS.copyFailed;
    }
    clearTimeout(resetTimers.get(button));
    resetTimers.set(
      button,
      setTimeout(() => {
        button.textContent = STRINGS.copy;
      }, 1500),
    );
  });

  urlRow.append(url, button);
  item.append(link, urlRow);
  return item;
}

function render(root, services) {
  root.replaceChildren();
  if (!Array.isArray(services) || services.length === 0) {
    root.textContent = STRINGS.empty;
    return;
  }

  const list = document.createElement("ul");
  for (const service of services) list.append(card(service));
  root.append(list);
}

async function main() {
  const root = document.getElementById("services");
  try {
    const response = await fetch("services.json", { cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    const services = await response.json();
    render(root, services);
    probeUrl = Array.isArray(services) ? (services[0]?.url ?? null) : null;
  } catch {
    root.textContent = STRINGS.loadError;
  }

  await checkTailscale();
  setInterval(checkTailscale, 15000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkTailscale();
  });
}

main();
