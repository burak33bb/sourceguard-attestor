import assert from "node:assert/strict";
import {
  requestAccountPicker,
  revokeAccountPermission,
  STUDIONET,
  switchToStudionet,
} from "../src/wallet.js";

const switchOnlyCalls = [];
await switchToStudionet({
  request: async (payload) => {
    switchOnlyCalls.push(payload);
  },
});

assert.deepEqual(switchOnlyCalls, [
  {
    method: "wallet_switchEthereumChain",
    params: [{ chainId: STUDIONET.chainId }],
  },
]);

const addAfterMissingCalls = [];
await switchToStudionet({
  request: async (payload) => {
    addAfterMissingCalls.push(payload);
    if (payload.method === "wallet_switchEthereumChain") {
      const error = new Error("Unknown chain");
      error.code = 4902;
      throw error;
    }
  },
});

assert.deepEqual(addAfterMissingCalls, [
  {
    method: "wallet_switchEthereumChain",
    params: [{ chainId: STUDIONET.chainId }],
  },
  {
    method: "wallet_addEthereumChain",
    params: [STUDIONET],
  },
]);

const pickerCalls = [];
await requestAccountPicker({
  request: async (payload) => {
    pickerCalls.push(payload);
  },
});

assert.deepEqual(pickerCalls, [
  {
    method: "wallet_requestPermissions",
    params: [{ eth_accounts: {} }],
  },
]);

await requestAccountPicker({
  request: async () => {
    const error = new Error("Unsupported");
    error.code = -32601;
    throw error;
  },
});

const revokeCalls = [];
await revokeAccountPermission({
  request: async (payload) => {
    revokeCalls.push(payload);
  },
});

assert.deepEqual(revokeCalls, [
  {
    method: "wallet_revokePermissions",
    params: [{ eth_accounts: {} }],
  },
]);

await revokeAccountPermission({
  request: async () => {
    const error = new Error("Unsupported");
    error.code = -32004;
    throw error;
  },
});

console.log("wallet switch flow ok");
