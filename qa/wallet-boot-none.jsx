/**
 * Headless boot check: the page is opened without any injected wallet, which is
 * what a Huawei user gets in the built-in system browser. Tapping "connect"
 * must explain that no wallet was detected instead of doing nothing.
 */
const results = [];
const record = (name, ok, detail) => results.push({ name, ok, detail });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (read, timeout = 9000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = read();
    if (value) return value;
    await wait(50);
  }
  return null;
};

async function main() {
  delete window.ethereum;
  await import("../src/main.jsx");

  const shellReady = await waitFor(() => document.querySelector(".app-shell.is-ready"), 9000);
  record("app boots and leaves the loading state", Boolean(shellReady), shellReady ? "" : "the app shell never became ready");

  const button = await waitFor(() => document.querySelector(".wallet-button"));
  record("the wallet control renders", Boolean(button), button ? button.textContent.trim() : "no .wallet-button found");

  if (button) {
    button.click();
    const toast = await waitFor(() => {
      const element = document.querySelector(".toast");
      return element?.textContent?.trim() ? element : null;
    }, 9000);
    record(
      "tapping connect without a wallet explains the reason",
      Boolean(toast),
      toast ? toast.textContent.trim().slice(0, 120) : "no toast appeared - the tap looked like a no-op",
    );
    record(
      "the connect control is usable again after the failure",
      button.disabled === false,
      button.disabled ? "the button stayed disabled" : "",
    );
  }
}

main()
  .catch((error) => record("the scenario ran without throwing", false, String(error?.stack ?? error)))
  .finally(() => { document.getElementById("qa-result").textContent = JSON.stringify(results, null, 2); });
