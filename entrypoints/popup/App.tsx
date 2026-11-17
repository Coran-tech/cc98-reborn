import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Description,
  Input,
  Label,
  Radio,
  RadioGroup,
  Slider,
  Switch
} from "@heroui/react";
import {
  Download,
  ExternalLink,
  Code2,
  Globe,
  Info,
  LogOut,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound
} from "lucide-react";
import {
  BLACKLIST_PAGE_URL,
  bindOpenId,
  clearCc98SiteData,
  exitCurrentAccount,
  exportSettings,
  formatDateTime,
  formatDuration,
  formatUpdateTime,
  getOpenIdState,
  importBackup,
  logoutOpenId,
  openArchives,
  openBlacklistPage,
  openReleases,
  readBackup,
  requestUpdateStatus,
  type BackupPreview
} from "./runtime";
import {
  DEFAULT_SETTINGS,
  displayVersion,
  normalizeSettings,
  PALETTES,
  RELEASES_PAGE_URL,
  ThemeCore
} from "./theme";
import { useSettings } from "./use-settings";

const EMBEDDED = new URLSearchParams(location.search).get("embedded") === "1";
const VERSION = displayVersion();

export default function App() {
  const { settings, update, reset } = useSettings();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<Record<string, any>>({ checking: true });
  const [openId, setOpenId] = useState<Record<string, any>>({ loading: true });
  const [archiveStatus, setArchiveStatus] = useState("");
  const [clearStatus, setClearStatus] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [backupStatus, setBackupStatus] = useState("");
  const [backupPreview, setBackupPreview] = useState<BackupPreview | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);

  const tone = useMemo(() => ThemeCore.resolveTone(settings), [settings]);
  const scheduleError = useMemo(() => {
    const valid = (value: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
    if (!valid(settings.themeDayStart) || !valid(settings.themeNightStart)) {
      return "请填写完整的白昼和黑夜开始时间。";
    }
    return settings.themeDayStart === settings.themeNightStart
      ? "白昼和黑夜的开始时间不能相同。"
      : "";
  }, [settings.themeDayStart, settings.themeNightStart]);
  const colorError = useMemo(() => {
    const invalid = [
      ThemeCore.normalizeColor(settings.themeCustomPrimary) ? "" : "主色",
      ThemeCore.normalizeColor(settings.themeCustomSecondary) ? "" : "副色"
    ].filter(Boolean);
    return invalid.length ? `${invalid.join("、")}请输入 #RGB 或 #RRGGBB 格式的颜色。` : "";
  }, [settings.themeCustomPrimary, settings.themeCustomSecondary]);

  useEffect(() => {
    let cancelled = false;
    requestUpdateStatus(false).then((status) => {
      if (!cancelled) setUpdateStatus(status);
    });
    getOpenIdState().then((state) => {
      if (!cancelled) setOpenId({ ...state, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!EMBEDDED) return;
    const element = root.current;
    if (!element) return;
    let lastHeight = 0;
    let frame = 0;
    const report = () => {
      frame = 0;
      const height = Math.min(
        20000,
        Math.max(320, Math.ceil(element.getBoundingClientRect().height) + 2)
      );
      if (height === lastHeight) return;
      lastHeight = height;
      window.parent.postMessage({ type: "cc98-reborn:settings-size", height }, "*");
    };
    const queue = () => {
      if (frame) return;
      frame = requestAnimationFrame(report);
    };
    const observer = new ResizeObserver(queue);
    observer.observe(element);
    window.addEventListener("load", queue);
    document.fonts?.ready.then(queue);
    queue();
    return () => {
      observer.disconnect();
      window.removeEventListener("load", queue);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!aboutOpen) return;
    const close = (event: MouseEvent) => {
      if (!(event.target as Element)?.closest?.(".about-panel, .about-toggle")) {
        setAboutOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAboutOpen(false);
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", escape);
    };
  }, [aboutOpen]);

  const updateSettings = (patch: Record<string, unknown>, immediate = true) => {
    update(patch, immediate);
  };

  const handleCheckUpdate = async () => {
    setUpdateStatus({ checking: true, currentVersion: VERSION });
    setUpdateStatus(await requestUpdateStatus(true));
  };

  const handleOpenId = async (action: "bind" | "exit" | "logout") => {
    setOpenId((state) => ({ ...state, busy: true, error: "" }));
    const result =
      action === "bind"
        ? await bindOpenId()
        : action === "exit"
          ? await exitCurrentAccount()
          : await logoutOpenId();
    if (action === "exit" && result?.ok) {
      setOpenId({ ok: true, binding: openId.binding, busy: false, exiting: true });
      window.setTimeout(() => window.close(), 450);
      return;
    }
    setOpenId({ ...result, loading: false, busy: false });
  };

  const handleClear = async (confirmed = false) => {
    if (!confirmed && !EMBEDDED) {
      if (
        !window.confirm(
          "这会用于刷新十大；同时会抹掉本地存储的稍后再看、版面置顶与草稿等数据，请谨慎。确定继续吗？"
        )
      ) {
        return;
      }
    }
    if (!confirmed && EMBEDDED) {
      setConfirmClear(true);
      return;
    }
    setConfirmClear(false);
    setClearStatus("正在清除 CC98 Cookie 和站点数据…");
    const result = await clearCc98SiteData();
    if (result?.ok) {
      const tabs =
        Number(result.reloadedTabs) > 0 ? `，已刷新 ${result.reloadedTabs} 个 CC98 标签页` : "";
      setClearStatus(`已清除 CC98 Cookie 和本地站点数据${tabs}。`);
    } else {
      setClearStatus(`清除失败：${result?.error || "unknown-error"}`);
    }
  };

  const handleExport = async () => {
    try {
      setBackupStatus(await exportSettings());
    } catch (error) {
      setBackupStatus(`备份失败：${(error as Error).message}`);
    }
  };

  const handleReadBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      setBackupStatus("正在校验备份文件…");
      setBackupPreview(await readBackup(file));
      setBackupStatus("文件已验证，请确认导入。");
    } catch (error) {
      setBackupPreview(null);
      setBackupStatus(`无法导入：${(error as Error).message}`);
    }
  };

  const handleImport = async () => {
    if (!backupPreview) return;
    try {
      setBackupStatus(await importBackup(backupPreview.data));
      setBackupPreview(null);
    } catch (error) {
      setBackupStatus(`恢复失败：${(error as Error).message}`);
    }
  };

  const openBlacklist = () => {
    if (EMBEDDED) {
      window.parent.postMessage({ type: "cc98-reborn:settings-open-blacklist" }, "*");
      return;
    }
    void openBlacklistPage();
  };

  const blacklistSummary = useMemo(() => {
    const list = (value: unknown) =>
      String(value ?? "")
        .split(/[\n,，;；]+/)
        .map((item) => item.trim())
        .filter(Boolean).length;
    let content = 0;
    try {
      content = JSON.parse(settings.blockedContentRules || "[]").length || 0;
    } catch {
      content = 0;
    }
    return `当前 ${list(settings.blockedUserIds)} 个用户 ID、${list(settings.blockedTitleKeywords)} 条标题规则、${list(settings.blockedBoards)} 个版面规则、${content} 条内容规则。语义屏蔽：${settings.semanticFilterEnabled === true ? "开启" : "关闭"}`;
  }, [settings]);

  const palettes = useMemo(
    () => [
      ...PALETTES.filter((palette) => palette.id !== "custom"),
      {
        id: "custom",
        primary: settings.themeCustomPrimary,
        secondary: settings.themeCustomSecondary
      }
    ],
    [settings.themeCustomPrimary, settings.themeCustomSecondary]
  );

  return (
    <div
      ref={root}
      className={`mx-auto w-full px-3 py-3 ${EMBEDDED ? "" : "min-w-[360px]"}`}
      data-tone={tone}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">CC98 Reborn</h1>
          <p className="text-xs text-muted">
            {EMBEDDED ? "插件设置 · 修改后自动保存" : "舒适阅读设置"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Button
              isIconOnly
              size="sm"
              variant="tertiary"
              aria-label="关于 CC98 Reborn"
              className="about-toggle"
              onPress={() => setAboutOpen((open) => !open)}
            >
              <Info size={15} />
            </Button>
            {aboutOpen ? (
              <div className="about-panel absolute right-0 top-9 z-20 w-64 rounded-xl border border-border bg-surface p-3 shadow-xl">
                <p className="text-xs text-muted">
                  当前版本 <strong className="text-foreground">{VERSION}</strong>
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <img
                    src={chrome.runtime.getURL("images/avatar/avatar.jpg")}
                    alt=""
                    className="size-7 rounded-full"
                  />
                  <strong className="text-sm">Coran</strong>
                </div>
                <div className="mt-2 flex flex-col gap-1 text-xs">
                  <a
                    className="text-accent hover:underline"
                    href="https://www.cc98.org/user/id/795406"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    CC98 主页
                  </a>
                  <a
                    className="text-accent hover:underline"
                    href="https://github.com/Coran-tech"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    GitHub 主页
                  </a>
                  <a
                    className="text-accent hover:underline"
                    href="https://github.com/Coran-tech/cc98-reborn/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Bug 反馈
                  </a>
                </div>
              </div>
            ) : null}
          </div>
          <Switch
            id="enabled"
            size="sm"
            isSelected={settings.enabled}
            onChange={(enabled) => updateSettings({ enabled })}
            aria-label="启用或停用美化"
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </div>
      </header>

      {updateStatus.hasUpdate ? (
        <button
          type="button"
          className="mb-3 flex w-full items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-left text-xs text-accent"
          onClick={() => openReleases(updateStatus.releaseUrl || RELEASES_PAGE_URL)}
        >
          <RefreshCw size={14} />
          发现新版本 {updateStatus.latestVersion ? `v${updateStatus.latestVersion}` : ""}
        </button>
      ) : null}

      <Section title="界面风格">
        <RadioGroup
          name="themeStyle"
          value={settings.themeStyle}
          onChange={(value) => updateSettings({ themeStyle: value })}
          orientation="horizontal"
        >
          <Radio value="modern">
            <Radio.Content>
              <Radio.Control>
                <Radio.Indicator />
              </Radio.Control>
              Reborn
            </Radio.Content>
            <Description>卡片与胶囊界面</Description>
          </Radio>
          <Radio value="ascii">
            <Radio.Content>
              <Radio.Control>
                <Radio.Indicator />
              </Radio.Control>
              ASCII / BBS
            </Radio.Content>
            <Description>复古字符界面（实验性）</Description>
          </Radio>
        </RadioGroup>

        <div className="mt-3 flex flex-col gap-1">
          <SwitchRow
            label="首页只保留十大"
            checked={settings.homeHotOnly}
            onChange={(homeHotOnly) => updateSettings({ homeHotOnly })}
          />
          <SwitchRow
            label="帖子卡片默认展开"
            description="关闭悬浮动画"
            checked={settings.expandTopicCardsByDefault}
            onChange={(expandTopicCardsByDefault) => updateSettings({ expandTopicCardsByDefault })}
          />
          <SwitchRow
            label="左侧效率栏"
            checked={settings.sideTopbar}
            onChange={(sideTopbar) => updateSettings({ sideTopbar })}
          />
        </div>
      </Section>

      <Section title="明暗与配色" subtitle={`当前${tone === "dark" ? "黑夜" : "白昼"}`}>
        <RadioGroup
          name="themeMode"
          value={settings.themeMode}
          onChange={(value) => updateSettings({ themeMode: value })}
          orientation="horizontal"
        >
          {(
            [
              ["light", "白昼"],
              ["dark", "黑夜"],
              ["auto", "自动"]
            ] as const
          ).map(([value, label]) => (
            <Radio key={value} value={value}>
              <Radio.Content>
                <Radio.Control>
                  <Radio.Indicator />
                </Radio.Control>
                {label}
              </Radio.Content>
            </Radio>
          ))}
        </RadioGroup>

        {settings.themeMode === "auto" ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <TimeField
              id="themeDayStart"
              label="白昼开始"
              value={settings.themeDayStart}
              onChange={(themeDayStart) => updateSettings({ themeDayStart })}
            />
            <TimeField
              id="themeNightStart"
              label="黑夜开始"
              value={settings.themeNightStart}
              onChange={(themeNightStart) => updateSettings({ themeNightStart })}
            />
          </div>
        ) : null}
        {settings.themeMode === "auto" && scheduleError ? (
          <p className="mt-1 text-xs text-danger">{scheduleError}</p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="论坛页面配色">
          {palettes.map((palette) => {
            const selected = settings.themePalette === palette.id;
            return (
              <button
                key={palette.id}
                type="button"
                role="radio"
                aria-checked={selected}
                title={
                  palette.id === "custom"
                    ? "自定义配色"
                    : `主色 ${palette.primary}，副色 ${palette.secondary}`
                }
                onClick={() => updateSettings({ themePalette: palette.id })}
                className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs ${
                  selected ? "border-accent bg-accent/10" : "border-border bg-surface"
                }`}
              >
                <span className="flex gap-1">
                  <i className="size-3 rounded-full" style={{ background: palette.primary }} />
                  <i className="size-3 rounded-full" style={{ background: palette.secondary }} />
                </span>
                {palette.id === "custom" ? "自定义" : ""}
              </button>
            );
          })}
        </div>

        {settings.themePalette === "custom" ? (
          <div className="mt-3 flex flex-col gap-2">
            <ColorField
              label="主色"
              value={settings.themeCustomPrimary}
              onChange={(themeCustomPrimary) => updateSettings({ themeCustomPrimary })}
            />
            <ColorField
              label="副色"
              value={settings.themeCustomSecondary}
              onChange={(themeCustomSecondary) => updateSettings({ themeCustomSecondary })}
            />
            {colorError ? <p className="text-xs text-danger">{colorError}</p> : null}
          </div>
        ) : null}
      </Section>

      <Section title="浏览与阅读">
        <div className="flex flex-col gap-1">
          <SwitchRow
            label="帖子侧拉窗"
            description="所有帖子列表中的标题都在右侧打开"
            checked={settings.topicDrawerEnabled}
            onChange={(topicDrawerEnabled) => updateSettings({ topicDrawerEnabled })}
          />
          <SwitchRow
            label="链接在新页面打开"
            checked={settings.openLinksInNewTab}
            onChange={(openLinksInNewTab) => updateSettings({ openLinksInNewTab })}
          />
          <SwitchRow
            label="后台预热第一页"
            description="识别楼主与热评"
            checked={settings.previsitFirstPageForTopicImages}
            onChange={(previsitFirstPageForTopicImages) =>
              updateSettings({ previsitFirstPageForTopicImages })
            }
          />
          <SwitchRow
            label="回复附带 Reborn 尾巴"
            checked={settings.replyRebornTail}
            onChange={(replyRebornTail) => updateSettings({ replyRebornTail })}
          />
        </div>
      </Section>

      <Section title="显示与图片">
        <SliderRow
          label="字号"
          value={settings.fontScale}
          min={90}
          max={120}
          step={1}
          output={`${settings.fontScale}%`}
          onChange={(fontScale) => updateSettings({ fontScale }, false)}
        />
        <SliderRow
          label="表情大小"
          value={settings.emojiScale}
          min={100}
          max={300}
          step={10}
          output={`${settings.emojiScale}%`}
          onChange={(emojiScale) => updateSettings({ emojiScale }, false)}
        />
        <SwitchRow
          label="帖内图片预热"
          checked={settings.prewarmPostImages}
          onChange={(prewarmPostImages) => updateSettings({ prewarmPostImages })}
        />
        <SliderRow
          label="预热时长"
          value={settings.imageLoadDuration}
          min={500}
          max={5000}
          step={100}
          output={formatDuration(settings.imageLoadDuration)}
          disabled={!settings.prewarmPostImages}
          onChange={(imageLoadDuration) => updateSettings({ imageLoadDuration }, false)}
        />
      </Section>

      <Section title="问号">
        <SwitchRow
          id="questionMarkEnabled"
          label="启用问号"
          description="在楼层上向问号服务提问"
          checked={settings.questionMarkEnabled}
          onChange={(questionMarkEnabled) => updateSettings({ questionMarkEnabled })}
        />
        <p className="mt-1 text-xs text-muted">
          <a
            className="text-accent hover:underline"
            href="https://question.coranqwq.xyz/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            隐私说明
          </a>
        </p>
      </Section>

      <Section title="屏蔽规则">
        <p className="text-xs leading-relaxed text-muted">{blacklistSummary}</p>
        <Button
          id="openBlacklist"
          className="mt-2"
          size="sm"
          variant="secondary"
          onPress={openBlacklist}
        >
          <ShieldCheck size={14} />
          管理屏蔽规则
        </Button>
      </Section>

      <Section title="本地帖子存档">
        <Button
          id="openTopicArchives"
          size="sm"
          variant="secondary"
          onPress={async () => {
            setArchiveStatus("");
            try {
              const result = await openArchives();
              if (!result?.ok) throw new Error(result?.error || "本地存档未能打开");
            } catch (error) {
              setArchiveStatus((error as Error).message);
            }
          }}
        >
          查看本地存档
        </Button>
        {archiveStatus ? <p className="mt-1 text-xs text-danger">{archiveStatus}</p> : null}
      </Section>

      <Section title="CC98 OpenID">
        <p className="text-xs text-muted">
          {openId.loading
            ? "正在读取绑定状态…"
            : openId.error
              ? `绑定失败：${openId.error}`
              : openId.binding?.bound
                ? `已绑定 ${openId.binding.userName || "CC98 用户"}`
                : "未绑定"}
        </p>
        {openId.binding?.bound ? (
          <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted">
            <span>UID {openId.binding.userId || "未知"}</span>
            <span>绑定时间 {formatDateTime(openId.binding.boundAt) || "未知"}</span>
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {!openId.binding?.bound ? (
            <Button
              id="openidBind"
              size="sm"
              isPending={openId.busy}
              onPress={() => handleOpenId("bind")}
            >
              <UserRound size={14} />
              绑定 CC98
            </Button>
          ) : (
            <Button
              id="openidLogout"
              size="sm"
              variant="secondary"
              isPending={openId.busy}
              onPress={() => handleOpenId("logout")}
            >
              <LogOut size={14} />
              解除绑定
            </Button>
          )}
          <Button
            id="openidExitAccount"
            size="sm"
            variant="tertiary"
            isDisabled={openId.busy}
            onPress={() => handleOpenId("exit")}
          >
            退出此账号
          </Button>
        </div>
      </Section>

      <Section title="账号与站点数据">
        <p className="text-xs leading-relaxed text-muted">
          用于刷新十大；同时会抹掉本地存储的稍后再看、版面置顶与草稿等数据，请谨慎。
        </p>
        <Button
          id="clearCc98Data"
          className="mt-2"
          size="sm"
          variant="danger-soft"
          onPress={() => handleClear()}
        >
          <Trash2 size={14} />
          清除 CC98 Cookie
        </Button>
        {confirmClear ? (
          <div className="mt-2 rounded-lg border border-danger/30 bg-danger/5 p-2">
            <p className="text-xs">
              这会清除 CC98 Cookie、稍后再看、版面置顶和本地草稿。确定继续吗？
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                id="cancelClearCc98Data"
                size="sm"
                variant="tertiary"
                onPress={() => setConfirmClear(false)}
              >
                取消
              </Button>
              <Button
                id="confirmClearCc98Data"
                size="sm"
                variant="danger"
                onPress={() => handleClear(true)}
              >
                确认清除
              </Button>
            </div>
          </div>
        ) : null}
        {clearStatus ? <p className="mt-1 text-xs text-muted">{clearStatus}</p> : null}
      </Section>

      <Section title="更新检查">
        <p className="text-xs text-muted">
          {updateStatus.checking
            ? "正在检查更新…"
            : updateStatus.hasUpdate
              ? `发现新版本 v${updateStatus.latestVersion}`
              : updateStatus.ok
                ? `已是最新版本${formatUpdateTime(updateStatus.checkedAt) ? `　${formatUpdateTime(updateStatus.checkedAt)}` : ""}`
                : updateStatus.error
                  ? `检查失败：${updateStatus.error}`
                  : "尚未检查更新"}
        </p>
        <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted">
          {VERSION ? <span>当前 v{VERSION}</span> : null}
          {updateStatus.latestVersion ? <span>最新 v{updateStatus.latestVersion}</span> : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            id="updateCheck"
            size="sm"
            variant="secondary"
            isPending={updateStatus.checking}
            onPress={handleCheckUpdate}
          >
            <RefreshCw size={14} />
            立即检查
          </Button>
          {updateStatus.hasUpdate ? (
            <Button
              id="updateOpen"
              size="sm"
              onPress={() => openReleases(updateStatus.releaseUrl || RELEASES_PAGE_URL)}
            >
              <ExternalLink size={14} />
              打开发布页
            </Button>
          ) : null}
        </div>
      </Section>

      <Section title="设置备份">
        <div className="flex flex-wrap gap-2">
          <Button id="backupSettings" size="sm" variant="secondary" onPress={handleExport}>
            <Download size={14} />
            备份设置
          </Button>
          <Button
            id="restoreSettings"
            size="sm"
            variant="tertiary"
            onPress={() => fileInput.current?.click()}
          >
            <Upload size={14} />
            导入备份
          </Button>
          <input
            id="settingsBackupFile"
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              void handleReadBackup(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
        {backupStatus ? <p className="mt-1 text-xs text-muted">{backupStatus}</p> : null}
        {backupPreview ? (
          <div className="mt-2 rounded-lg border border-border p-2">
            <p className="text-xs">将导入 {backupPreview.description}。</p>
            <p className="mt-1 text-xs text-muted">
              将覆盖同名配置，保留其他数据。用户备注与私信置顶按原账号恢复。
            </p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="tertiary" onPress={() => setBackupPreview(null)}>
                取消
              </Button>
              <Button size="sm" onPress={handleImport}>
                确认导入
              </Button>
            </div>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button id="reset" size="sm" variant="ghost" onPress={() => void reset()}>
            <RotateCcw size={14} />
            恢复默认
          </Button>
        </div>
      </Section>

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted">
        <span>
          <Globe size={12} className="mr-1 inline" />
          {EMBEDDED ? "内嵌设置页" : "CC98 Reborn"}
        </span>
        <a
          className="inline-flex items-center gap-1 text-accent hover:underline"
          href="https://github.com/Coran-tech/cc98-reborn"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Code2 size={12} />
          GitHub
        </a>
      </footer>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-3 rounded-xl border border-border bg-surface p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h2>
        {subtitle ? <span className="text-[11px] text-muted">{subtitle}</span> : null}
      </div>
      {children}
    </section>
  );
}

function SwitchRow({
  id,
  label,
  description,
  checked,
  onChange
}: {
  id?: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Switch id={id} isSelected={Boolean(checked)} onChange={onChange} size="sm">
      <Switch.Content>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <div className="flex flex-col">
          <Label className="text-xs">{label}</Label>
          {description ? <Description className="text-[11px]">{description}</Description> : null}
        </div>
      </Switch.Content>
    </Switch>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  output,
  disabled,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  output: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="mb-2">
      <Slider
        minValue={min}
        maxValue={max}
        step={step}
        value={value}
        isDisabled={disabled}
        onChange={(next) => {
          if (typeof next === "number") onChange(next);
        }}
      >
        <div className="flex items-center justify-between">
          <Label className="text-xs">{label}</Label>
          <span className="text-[11px] tabular-nums text-muted">{output}</span>
        </div>
        <Slider.Track>
          <Slider.Fill />
          <Slider.Thumb />
        </Slider.Track>
      </Slider>
    </div>
  );
}

function TimeField({
  id,
  label,
  value,
  onChange
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[11px] text-muted">{label}</Label>
      <Input
        id={id}
        type="time"
        value={value}
        onChange={(event) => {
          if (event.target.value) onChange(event.target.value);
        }}
      />
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const normalized = ThemeCore.normalizeColor(value, "#000000");
  return (
    <div className="flex items-end gap-2">
      <div className="flex flex-col gap-1">
        <Label className="text-[11px] text-muted">{label}</Label>
        <input
          type="color"
          value={normalized}
          aria-label={`选择${label}`}
          className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent p-0"
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      <div className="flex-1">
        <Input
          key={value}
          defaultValue={value}
          spellCheck={false}
          autoComplete="off"
          placeholder="#1f7166"
          aria-label={`${label} HEX`}
          className="font-mono text-xs"
          onBlur={(event) => {
            const next = ThemeCore.normalizeColor(event.target.value);
            if (next) onChange(next);
          }}
        />
      </div>
    </div>
  );
}
