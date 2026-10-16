importScripts("content-filter-core.js");
let previous = "", compiled = [];
onmessage = event => {
  const { id, rules, text, metrics } = event.data;
  try {
    const signature = JSON.stringify(rules);
    if (signature !== previous) { compiled = rules.map(CC98RebornContentFilterCore.compile); previous = signature; }
    const index = compiled.findIndex(rule => CC98RebornContentFilterCore.evaluate(rule, text, true, metrics) === true);
    postMessage({ id, index });
  } catch (error) { postMessage({ id, index: -1, error: error.message }); }
};
