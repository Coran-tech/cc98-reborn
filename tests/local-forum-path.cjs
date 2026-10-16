const fs = require('node:fs');
const path = require('node:path');

// The simulator is a sibling project, not part of the extension checkout.
const root = path.resolve(__dirname, '..');
const candidates = process.env.CC98_LOCAL_FORUM_ROOT ? [path.resolve(process.env.CC98_LOCAL_FORUM_ROOT)] : [
  path.resolve(root, '..', 'cc98-local-forum'),
  path.resolve(root, '..', 'GitHub', 'cc98-local-forum')
];
const forumRoot = candidates.find(dir => fs.existsSync(path.join(dir, 'server.js')));
if (!forumRoot) throw new Error('External cc98-local-forum not found. Set CC98_LOCAL_FORUM_ROOT to its directory.');
module.exports = { forumRoot, serverPath: path.join(forumRoot, 'server.js'), frontendRoot: path.join(forumRoot, 'frontend'),
  environment: { CC98_REBORN_ROOT: root } };
