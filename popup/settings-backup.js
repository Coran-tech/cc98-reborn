(() => {
  "use strict";
  const core = globalThis.CC98RebornSettingsBackupCore;
  const backup = document.getElementById("backupSettings"), restore = document.getElementById("restoreSettings");
  const fileInput = document.getElementById("settingsBackupFile"), status = document.getElementById("settingsBackupStatus");
  const preview = document.getElementById("settingsBackupPreview"), summary = document.getElementById("settingsBackupSummary");
  const confirm = document.getElementById("confirmRestoreSettings"), cancel = document.getElementById("cancelRestoreSettings");
  let pending = null, busy = false;
  function storage(method, argument) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (value, error) => { if (settled) return; settled = true; error ? reject(new Error(error.message || String(error))) : resolve(value); };
      try {
        const result = chrome.storage.local[method](argument, value => finish(value, chrome.runtime.lastError));
        result?.then?.(value => finish(value), error => finish(undefined, error));
      } catch (error) { finish(undefined, error); }
    });
  }
  function message(text, error = false) { status.textContent = text; status.dataset.state = error ? "error" : "success"; }
  function setBusy(value) { busy = value; document.querySelector(".popup").inert = value; for (const button of [backup, restore, confirm, cancel, fields.reset]) button.disabled = value; }
  function describe(data) {
    const count = core.summary(data);
    return `${count.settings} 项插件设置、${count.notes} 条用户备注、${count.contacts} 位私信置顶、${count.boards} 个版面置顶${count.accounts ? `（${count.accounts} 个账号）` : ""}`;
  }
  async function exportBackup() {
    if (busy) return;
    setBusy(true);
    let url = "";
    try {
      const records = await storage("get", null);
      // Include current edits even when the popup's debounced save is pending.
      records[STORAGE_KEY] = { ...(records[STORAGE_KEY] || {}), ...ThemeCore.normalize(records[STORAGE_KEY]), ...(savingSettingsPatch || {}), ...pendingSettingsPatch };
      const text = core.create(records, DEFAULT_SETTINGS, chrome.runtime.getManifest().version);
      const data = core.parse(text, DEFAULT_SETTINGS).data;
      url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
      await new Promise((resolve, reject) => {
        chrome.downloads.download({ url, filename: `cc98-reborn-settings-${stamp}.json`, saveAs: true }, id => {
          const error = chrome.runtime.lastError;
          error || !Number.isFinite(id) ? reject(new Error(error?.message || "备份下载未完成")) : resolve(id);
        });
      });
      message(`已导出 ${describe(data)}。不含登录凭证及 API 密钥。`);
    } catch (error) { message(`备份失败：${error.message}`, true); }
    finally { if (url) window.setTimeout(() => URL.revokeObjectURL(url), 60000); setBusy(false); }
  }
  async function readBackup() {
    const file = fileInput.files?.[0]; fileInput.value = "";
    if (!file || busy) return;
    pending = null; preview.hidden = true; setBusy(true);
    try {
      if (file.size > core.MAX_BYTES) throw new Error("备份文件过大");
      pending = core.parse(await file.text(), DEFAULT_SETTINGS);
      summary.textContent = `将导入 ${describe(pending.data)}。`;
      preview.hidden = false; message("文件已验证，请确认导入。");
    } catch (error) { message(`无法导入：${error.message}`, true); }
    finally { setBusy(false); }
  }
  async function importBackup() {
    if (busy || !pending) return;
    setBusy(true);
    const previousPending = { ...pendingSettingsPatch };
    try {
      window.clearTimeout(settingsSaveTimer); settingsSaveTimer = null; pendingSettingsPatch = {};
      // Finish any previous settings write before applying this snapshot.
      const deadline = Date.now() + 5000;
      while (savingSettingsPatch) {
        if (Date.now() >= deadline) throw new Error("设置仍在保存，请稍后重试");
        await new Promise(resolve => window.setTimeout(resolve, 20));
      }
      const current = await storage("get", STORAGE_KEY);
      const data = { ...pending.data };
      if (data[STORAGE_KEY]) data[STORAGE_KEY] = { ...(current[STORAGE_KEY] || {}), ...data[STORAGE_KEY] };
      await storage("set", data);
      scheduleDraft = null; themeColorDraft = {}; pendingSettingsPatch = {};
      if (data[STORAGE_KEY]) hydrate(data[STORAGE_KEY]);
      message(`已恢复 ${describe(pending.data)}。`);
      pending = null; preview.hidden = true;
    } catch (error) { pendingSettingsPatch = { ...previousPending, ...pendingSettingsPatch }; message(`恢复失败：${error.message}`, true); }
    finally { setBusy(false); }
  }
  backup.addEventListener("click", exportBackup);
  restore.addEventListener("click", () => { if (!busy) fileInput.click(); });
  fileInput.addEventListener("change", readBackup);
  confirm.addEventListener("click", importBackup);
  cancel.addEventListener("click", () => { pending = null; preview.hidden = true; message("已取消导入。"); restore.focus(); });
})();
