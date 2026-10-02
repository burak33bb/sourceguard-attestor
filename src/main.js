import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import {
  CONTRACT_ADDRESS,
  EXPLORER_BASE_URL,
  NETWORK_CHAIN_ID,
  NETWORK_LABEL,
  NETWORK_RPC,
} from "./config.js";
import {
  readableWalletError,
  requestAccountPicker,
  revokeAccountPermission,
  switchToStudionet,
} from "./wallet.js";
import "./styles.css";

window.sourceGuardReady = true;

const readClient = createClient({ chain: studionet });
let writeClient = null;
let walletAddress = "";
let latestReport = "";
let history = loadHistory();

const contractAddress = document.querySelector("#contract-address");
const networkId = document.querySelector("#network-id");
const networkRpc = document.querySelector("#network-rpc");
const walletTitle = document.querySelector("#wallet-title");
const connectButton = document.querySelector("#connect-wallet");
const disconnectButton = document.querySelector("#disconnect-wallet");
const submitButton = document.querySelector("#submit-attestation");
const readButton = document.querySelector("#read-latest");
const txTitle = document.querySelector("#tx-title");
const txOutput = document.querySelector("#tx-output");
const readTitle = document.querySelector("#read-title");
const readOutput = document.querySelector("#read-output");
const verdictCard = document.querySelector("#verdict-card");
const verdictLabel = document.querySelector("#verdict-label");
const confidenceLabel = document.querySelector("#confidence-label");
const reasoningOutput = document.querySelector("#reasoning-output");
const sourceList = document.querySelector("#source-list");
const copyReportButton = document.querySelector("#copy-report");
const historyList = document.querySelector("#history-list");
const clearHistoryButton = document.querySelector("#clear-history");

connectButton.addEventListener("click", connectWallet);
disconnectButton.addEventListener("click", disconnectWallet);
submitButton.addEventListener("click", submitAttestation);
readButton.addEventListener("click", readLatestReport);
copyReportButton.addEventListener("click", copyLatestReport);
clearHistoryButton.addEventListener("click", clearHistory);

initializeUi();

if (window.ethereum) {
  window.ethereum.on?.("accountsChanged", handleAccountsChanged);
  window.ethereum.on?.("chainChanged", handleChainChanged);
  syncExistingWallet();
}

async function connectWallet() {
  try {
    if (!window.ethereum) {
      walletTitle.textContent = "Wallet missing";
      txOutput.textContent = "Install MetaMask or another EIP-1193 wallet.";
      return false;
    }

    txTitle.textContent = "Switching network";
    txOutput.textContent = `Approve ${NETWORK_LABEL} in your wallet.`;
    await switchToStudionet(window.ethereum);

    const changingWallet = Boolean(walletAddress);
    if (changingWallet) {
      txTitle.textContent = "Choose wallet";
      txOutput.textContent = "Approve account reset, then pick the wallet to use.";
      await revokeAccountPermission(window.ethereum);
    }

    await requestAccountPicker(window.ethereum);
    const [address] = await window.ethereum.request({
      method: "eth_requestAccounts",
    });
    setConnectedWallet(address);
    return true;
  } catch (error) {
    setDisconnectedWallet();
    txTitle.textContent = "Wallet blocked";
    txOutput.textContent = readableWalletError(error);
    return false;
  }
}

async function submitAttestation() {
  try {
    if (!isContractConfigured()) return;

    if (!writeClient) {
      const connected = await connectWallet();
      if (!connected) return;
    }

    const claim = document.querySelector("#claim").value.trim();
    const sources = [
      document.querySelector("#source-one").value.trim(),
      document.querySelector("#source-two").value.trim(),
      document.querySelector("#source-three").value.trim(),
    ].filter(Boolean);
    const paddedSources = [sources[0] || "", sources[1] || "", sources[2] || ""];

    if (!claim || sources.length === 0) {
      txTitle.textContent = "Missing input";
      txOutput.textContent = "Add a claim and at least one source URL.";
      return;
    }

    txTitle.textContent = "Wallet signing";
    txOutput.textContent = "Confirm the GenLayer transaction in your wallet.";

    const hash = await writeClient.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: "attest",
      args: [claim, ...paddedSources],
      value: BigInt(0),
    });

    txTitle.textContent = "Submitted";
    txOutput.textContent = JSON.stringify(
      { transactionHash: hash, explorer: `${EXPLORER_BASE_URL}/tx/${hash}` },
      null,
      2,
    );
    addHistory({
      claim,
      sources,
      hash,
      status: "Submitted",
      createdAt: new Date().toISOString(),
    });

    const receipt = await readClient.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.ACCEPTED,
      fullTransaction: false,
    });

    txTitle.textContent = "Accepted";
    txOutput.textContent = JSON.stringify(receipt, formatBigInt, 2);
    updateHistoryStatus(hash, "Accepted");
    await readLatestReport();
  } catch (error) {
    txTitle.textContent = "Action failed";
    txOutput.textContent = error.message;
  }
}

async function readLatestReport() {
  try {
    if (!isContractConfigured()) return;

    readTitle.textContent = "Reading";
    readOutput.textContent = "Calling the deployed Intelligent Contract.";

    const result = await readClient.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_latest_report",
      args: [],
      stateStatus: "accepted",
    });

    const report = normalizeReport(result);
    latestReport = JSON.stringify(report, formatBigInt, 2);
    renderReport(report);
    readOutput.textContent = latestReport;
    copyReportButton.disabled = false;
  } catch (error) {
    readTitle.textContent = "Read failed";
    readOutput.textContent = error.message;
    renderEmptyReport(error.message);
    copyReportButton.disabled = true;
  }
}

async function copyLatestReport() {
  if (!latestReport) return;
  await navigator.clipboard.writeText(latestReport);
  copyReportButton.textContent = "Copied";
  window.setTimeout(() => {
    copyReportButton.textContent = "Copy";
  }, 1200);
}

async function syncExistingWallet() {
  try {
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    if (accounts.length > 0) {
      setConnectedWallet(accounts[0]);
    }
  } catch {
    setDisconnectedWallet();
  }
}

function handleAccountsChanged(accounts) {
  if (accounts.length === 0) {
    disconnectWallet();
    return;
  }
  setConnectedWallet(accounts[0]);
}

function handleChainChanged() {
  if (walletAddress && window.ethereum) {
    switchToStudionet(window.ethereum).catch(() => {
      txTitle.textContent = "Wrong network";
      txOutput.textContent = `Switch back to ${NETWORK_LABEL} in your wallet.`;
    });
  }
}

function setConnectedWallet(address) {
  walletAddress = address;
  writeClient = createClient({
    chain: studionet,
    account: walletAddress,
    provider: window.ethereum,
  });
  walletTitle.textContent = shortAddress(walletAddress);
  connectButton.textContent = "Change wallet";
  disconnectButton.hidden = false;
  txTitle.textContent = "Wallet ready";
  txOutput.textContent = `Connected to ${NETWORK_LABEL}. You can submit an attestation.`;
}

async function disconnectWallet() {
  if (window.ethereum) {
    try {
      await revokeAccountPermission(window.ethereum);
    } catch {
    }
  }
  setDisconnectedWallet();
  txTitle.textContent = "Disconnected";
  txOutput.textContent =
    "Wallet cleared in this app. Use Change wallet to pick another account.";
}

function setDisconnectedWallet() {
  walletAddress = "";
  writeClient = null;
  walletTitle.textContent = "Not connected";
  connectButton.textContent = "Connect wallet";
  disconnectButton.hidden = true;
}

function initializeUi() {
  contractAddress.textContent = CONTRACT_ADDRESS || "Contract deployment pending";
  networkId.textContent = NETWORK_CHAIN_ID;
  networkRpc.textContent = NETWORK_RPC;
  renderHistory();
  if (!CONTRACT_ADDRESS) {
    txTitle.textContent = "Deploy needed";
    txOutput.textContent =
      `Deploy SourceGuard on ${NETWORK_LABEL}, then set the contract address.`;
    readTitle.textContent = "Deploy needed";
    reasoningOutput.textContent =
      "Latest report is unavailable until the contract address is configured.";
  }
}

function isContractConfigured() {
  if (CONTRACT_ADDRESS) return true;
  txTitle.textContent = "Deploy needed";
  txOutput.textContent =
    `No contract address is configured yet. Deploy on ${NETWORK_LABEL} first.`;
  readTitle.textContent = "Deploy needed";
  reasoningOutput.textContent =
    `No contract address is configured for ${NETWORK_LABEL}.`;
  return false;
}

function renderReport(report) {
  const aggregate = report?.aggregate || {};
  const verdict = aggregate.final_verdict || "UNKNOWN";
  verdictCard.className = `output-card verdict-card verdict-${verdict.toLowerCase().replaceAll("_", "-")}`;
  readTitle.textContent = "Contract responded";
  verdictLabel.textContent = verdict;
  confidenceLabel.textContent =
    aggregate.confidence === undefined ? "Confidence -" : `Confidence ${aggregate.confidence}%`;
  reasoningOutput.textContent = aggregate.reasoning || "No reasoning returned.";

  const sources = normalizeSources(
    aggregate.supporting_sources || report?.source_urls || report?.source_results || [],
  );
  sourceList.replaceChildren(
    ...sources.map((source) => {
      const item = document.createElement("div");
      item.className = "source-pill";
      const link = document.createElement("a");
      link.href = source;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = source;
      item.append(link);
      return item;
    }),
  );

  if (report?.claim) {
    addHistory({
      claim: report.claim,
      sources: report.source_urls || [],
      hash: "",
      status: verdict,
      createdAt: report.created_at || new Date().toISOString(),
    });
  }
}

function renderEmptyReport(message) {
  verdictCard.className = "output-card verdict-card";
  verdictLabel.textContent = "No report";
  confidenceLabel.textContent = "Confidence -";
  reasoningOutput.textContent = message || "No report returned.";
  sourceList.replaceChildren();
}

function addHistory(entry) {
  const entryKey = entry.hash || `${entry.claim}:${entry.createdAt}`;
  history = [
    entry,
    ...history.filter((item) => (item.hash || `${item.claim}:${item.createdAt}`) !== entryKey),
  ].slice(0, 8);
  saveHistory();
  renderHistory();
}

function updateHistoryStatus(hash, status) {
  history = history.map((entry) =>
    entry.hash === hash ? { ...entry, status } : entry,
  );
  saveHistory();
  renderHistory();
}

function renderHistory() {
  if (history.length === 0) {
    historyList.innerHTML = '<div class="history-item">No local claims yet.</div>';
    return;
  }
  historyList.replaceChildren(
    ...history.map((entry) => {
      const item = document.createElement("div");
      item.className = "history-item";
      const title = document.createElement("strong");
      title.textContent = entry.claim;
      const meta = document.createElement("span");
      meta.className = "history-meta";
      meta.textContent = `${entry.status || "Saved"} - ${new Date(entry.createdAt).toLocaleString()}`;
      item.append(title, meta);
      if (entry.hash) {
        const link = document.createElement("a");
        link.href = `${EXPLORER_BASE_URL}/tx/${entry.hash}`;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = "Open transaction";
        item.append(link);
      }
      return item;
    }),
  );
}

function clearHistory() {
  history = [];
  saveHistory();
  renderHistory();
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem("sourceguard-history") || "[]");
  } catch {
    return [];
  }
}

function saveHistory() {
  localStorage.setItem("sourceguard-history", JSON.stringify(history));
}

function normalizeReport(result) {
  if (typeof result === "string") {
    try {
      return JSON.parse(result);
    } catch {
      return { aggregate: { final_verdict: "UNKNOWN", reasoning: result } };
    }
  }
  return result || {};
}

function normalizeSources(values) {
  return values
    .map((value) => {
      if (typeof value === "string") return value;
      return value?.source_url || value?.url || "";
    })
    .filter(Boolean);
}

function shortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatBigInt(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}
