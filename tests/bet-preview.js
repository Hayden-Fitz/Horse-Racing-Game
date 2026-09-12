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
console.log('Bet previews: fees, returns, live quotes, affordability and book closure passed.');
