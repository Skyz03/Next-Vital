import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { getCredsSnapshot, saveCreds, clearCreds, maskKey } from "./byok";

// jsdom is not part of this suite, so stand in a minimal localStorage.
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const KEY = "nextvital_ai_v1";
let storage: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  storage = fakeStorage();
  vi.stubGlobal("window", { localStorage: storage, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

describe("getCredsSnapshot", () => {
  it("returns null when nothing is stored", () => {
    expect(getCredsSnapshot()).toBeNull();
  });

  it("round-trips a hosted provider", () => {
    saveCreds({ provider: "gemini", key: "AIza123", model: "gemini-3.7-flash" });
    expect(getCredsSnapshot()).toMatchObject({ provider: "gemini", key: "AIza123" });
  });

  it("accepts a local runtime with no key at all", () => {
    // The whole point of the local option: no credential to supply.
    saveCreds({ provider: "local", key: "", model: "llama3.2" });
    expect(getCredsSnapshot()).toMatchObject({ provider: "local", key: "", model: "llama3.2" });
  });

  it("keeps a custom local endpoint", () => {
    saveCreds({ provider: "local", key: "", model: "llama3.2", baseUrl: "http://box:1234/v1/chat/completions" });
    expect(getCredsSnapshot()?.baseUrl).toBe("http://box:1234/v1/chat/completions");
  });

  it("rejects a hosted provider stored without a key", () => {
    storage.setItem(KEY, JSON.stringify({ provider: "anthropic", key: "", model: "claude-opus-5" }));
    expect(getCredsSnapshot()).toBeNull();
  });

  it("rejects an entry from an unknown provider", () => {
    storage.setItem(KEY, JSON.stringify({ provider: "gone", key: "k", model: "m" }));
    expect(getCredsSnapshot()).toBeNull();
  });

  it("falls back to the provider default when the model is missing", () => {
    storage.setItem(KEY, JSON.stringify({ provider: "anthropic", key: "k" }));
    expect(getCredsSnapshot()?.model).toBe("claude-opus-5");
  });

  it("survives corrupt JSON", () => {
    storage.setItem(KEY, "{not json");
    expect(getCredsSnapshot()).toBeNull();
  });

  it("returns a referentially stable snapshot", () => {
    // useSyncExternalStore compares by reference and would loop forever if
    // this allocated a fresh object per call.
    saveCreds({ provider: "gemini", key: "AIza123", model: "gemini-3.7-flash" });
    expect(getCredsSnapshot()).toBe(getCredsSnapshot());
  });

  it("clears", () => {
    saveCreds({ provider: "gemini", key: "AIza123", model: "gemini-3.7-flash" });
    clearCreds();
    expect(getCredsSnapshot()).toBeNull();
  });
});

describe("maskKey", () => {
  it("never reveals enough of a key to reuse it", () => {
    expect(maskKey("sk-ant-api03-abcdefghijklmnop")).toBe("sk-ant-…mnop");
  });

  it("fully masks a short value", () => {
    expect(maskKey("short")).toBe("•••••");
  });
});
