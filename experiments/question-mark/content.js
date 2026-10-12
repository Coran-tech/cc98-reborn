(() => {
  "use strict";

  const BUTTON_CLASS = "cc98-question-action";
  const PRIVACY_URL = "https://question.coranqwq.xyz/privacy";
  const SETTINGS_KEY = "cc98ComfortSettings";
  let enabled = false;
  let scheduled = false;
  let currentTopic = "";
  let consentShown = false;
  let consentPromise = null;
  let cancelConsent = null;
  let readGeneration = 0;
  const cache = new Map();

  function topicFromLocation() {
    return location.pathname.match(/\/topic\/(\d+)(?:\/|$)/)?.[1] || "";
  }

  function send(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!response?.ok) {
          reject(new Error(response?.error || "问号服务暂不可用"));
        } else {
          resolve(response);
        }
      });
    });
  }

  function notice(text) {
    document.querySelector(".cc98-question-notice")?.remove();
    const element = document.createElement("div");
    element.className = "cc98-question-notice";
    element.setAttribute("role", "status");
    element.textContent = text;
    document.body.append(element);
    setTimeout(() => element.remove(), 5000);
  }

  function confirmPrivacy() {
    if (consentPromise) return consentPromise;
    consentPromise = new Promise((resolve) => {
      const dialog = document.createElement("dialog");
      dialog.className = "cc98-question-privacy-dialog";
      dialog.setAttribute("aria-labelledby", "cc98-question-privacy-title");

      const title = document.createElement("h2");
      title.id = "cc98-question-privacy-title";
      title.textContent = "启用问号实验";
      const summary = document.createElement("p");
      summary.textContent = "本功能不会上传帖子正文、标题或图片；授权时会向独立 HTTPS 服务发送 OpenID ID Token，授权后浏览帖子会自动发送数字帖号及已加载楼层号以读取计数。";
      const details = document.createElement("p");
      const link = document.createElement("a");
      link.href = PRIVACY_URL;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "阅读完整隐私说明";
      details.append(link, "。点击“同意并继续”表示你已阅读并接受上述数据处理方式。");

      const actions = document.createElement("div");
      actions.className = "cc98-question-privacy-actions";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "取消";
      const accept = document.createElement("button");
      accept.type = "button";
      accept.className = "is-primary";
      accept.textContent = "同意并继续";
      actions.append(cancel, accept);
      dialog.append(title, summary, details, actions);

      const finish = (accepted) => {
        cancelConsent = null;
        dialog.close();
        dialog.remove();
        resolve(accepted);
      };
      cancelConsent = () => finish(false);
      cancel.addEventListener("click", () => finish(false));
      accept.addEventListener("click", () => finish(true));
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        finish(false);
      });
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) finish(false);
      });
      document.body.append(dialog);
      dialog.showModal();
      accept.focus();
    }).finally(() => { consentPromise = null; });
    return consentPromise;
  }

  function render(button, state = {}) {
    const count = state?.count;
    button.querySelector(".cc98-question-count").textContent = Number.isSafeInteger(count) && count >= 0 ? String(count) : "-";
    button.classList.toggle("is-selected", Boolean(state.mine));
    button.setAttribute("aria-pressed", state.mine ? "true" : "false");
    button.title = count === undefined ? "点击后验证 OpenID 并参与问号" : state.mine ? "取消问号" : "给这一楼一个问号";
  }

  function mountedFloors() {
    return [...new Set([...document.querySelectorAll(`#cc98-comfort-app .cc98-rebuild-post[data-post-floor] .${BUTTON_CLASS}`)]
      .map((button) => Number(button.closest("[data-post-floor]")?.dataset.postFloor))
      .filter((floor) => Number.isSafeInteger(floor) && floor > 0))];
  }

  async function refreshFloors(topicId, floors) {
    const generation = ++readGeneration;
    for (let start = 0; start < floors.length; start += 50) {
      if (!enabled) return;
      const batch = floors.slice(start, start + 50);
      const result = await send({ type: "CC98_REBORN_QUESTION_GET", topicId, floors: batch });
      if (!result.privacyRequired && !result.disabled) consentShown = true;
      if (!enabled || generation !== readGeneration || topicId !== topicFromLocation()) {
        return;
      }
      for (const floor of batch) {
        const state = result.authRequired ? undefined : result.items?.[floor];
        const key = `${topicId}:${floor}`;
        if (state) {
          cache.set(key, state);
        } else {
          cache.delete(key);
        }
        document.querySelectorAll(`#cc98-comfort-app [data-post-floor="${floor}"] .${BUTTON_CLASS}`)
          .forEach((button) => render(button, state));
      }
    }
  }

  async function toggle(button, topicId, floor) {
    if (!enabled || button.disabled) {
      return;
    }
    if (!consentShown) {
      const accepted = await confirmPrivacy();
      if (!accepted) {
        return;
      }
      if (!enabled) return;
      try {
        await send({ type: "CC98_REBORN_QUESTION_ACCEPT_PRIVACY", topicId });
        if (!enabled) return;
        consentShown = true;
      } catch (error) {
        notice(error.message);
        return;
      }
    }
    button.disabled = true;
    button.classList.add("is-pending");
    try {
      const result = await send({ type: "CC98_REBORN_QUESTION_TOGGLE", topicId, floor });
      if (!enabled) return;
      cache.set(`${topicId}:${floor}`, result);
      document.querySelectorAll(`#cc98-comfort-app [data-post-floor="${floor}"] .${BUTTON_CLASS}`)
        .forEach((item) => render(item, result));
      await refreshFloors(topicId, mountedFloors());
    } catch (error) {
      notice(error.message);
    } finally {
      button.disabled = false;
      button.classList.remove("is-pending");
    }
  }

  function placeButton(actions, button) {
    const like = actions.querySelector('[data-action-kind="like"]');
    const dislike = actions.querySelector('[data-action-kind="dislike"]');
    if (like && like.nextElementSibling !== button) {
      like.after(button);
    } else if (!like && dislike && button.nextElementSibling !== dislike) {
      actions.insertBefore(button, dislike);
    } else if (!like && !dislike && button.parentElement !== actions) {
      actions.append(button);
    }
  }

  function addButton(card, topicId, floor) {
    const existing = card.querySelector(`.${BUTTON_CLASS}`);
    let footer = card.querySelector(".cc98-rebuild-post-footer");
    if (!footer) {
      footer = document.createElement("div");
      footer.className = "cc98-rebuild-post-footer";
      footer.dataset.questionCreated = "true";
      card.append(footer);
    }
    let actions = footer.querySelector(".cc98-rebuild-post-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "cc98-rebuild-post-actions";
      actions.dataset.questionCreated = "true";
      footer.append(actions);
    }
    if (existing) {
      placeButton(actions, existing);
      return false;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = `${BUTTON_CLASS} cc98-rebuild-mini-action`;
    button.setAttribute("aria-label", `给 ${floor} 楼一个问号`);
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = '<span class="cc98-question-mark" aria-hidden="true">?</span><span class="cc98-question-count">-</span>';
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggle(button, topicId, floor);
    });
    actions.append(button);
    placeButton(actions, button);
    render(button, cache.get(`${topicId}:${floor}`));
    return true;
  }

  async function scan() {
    scheduled = false;
    if (!enabled) return;
    const topicId = topicFromLocation();
    if (!topicId) {
      return;
    }
    if (topicId !== currentTopic) {
      currentTopic = topicId;
      cache.clear();
      readGeneration += 1;
    }
    const newFloors = [];
    document.querySelectorAll("#cc98-comfort-app .cc98-rebuild-post[data-post-floor]").forEach((card) => {
      const floor = Number(card.dataset.postFloor);
      if (!Number.isSafeInteger(floor) || floor < 1) {
        return;
      }
      if (addButton(card, topicId, floor)) {
        newFloors.push(floor);
      }
    });
    if (!newFloors.length) {
      return;
    }
    try {
      await refreshFloors(topicId, mountedFloors());
    } catch {
      document.querySelectorAll(`#cc98-comfort-app .${BUTTON_CLASS}`).forEach((button) => {
        button.title = "问号服务暂不可用";
      });
    }
  }

  function scheduleScan() {
    if (!enabled || scheduled) {
      return;
    }
    scheduled = true;
    setTimeout(scan, 120);
  }

  function setFeatureEnabled(next) {
    if (enabled === next) return;
    enabled = next;
    readGeneration += 1;
    if (enabled) {
      scheduleScan();
      return;
    }
    cancelConsent?.();
    cache.clear();
    document.querySelectorAll(`#cc98-comfort-app .${BUTTON_CLASS}`).forEach((button) => button.remove());
    document.querySelectorAll('#cc98-comfort-app .cc98-rebuild-post-actions[data-question-created="true"]')
      .forEach((actions) => { if (!actions.childElementCount) actions.remove(); });
    document.querySelectorAll('#cc98-comfort-app .cc98-rebuild-post-footer[data-question-created="true"]')
      .forEach((footer) => { if (!footer.childElementCount) footer.remove(); });
    document.querySelector(".cc98-question-notice")?.remove();
  }

  function enabledBySettings(settings) {
    return settings?.enabled !== false && settings?.questionMarkEnabled === true;
  }

  new MutationObserver(scheduleScan).observe(document, { childList: true, subtree: true });
  window.addEventListener("popstate", scheduleScan);
  let changedSinceRead = false;
  chrome.storage.onChanged?.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes?.[SETTINGS_KEY]) return;
    changedSinceRead = true;
    setFeatureEnabled(enabledBySettings(changes[SETTINGS_KEY].newValue));
  });
  chrome.storage.local.get(SETTINGS_KEY, (result) => {
    if (!changedSinceRead) setFeatureEnabled(enabledBySettings(result[SETTINGS_KEY]));
  });
})();
