(() => {
  "use strict";
  const generate = document.getElementById("generate");
  const copy = document.getElementById("copy");
  const status = document.getElementById("status");
  const output = document.getElementById("public-key");

  function show(record) {
    const ready = Boolean(record?.publicJwk);
    output.textContent = ready ? JSON.stringify(record.publicJwk) : "";
    generate.disabled = ready;
    copy.disabled = !ready;
    status.textContent = ready ? "本机密钥已就绪。仅需登记上方公钥，切勿清除本扩展的数据。" : "尚未生成密钥。";
  }

  generate.addEventListener("click", async () => {
    generate.disabled = true;
    status.textContent = "正在生成密钥...";
    try {
      show(await questionAdminKeyStore.enroll());
    } catch {
      generate.disabled = false;
      status.textContent = "生成失败，请重试。";
    }
  });
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(output.textContent);
      status.textContent = "已复制公钥。私钥仍留在本机。";
    } catch {
      status.textContent = "复制失败，可手动选择公钥文本。";
    }
  });
  questionAdminKeyStore.load().then(show).catch(() => {
    status.textContent = "无法读取本机密钥存储。";
  });
})();
