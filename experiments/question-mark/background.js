/* Experimental question reaction. Never send a CC98 access token or post body. */
const QUESTION_API_ORIGIN = "https://cc98-question-mark-demo.coran-zju.chatgpt.site";
const QUESTION_SESSION_KEY = "cc98RebornQuestionSession:v1";
const QUESTION_AUTHORIZED_KEY = "cc98RebornQuestionAuthorized:v1";
const QUESTION_PRIVACY_KEY = "cc98RebornQuestionPrivacyAccepted:v1";
const QUESTION_SETTINGS_KEY = "cc98ComfortSettings";
let questionSilentRetryAfter = 0;
let questionSilentAuthPromise = null;

async function questionMaybeUpdateOfficialKeys() {
  if (!await questionFeatureEnabled()) return;
  const owner = await questionAdminKeyStore.load();
  if (!owner?.privateKey || owner.privateKey.extractable !== false) return;
  const metadataResponse = await fetch("https://openid.cc98.org/.well-known/openid-configuration", {
    headers: { Accept: "application/json" }, cache: "no-store"
  });
  if (!metadataResponse.ok) throw new Error("CC98 OpenID metadata unavailable");
  const metadata = await metadataResponse.json();
  if (metadata?.issuer !== "https://openid.cc98.org" || typeof metadata.jwks_uri !== "string") {
    throw new Error("CC98 OpenID metadata invalid");
  }
  const jwksUrl = new URL(metadata.jwks_uri);
  if (jwksUrl.origin !== "https://openid.cc98.org") {
    throw new Error("CC98 OpenID JWKS origin invalid");
  }
  const jwksResponse = await fetch(jwksUrl.href, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!jwksResponse.ok) throw new Error("CC98 OpenID JWKS unavailable");
  const jwks = await jwksResponse.text();
  if (jwks.length > 6000) throw new Error("CC98 OpenID JWKS too large");
  const parsed = JSON.parse(jwks);
  if (!Array.isArray(parsed?.keys) || parsed.keys.length < 1 || parsed.keys.length > 8) {
    throw new Error("CC98 OpenID JWKS invalid");
  }
  const challenge = await questionRequest("/api/auth/challenge", { method: "POST" });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(jwks));
  const hash = [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
  const message = new TextEncoder().encode(
    `cc98-jwks-update-v1\n${challenge.id}\n${challenge.nonce}\n${hash}`);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, owner.privateKey, message);
  return questionRequest("/api/admin/jwks-update", {
    method: "POST", body: { challengeId: challenge.id, jwks, signature: base64UrlFromBytes(new Uint8Array(signature)) }
  });
}

function questionLocationMatchesSender(sender, topicId) {
  if (!sender?.tab?.url || !isCc98WebPageTabUrl(sender.tab.url)) {
    return false;
  }
  try {
    return new URL(sender.tab.url).pathname.match(/\/topic\/(\d+)/)?.[1] === String(topicId);
  } catch {
    return false;
  }
}

function questionNumber(value, max) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 && number <= max ? number : null;
}

async function questionFeatureEnabled() {
  const settings = (await readLocalStorage(QUESTION_SETTINGS_KEY))[QUESTION_SETTINGS_KEY];
  return settings?.enabled !== false && settings?.questionMarkEnabled === true;
}

async function questionRequest(path, { method = "GET", body, sessionToken } = {}) {
  if (!await questionFeatureEnabled()) throw new Error("请先在插件设置中启用问号实验。");
  const response = await fetch(`${QUESTION_API_ORIGIN}${path}`, {
    method,
    headers: {
      "Accept": "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(sessionToken ? { "Authorization": `Bearer ${sessionToken}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(payload.error || `HTTP ${response.status}`));
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function questionStoredSession(binding) {
  const stored = (await readSessionStorage(QUESTION_SESSION_KEY))[QUESTION_SESSION_KEY];
  const bindingEpoch = Number(binding?.boundAt);
  if (!binding?.bound || !Number.isSafeInteger(bindingEpoch)
    || !stored?.token || stored.bindingEpoch !== bindingEpoch || stored.expiresAt <= Date.now()) {
    await removeSessionStorage(QUESTION_SESSION_KEY);
    return null;
  }
  return stored;
}

async function questionPreviouslyAuthorized(binding) {
  const marker = (await readLocalStorage(QUESTION_AUTHORIZED_KEY))[QUESTION_AUTHORIZED_KEY];
  return marker?.bindingEpoch === Number(binding?.boundAt)
    && marker?.userId === String(binding?.userId);
}

async function questionPrivacyAccepted() {
  return (await readLocalStorage(QUESTION_PRIVACY_KEY))[QUESTION_PRIVACY_KEY] === true;
}

async function questionAuthenticate(sender, binding, { interactive = true } = {}) {
  if (isWebVpnPageUrl(sender.tab.url)) {
    throw new Error("问号实验暂只支持 CC98 直连页面；WebVPN 授权尚未接入。");
  }
  const accountResult = await sendTabMessage(sender.tab.id, { type: "CC98_REBORN_GET_CURRENT_WEB_ACCOUNT" });
  const webAccount = accountResult?.account;
  if (!webAccount?.userId || String(webAccount.userId) !== String(binding.userId)) {
    throw new Error("当前网页账号与已绑定 OpenID 不一致，请先重新绑定。");
  }
  const challenge = await questionRequest("/api/auth/challenge", { method: "POST" });
  const authorization = await requestCc98OpenIdBinding({
    authTransport: "direct",
    expectedAccount: webAccount,
    oidcNonce: challenge.nonce,
    interactive,
    resumeMode: "request"
  });
  requireSameCc98UserId(authorization.binding, webAccount);
  const idToken = authorization.tokenPayload?.id_token;
  if (typeof idToken !== "string" || !idToken) {
    throw new Error("CC98 OpenID 未返回 ID Token，无法安全验证问号身份。");
  }
  const result = await questionRequest("/api/auth/session", {
    method: "POST",
    body: { challengeId: challenge.id, idToken }
  });
  const session = {
    token: result.token,
    bindingEpoch: Number(binding.boundAt),
    expiresAt: Number(result.expiresAt)
  };
  if (!session.token || !Number.isFinite(session.expiresAt)) {
    throw new Error("问号服务端未返回有效会话。");
  }
  await writeSessionStorage({ [QUESTION_SESSION_KEY]: session });
  await writeLocalStorage({ [QUESTION_AUTHORIZED_KEY]: {
    bindingEpoch: Number(binding.boundAt),
    userId: String(binding.userId)
  } });
  return session;
}

async function questionRequireCurrentAccount(sender, binding) {
  const result = await sendTabMessage(sender.tab.id, { type: "CC98_REBORN_GET_CURRENT_WEB_ACCOUNT" });
  if (!result?.account?.userId || String(result.account.userId) !== String(binding?.userId)) {
    await removeSessionStorage(QUESTION_SESSION_KEY);
    throw new Error("当前网页账号与已绑定 OpenID 不一致，请先重新绑定。");
  }
}

async function questionHandle(message, sender) {
  if (!await questionFeatureEnabled()) {
    if (message.type === "CC98_REBORN_QUESTION_GET") return { disabled: true, items: {} };
    throw new Error("请先在插件设置中启用问号实验。");
  }
  const topicId = questionNumber(message.topicId, 1_000_000_000);
  if (!topicId || !questionLocationMatchesSender(sender, topicId)) {
    throw new Error("无效的帖子地址。");
  }
  if (!await questionPrivacyAccepted()) {
    if (message.type === "CC98_REBORN_QUESTION_GET") return { privacyRequired: true, items: {} };
    throw new Error("请先阅读并同意问号实验隐私说明。");
  }
  const binding = (await getOpenIdBinding()).binding;
  let session = await questionStoredSession(binding);
  if (message.type === "CC98_REBORN_QUESTION_GET") {
    const floors = [...new Set((Array.isArray(message.floors) ? message.floors : [])
      .map((floor) => questionNumber(floor, 1_000_000))
      .filter(Boolean))].slice(0, 50);
    if (!floors.length) {
      return { ok: true, items: {} };
    }
    if (!binding?.bound) {
      return { authRequired: true, items: {} };
    }
    try {
      await questionRequireCurrentAccount(sender, binding);
    } catch {
      return { authRequired: true, items: {} };
    }
    if (!session && Date.now() >= questionSilentRetryAfter && await questionPreviouslyAuthorized(binding)) {
      questionSilentAuthPromise ??= questionAuthenticate(sender, binding, { interactive: false })
        .finally(() => { questionSilentAuthPromise = null; });
      try {
        session = await questionSilentAuthPromise;
      } catch {
        questionSilentRetryAfter = Date.now() + 60_000;
      }
    }
    if (!session) return { authRequired: true, items: {} };
    try {
      return await questionRequest("/api/questions/batch", {
        method: "POST",
        body: { topicId, floors },
        sessionToken: session.token
      });
    } catch (error) {
      if (error.status !== 401) {
        throw error;
      }
      await removeSessionStorage(QUESTION_SESSION_KEY);
      return { authRequired: true, items: {} };
    }
  }
  const floor = questionNumber(message.floor, 1_000_000);
  if (!floor || !binding?.bound) {
    throw new Error("请先用当前 CC98 账号绑定 OpenID。");
  }
  await questionRequireCurrentAccount(sender, binding);
  if (!session) {
    session = await questionAuthenticate(sender, binding);
  }
  try {
    return await questionRequest("/api/questions/toggle", {
      method: "POST",
      body: { topicId, floor },
      sessionToken: session.token
    });
  } catch (error) {
    if (error.status !== 401) {
      throw error;
    }
    await removeSessionStorage(QUESTION_SESSION_KEY);
    session = await questionAuthenticate(sender, binding);
    return questionRequest("/api/questions/toggle", {
      method: "POST",
      body: { topicId, floor },
      sessionToken: session.token
    });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "CC98_REBORN_QUESTION_ACCEPT_PRIVACY") {
    questionFeatureEnabled().then((enabled) => {
      if (!enabled) {
        sendResponse({ ok: false, error: "请先在插件设置中启用问号实验。" });
        return;
      }
      if (!questionLocationMatchesSender(sender, questionNumber(message.topicId, 1_000_000_000))) {
        sendResponse({ ok: false, error: "无效的帖子地址。" });
        return;
      }
      writeLocalStorage({ [QUESTION_PRIVACY_KEY]: true })
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false, error: "无法保存隐私确认。" }));
    }).catch(() => sendResponse({ ok: false, error: "无法读取问号实验开关。" }));
    return true;
  }
  if (message?.type !== "CC98_REBORN_QUESTION_GET" && message?.type !== "CC98_REBORN_QUESTION_TOGGLE") {
    return false;
  }
  questionHandle(message, sender)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error?.message || "问号服务暂不可用" }));
  return true;
});
