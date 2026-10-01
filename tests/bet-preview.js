'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Run the actual quote-rendering functions with isolated DOM fields.
const source = fs.readFileSync(path.join(__dirname, '../src/ui.js'), 'utf8');
const begin = source.indexOf('  function normalizedStake(');
const end = source.indexOf('  function placeOnlineBet(', begin);
assert.ok(begin >= 0 && end > begin);
const outputs = { 'bet-quote': {}, 'counter-bet-quote': {} };
const horse = { name: 'Comet', odds: 3, finished: false };
const context = {
  Number, Math,
  S: { selected: 0, horses: [{ userData: { data: horse } }], money: 100 },
  C: { onlineBetFeeRate: 0.08 },
  HD: { horseNumber: () => '02' },
  el: { amount: { value: '10' }, counterAmount: { value: '10' }, bet: {}, counterPlaceBet: {} },
  document: { getElementById: (id) => outputs[id] },
  isBettingOpen: () => true,
};
vm.createContext(context);
vm.runInContext(source.slice(begin, end), context);
const quoteBegin = source.indexOf('  function renderBetQuotes(');
const quoteEnd = source.indexOf('\n  function ', quoteBegin + 10);
assert.ok(quoteBegin >= 0 && quoteEnd > quoteBegin);
vm.runInContext(source.slice(quoteBegin, quoteEnd), context);
const render = () => vm.runInContext('renderBetQuotes()', context);
render();
assert.match(outputs['bet-quote'].textContent, /fee \$1 = \$11 total/);
assert.match(outputs['bet-quote'].textContent, /Return if won: \$40/);
assert.match(outputs['counter-bet-quote'].textContent, /fee \$0 = \$10 total/);
horse.odds = 7;
render();
assert.match(outputs['bet-quote'].textContent, /Return if won: \$80/);
context.S.money = 10;
render();
assert.equal(context.el.bet.disabled, true);
assert.equal(context.el.counterPlaceBet.disabled, false);
context.el.amount.value = 'invalid';
render();
assert.equal(context.el.bet.disabled, true);
assert.doesNotMatch(outputs['bet-quote'].textContent, /NaN/);
context.isBettingOpen = () => false;
render();
assert.equal(context.el.counterPlaceBet.disabled, true);
assert.equal(outputs['counter-bet-quote'].textContent, 'Betting closed.');

// Count only tickets that pass the same validation as a real purchase.
const purchaseBegin = source.indexOf('  function placeOnlineBet(');
const purchaseEnd = source.indexOf('  function buy(', purchaseBegin);
assert.ok(purchaseBegin >= 0 && purchaseEnd > purchaseBegin);
context.S.money = 100;
context.S.bets = [];
context.S.dayStats = { tickets: 0, wagered: 0, fees: 0, returned: 0 };
context.HD.Audio = { cue() {} };
context.addLedger = () => {};
context.announce = () => {};
context.render = () => {};
context.isBettingOpen = () => true;
vm.runInContext(source.slice(purchaseBegin, purchaseEnd), context);
vm.runInContext('submitBet(10, 1, "online")', context);
assert.equal(context.S.money, 89);
assert.equal(context.S.dayStats.tickets, 1);
assert.equal(context.S.dayStats.wagered, 10);
assert.equal(context.S.dayStats.fees, 1);
context.isBettingOpen = () => false;
vm.runInContext('submitBet(10, 1, "online")', context);
assert.equal(context.S.dayStats.tickets, 1, 'Closed-book attempt must not enter day totals');
console.log('Bet previews: fees, returns, live quotes, affordability and book closure passed.');
