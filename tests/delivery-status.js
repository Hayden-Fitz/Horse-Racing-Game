"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../src/ui.js"), "utf8");
const start = source.indexOf("  function renderDeliveries() {");
const end = source.indexOf("  function ticketMarkup(", start);
assert(start >= 0 && end > start);
let writes = 0;
let markup = "";
const output = {
  get innerHTML() { return markup; },
  set innerHTML(value) { writes++; markup = value; },
};
const context = {
  S: { deliveries: [] },
  C: { phoneDeliveryDuration: 12, items: { hotdog: { name: "Ballpark Hotdog" } } },
  el: { deliveries: output },
  escapeMarkup: (value) => String(value).replaceAll("&", "&amp;"),
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
const render = () => vm.runInContext("renderDeliveries()", context);
render();
assert.equal(markup, "No active deliveries.");
context.S.deliveries = [{ id: "hotdog", remaining: 12, duration: 12, complete: false }];
render();
assert.match(markup, /Ballpark Hotdog: ORDERED/);
assert.match(markup, /width:0%/);
assert.match(markup, /<em>ORDERED<\/em>/);
context.S.deliveries[0].remaining = 6;
render();
assert.match(markup, /Ballpark Hotdog: ON THE WAY/);
assert.match(markup, /width:50%/);
assert.match(markup, /6s LEFT/);
context.S.deliveries[0].complete = true;
context.S.deliveries[0].remaining = 0;
render();
assert.match(markup, /Ballpark Hotdog: DELIVERED/);
assert.match(markup, /width:100%/);
assert.match(markup, /<em>DELIVERED<\/em>/);
const previousWrites = writes;
render();
assert.equal(writes, previousWrites, "Unchanged status should not rewrite the delivery strip");
console.log("Concessions order status and stable delivery strip passed.");
