import { DEFAULT_SETTINGS, SettingsBackupCore, STORAGE_KEY, ThemeCore } from "./theme";

export const BLACKLIST_ROUTE_HASH = "#cc98-reborn-blacklist";
export const BLACKLIST_PAGE_URL = `https://www.cc98.org/${BLACKLIST_ROUTE_HASH}`;

export function sendRuntimeMessage(message: unknown): Promise<any> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response ?? { ok: false, error: "empty-response" });
      });
    } catch (error) {
      resolve({ ok: false, error: (error as Error)?.message || "send-failed" });
    }
  });
}

export function sendActiveTabMessage(message: unknown): Promise<any> {
  return new Promise((resolve) => {
    try {
      chrome.tabs?.query?.({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        const tabId = tabs?.[0]?.id;
        if (!tabId) {
          resolve({ ok: false, error: "no-active-tab" });
          return;
        }
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response ?? { ok: false, error: "empty-response" });
        });
      });
    } catch (error) {
      resolve({ ok: false, error: (error as Error)?.message || "send-tab-message-failed" });
    }
  });
}

export async function requestUpdateStatus(force = false): Promise<any> {
  const status = await sendRuntimeMessage({
    type: force ? "CC98_REBORN_CHECK_UPDATE" : "CC98_REBORN_GET_UPDATE_STATUS",
    force
  });
  if (!force && (!status?.checkedAt || Date.now() - Number(status.checkedAt) > 30 * 60 * 1000)) {
    return sendRuntimeMessage({ type: "CC98_REBORN_CHECK_UPDATE", force: false });
  }
  return status;
}

export function openReleases(url: string): void {
  void sendRuntimeMessage({ type: "CC98_REBORN_OPEN_RELEASES", url });
}

export async function getOpenIdState(): Promise<any> {
  return sendRuntimeMessage({ type: "CC98_REBORN_OPENID_GET_STATE" });
}

export async function bindOpenId(): Promise<any> {
  const account = await sendRuntimeMessage({ type: "CC98_REBORN_FIND_CURRENT_WEB_ACCOUNT" });
  if (!account?.ok || !account.account) {
    return {
      ok: false,
      error: account?.error || "请先打开已登录的 CC98 页面，再绑定同一账号的 OpenID。"
    };
  }
  if (!account.account.userId) {
    return { ok: false, error: "当前 CC98 页面未能读取到 UID，请刷新页面后再绑定。" };
  }
  return sendRuntimeMessage({
    type: "CC98_REBORN_OPENID_LOGIN",
    expectedAccount: account.account,
    authTransport: account.authTransport || "direct"
  });
}

export async function exitCurrentAccount(): Promise<any> {
  return sendRuntimeMessage({ type: "CC98_REBORN_EXIT_CURRENT_WEB_ACCOUNT" });
}

export async function logoutOpenId(): Promise<any> {
  return sendRuntimeMessage({ type: "CC98_REBORN_OPENID_LOGOUT" });
}

export async function clearCc98SiteData(): Promise<any> {
  return sendRuntimeMessage({ type: "CC98_REBORN_CLEAR_CC98_SITE_DATA" });
}

export async function openArchives(): Promise<any> {
  return sendRuntimeMessage({ type: "CC98_ARCHIVE_OPEN" });
}

export async function openBlacklistPage(): Promise<void> {
  const openUrl = (url: string) => {
    try {
      chrome.tabs?.create?.({ url });
      window.close();
    } catch {
      window.location.href = url;
    }
  };
  const fallback = (activeUrl: string) => {
    try {
      const parsed = new URL(activeUrl);
      const host = parsed.hostname.toLowerCase();
      if (
        host === "www.cc98.org" ||
        host === "cc98.org" ||
        host === "www-cc98-org-s.webvpn.zju.edu.cn"
      ) {
        return `${parsed.origin}/${BLACKLIST_ROUTE_HASH}`;
      }
    } catch {
      // Fall through to the canonical address.
    }
    return BLACKLIST_PAGE_URL;
  };
  try {
    chrome.tabs?.query?.({ active: true, currentWindow: true }, (tabs) => {
      const active = tabs?.[0];
      const tabId = active?.id;
      const url = fallback(active?.url || "");
      if (!Number.isFinite(tabId) || typeof chrome.tabs?.sendMessage !== "function") {
        openUrl(url);
        return;
      }
      try {
        chrome.tabs.sendMessage(
          tabId as number,
          { type: "CC98_REBORN_GET_BLACKLIST_PAGE_HREF" },
          (response) => {
            const error = chrome.runtime.lastError;
            openUrl(!error && response?.ok && response.href ? response.href : url);
          }
        );
      } catch {
        openUrl(url);
      }
    });
  } catch {
    openUrl(BLACKLIST_PAGE_URL);
  }
}

export function formatDuration(ms: number): string {
  return `${(Number(ms) / 1000).toFixed(1)}s`;
}

export function formatDateTime(timestamp: unknown): string {
  const time = Number(timestamp);
  if (!time) return "";
  const date = new Date(time);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatUpdateTime(timestamp: unknown): string {
  const time = Number(timestamp);
  if (!time) return "";
  const date = new Date(time);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export interface BackupPreview {
  data: Record<string, unknown>;
  description: string;
}

function describeBackup(data: Record<string, unknown>): string {
  const count = SettingsBackupCore.summary(data);
  const accounts = count.accounts ? `（${count.accounts} 个账号）` : "";
  return `${count.settings} 项插件设置、${count.notes} 条用户备注、${count.contacts} 位私信置顶、${count.boards} 个版面置顶${accounts}`;
}

export async function exportSettings(): Promise<string> {
  const records = (await chrome.storage.local.get(null)) as Record<string, any>;
  records[STORAGE_KEY] = {
    ...(records[STORAGE_KEY] || {}),
    ...ThemeCore.normalize(records[STORAGE_KEY])
  };
  const text = SettingsBackupCore.create(
    records,
    DEFAULT_SETTINGS,
    chrome.runtime.getManifest().version
  );
  const parsed = SettingsBackupCore.parse(text, DEFAULT_SETTINGS);
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  try {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
    await new Promise<void>((resolve, reject) => {
      chrome.downloads.download(
        { url, filename: `cc98-reborn-settings-${stamp}.json`, saveAs: true },
        (id) => {
          const error = chrome.runtime.lastError;
          error || !Number.isFinite(id)
            ? reject(new Error(error?.message || "备份下载未完成"))
            : resolve();
        }
      );
    });
    return `已导出 ${describeBackup(parsed.data)}。不含登录凭证及 API 密钥。`;
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

export async function readBackup(file: File): Promise<BackupPreview> {
  if (file.size > SettingsBackupCore.MAX_BYTES) throw new Error("备份文件过大");
  const parsed = SettingsBackupCore.parse(await file.text(), DEFAULT_SETTINGS);
  return { data: parsed.data, description: describeBackup(parsed.data) };
}

export async function importBackup(data: Record<string, unknown>): Promise<string> {
  const current = (await chrome.storage.local.get(STORAGE_KEY)) as Record<string, any>;
  const next = { ...data };
  if (next[STORAGE_KEY]) {
    next[STORAGE_KEY] = { ...(current[STORAGE_KEY] || {}), ...(next[STORAGE_KEY] as object) };
  }
  await chrome.storage.local.set(next);
  return `已恢复 ${describeBackup(data)}。`;
}
