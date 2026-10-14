const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

// Run with the real renderer/storage bridge from ascii-style.test.cjs.
module.exports = async function checkAsciiOverlays({ forum, popup, patch, output }) {
  let checks = 0;
  const measurements = [];
  await forum.evaluate(() => {
    const section = document.createElement('section');
    section.id = 'ascii-motion-index'; section.className = 'cc98-rebuild-home-hot-section';
    const list = document.createElement('div'); list.className = 'cc98-rebuild-list';
    ['up', 'down', 'new'].forEach((movement, index) => list.append(renderTopicCard({
      type: 'topic', title: index === 0 ? '十大变动：较长的标题换行以后也应与版面标签对齐' : '正在变化的校园话题',
      href: `/topic/${300 + index}`, board: '校园生活', boardHref: '/board/81',
      meta: '刚刚', hoverMeta: '时间: 今天 08:20:11 浏览数: 3.2万',
      rank: index + 1, rankMovement: movement, rankDelta: index + 2, rankMovementAnimated: true
    })));
    ['up', 'down', 'new'].forEach((movement, index) => list.append(renderTopicCard({
      type: 'topic', title: '没有附加信息的紧凑行', href: `/topic/${310 + index}`,
      board: '校园生活', boardHref: '/board/81', rank: index + 4,
      rankMovement: movement, rankDelta: 1, rankMovementAnimated: true
    })));
    section.append(list); document.querySelector('#cc98-comfort-app').prepend(section);
    const authored = document.createElement('div');
    authored.id = 'ascii-authored-shape'; authored.className = 'ant-popover-inner';
    authored.style.borderRadius = '11px'; authored.textContent = '用户正文里的原有样式';
    document.querySelector('[data-post-floor="1"] > .cc98-rebuild-post-body').append(authored);
  });
  for (const tone of ['light', 'dark']) {
    await patch({ themeMode: tone });
    for (const width of [1440, 1024, 390]) {
      await forum.setViewportSize({ width, height: 1050 });
      await forum.evaluate(() => scrollTo(0, 0));
      const rows = await forum.locator('#ascii-motion-index .cc98-rebuild-card').evaluateAll(nodes => nodes.map(node => {
        const title = node.querySelector('.cc98-rebuild-card-title').getBoundingClientRect();
        const chip = node.querySelector('.cc98-rebuild-card-top').getBoundingClientRect();
        const motion = node.querySelector('.cc98-rebuild-rank-motion');
        const rect = motion.getBoundingClientRect(), style = getComputedStyle(motion);
        const save = node.querySelector('.cc98-rebuild-read-later-button').getBoundingClientRect();
        const rank = node.querySelector('.cc98-rebuild-rank').getBoundingClientRect();
        const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        return { text: motion.textContent, label: getComputedStyle(motion, '::before').content,
          animation: style.animationName, radius: style.borderRadius,
          saveOverlap: intersects(rect, save), rankOverlap: intersects(rank, save),
          overlap: title.right > rect.left, alignDelta: Math.abs((title.top + title.bottom - chip.top - chip.bottom) / 2),
          withinViewport: rect.right <= innerWidth && rect.left >= 0 };
      }));
      assert.deepEqual(rows.map(row => row.label), ['"[+2]"', '"[-3]"', '"[NEW]"', '"[+1]"', '"[-1]"', '"[NEW]"']);
      assert(rows.every(row => row.animation === 'none' && row.radius === '0px' && !row.overlap && !row.saveOverlap && !row.rankOverlap && row.alignDelta < 1 && row.withinViewport), JSON.stringify(rows));
      measurements.push({ tone, width, rows });
      await forum.locator('#ascii-motion-index').screenshot({ path: path.join(output, `ascii-rank-${tone}-${width}.png`) });
      checks++;
    }
  }
  assert.equal(await forum.locator('#ascii-authored-shape').getAttribute('data-cc98-ascii-surface'), null);
  assert.equal(await forum.locator('#ascii-authored-shape').evaluate(node => getComputedStyle(node).borderRadius), '11px');
  checks++;

  await forum.setViewportSize({ width: 1440, height: 1050 });
  await forum.locator('#ascii-motion-index').evaluate(node => node.remove());
  const first = forum.locator('#cc98-comfort-app [data-post-floor="1"]');
  await first.locator('.cc98-rebuild-avatar-link').first().hover();
  const author = first.locator('.cc98-rebuild-post-author-card');
  await author.waitFor({ state: 'visible' });
  await author.locator('.cc98-ascii-decoration').waitFor({ state: 'attached' });
  assert.equal(await author.evaluate(node => getComputedStyle(node).transform), 'none');
  assert.equal(await author.evaluate(node => getComputedStyle(node).borderRadius), '0px');
  await forum.screenshot({ path: path.join(output, 'ascii-author-popup.png') });
  // Its native follow action remains connected, even inside the decorated card.
  const oldFollows = await forum.evaluate(() => __nativeFollows);
  await author.locator('.cc98-rebuild-post-author-action.is-follow').click();
  await forum.waitForFunction(old => __nativeFollows === old + 1, oldFollows);
  // Following intentionally schedules a native-state refresh after 850 ms.
  // Finish that action before measuring identity across style-only updates.
  await forum.waitForTimeout(1100);
  checks++;

  await forum.evaluate(() => scrollTo(0, 0));
  const typeButton = forum.locator('.cc98-rebuild-search-type').first();
  await typeButton.click();
  const menu = forum.locator('.cc98-rebuild-search-type-menu').first();
  await menu.waitFor({ state: 'visible' });
  const option = menu.locator('button').last();
  const type = await option.textContent();
  await option.click();
  assert.equal(await typeButton.textContent(), type);
  assert.equal(await typeButton.getAttribute('aria-expanded'), 'false');
  checks++;

  // Actual image viewer: the style must not erase positioning/zoom transforms.
  await forum.evaluate(() => {
    const picture = document.createElement('img'); picture.src = '/fixture/second-picture.png';
    picture.id = 'ascii-extra-picture'; picture.alt = '另一张图片';
    picture.className = 'cc98-rebuild-content-image';
    document.querySelector('[data-post-floor="1"] > .cc98-rebuild-post-body').append(picture);
  });
  await first.locator('img[alt="一张正常的图片"]').click();
  const viewer = forum.locator('#cc98-comfort-image-viewer');
  await viewer.locator('[data-cc98-ascii-control="[X]"]').waitFor();
  const picture = viewer.locator('.cc98-image-viewer-stage img');
  await picture.evaluate(node => node.decode());
  const transform = await picture.evaluate(node => getComputedStyle(node).transform);
  await viewer.dispatchEvent('wheel', { deltaY: -100, clientX: 700, clientY: 450 });
  assert.notEqual(await picture.evaluate(node => getComputedStyle(node).transform), transform, 'zoom remains functional');
  const before = await viewer.locator('.cc98-image-viewer-counter').textContent();
  await viewer.locator('.cc98-image-viewer-next').click();
  assert.notEqual(await viewer.locator('.cc98-image-viewer-counter').textContent(), before);
  await forum.screenshot({ path: path.join(output, 'ascii-image-viewer.png') });
  await viewer.locator('.cc98-image-viewer-close').click();
  await viewer.waitFor({ state: 'detached' });
  await first.locator('img[alt="一张正常的图片"]').click();
  await viewer.waitFor(); await forum.keyboard.press('Escape');
  await viewer.waitFor({ state: 'detached' });
  checks++;

  await forum.evaluate(() => showRebuiltTransientToast(null, '同步完成'));
  await forum.locator('.cc98-rebuild-toast [data-cc98-ascii-control]').click();
  await forum.locator('.cc98-rebuild-toast').waitFor({ state: 'detached' });
  checks++;

  // Body-mounted native UI keeps the original nodes, selection and listeners.
  await forum.evaluate(() => {
    const portal = document.createElement('section'); portal.id = 'ascii-native-dialog';
    portal.className = 'ant-modal-content'; portal.setAttribute('role', 'dialog');
    portal.style.cssText = 'position:fixed;z-index:2147483647;top:100px;left:50%;transform:translateX(-50%);width:min(480px,calc(100vw - 32px));padding:20px;border-radius:16px;background:white';
    portal.innerHTML = '<header class="ant-modal-header" style="border-radius:12px">评分</header><div class="ant-modal-body"><fieldset style="border-radius:9px"><legend>风评</legend><input aria-label="分数" value="+4" style="border-radius:8px"><button class="ant-btn">确认评分</button></fieldset></div><button class="ant-modal-close" aria-label="关闭"><span class="ant-modal-close-x"><i>×</i></span></button>';
    window.__asciiNativeClicks = 0;
    portal.querySelector('.ant-btn').onclick = () => ++__asciiNativeClicks;
    portal.querySelector('.ant-modal-close').onclick = () => portal.remove();
    document.body.append(portal); window.__asciiNativeInput = portal.querySelector('input');
  });
  const native = forum.locator('#ascii-native-dialog');
  await native.locator('[data-cc98-ascii-control]').waitFor();
  await native.locator('input').fill('+12');
  await native.locator('input').evaluate(node => { node.focus(); node.setSelectionRange(1, 3); });
  assert.notEqual(await native.evaluate(node => getComputedStyle(node).transform), 'none');
  await native.locator('.ant-btn').click();
  assert.equal(await forum.evaluate(() => __asciiNativeClicks), 1);
  const rounded = await forum.evaluate(() => [...document.querySelectorAll('#cc98-comfort-app *, [data-cc98-ascii-surface], [data-cc98-ascii-surface] *')]
    .filter(node => !node.closest('.cc98-rebuild-post-body, .cc98-rebuild-signature, .cc98-rebuild-conversation-body, [contenteditable], .ubb-preview, .mde-preview-content, .cc98-rebuild-dual-ubb-visual-pane'))
    .filter(node => node.getClientRects().length && getComputedStyle(node).borderRadius !== '0px')
    .map(node => `${node.className}: ${getComputedStyle(node).borderRadius}`));
  assert.deepEqual(rounded, [], 'no rounded UI boxes, including nested native controls');
  await forum.screenshot({ path: path.join(output, 'ascii-native-dialog-dark.png') });
  await patch({ themeMode: 'light' });
  await forum.screenshot({ path: path.join(output, 'ascii-native-dialog-light.png') });
  checks++;

  await popup.locator('#aboutToggle').click();
  const about = popup.locator('#aboutPopover');
  await about.waitFor();
  assert.equal(await about.evaluate(node => getComputedStyle(node).borderRadius), '0px');
  assert.equal(await popup.locator('#aboutToggle').evaluate(node => getComputedStyle(node, '::before').content), '"[i]"');
  assert(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await popup.screenshot({ path: path.join(output, 'ascii-settings-about.png') });
  checks++;

  await forum.evaluate(() => { __stylePost = document.querySelector('#cc98-comfort-app [data-post-floor="1"]'); });
  await patch({ themeStyle: 'modern' });
  await forum.waitForFunction(() => !document.querySelector('[data-cc98-ascii-surface], [data-cc98-ascii-control]'));
  assert.equal(await native.evaluate(node => getComputedStyle(node).borderRadius), '16px');
  assert(await native.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return node.style.transform === 'translateX(-50%)' && Math.abs((rect.left + rect.right) / 2 - innerWidth / 2) < 1;
  }), 'the native positioning transform must still center the dialog');
  assert(await forum.evaluate(() => __asciiNativeInput === document.querySelector('#ascii-native-dialog input')));
  assert(await forum.evaluate(() => __stylePost === document.querySelector('#cc98-comfort-app [data-post-floor="1"]')));
  assert.equal(await native.locator('input').inputValue(), '+12');
  await native.locator('.ant-btn').click();
  assert.equal(await forum.evaluate(() => __asciiNativeClicks), 2);
  assert.equal(await about.evaluate(node => getComputedStyle(node).borderRadius), '8px');
  await popup.locator('#aboutToggle').click();
  await native.locator('.ant-modal-close').click();
  await native.waitFor({ state: 'detached' });
  await patch({ themeStyle: 'ascii', themeMode: 'dark' });
  await forum.locator('[data-post-floor="1"] .cc98-ascii-decoration').first().waitFor({ state: 'attached' });
  await forum.evaluate(() => { document.querySelector('#ascii-authored-shape')?.remove(); document.querySelector('#ascii-extra-picture')?.remove(); });
  checks++;
  await fs.writeFile(path.join(output, 'overlay-measurements.json'), JSON.stringify({ checks, measurements }, null, 2));
  console.log(`ASCII floating UI: ${checks} groups passed (rank changes, square nested frames, author actions, menus, image zoom/navigation/close, toast, native dialog state, settings and style restoration)`);
};
