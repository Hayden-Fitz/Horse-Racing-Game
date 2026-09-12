"use strict";

// Shared purchase/delivery rules; UI panels only present their results.
HD.Concessions = (() => {
  const PHONE_CATALOG = new Set([
    'hotdog',
    'soda',
    'horseshoe',
    'carrot',
    'waterBottle',
    'beachBall',
  ]);

  function quote(id, source = "phone") {
    const item = Object.hasOwn(HD.CONFIG.items, id) && HD.CONFIG.items[id];
    if (!item || !["phone", "vendor"].includes(source)) {
      return { error: "That item is unavailable." };
    }
    if (source === "phone" && item.vendorOnly) {
      return { error: "This item is only sold at the stands." };
    }
    if (source === 'phone' && !PHONE_CATALOG.has(id)) {
      return {
        error: 'Concessions delivery only carries food, drinks, foam horseshoes, and beach balls.',
      };
    }
    const price = source === "vendor"
      ? Math.ceil(item.price * (1 - HD.CONFIG.vendorDiscount))
      : item.price;
    if (!Number.isFinite(price) || price < 0) {
      return { error: "That item is unavailable." };
    }
    return { item, price };
  }

  function purchase(id, source = "phone") {
    const result = quote(id, source);
    const state = HD.state;
    if (result.error) return result;
    if (source === "vendor" && !state.vendorOpen) {
      return { error: "Visit a concession stand for instant pickup." };
    }
    if (!Number.isFinite(state.money) || state.money < result.price) {
      return { error: `You need $${result.price}.` };
    }
    state.money -= result.price;
    if (source === "phone") {
      state.deliveries.push({
        id,
        remaining: HD.CONFIG.phoneDeliveryDuration,
        duration: HD.CONFIG.phoneDeliveryDuration,
        complete: false,
        receiptRemaining: 4,
      });
    } else {
      state.inventory[id] = (state.inventory[id] || 0) + 1;
    }
    return result;
  }

  function update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return [];
    const arrived = [];
    const state = HD.state;
    for (const delivery of state.deliveries) {
      if (delivery.complete) {
        delivery.receiptRemaining -= dt;
        continue;
      }
      delivery.remaining = Math.max(0, delivery.remaining - dt);
      if (delivery.remaining > 0) continue;
      delivery.complete = true;
      delivery.receiptRemaining = 4;
      state.inventory[delivery.id] = (state.inventory[delivery.id] || 0) + 1;
      arrived.push(delivery.id);
    }
    state.deliveries = state.deliveries.filter(
      (delivery) => !delivery.complete || delivery.receiptRemaining > 0,
    );
    return arrived;
  }

  return {
    quote,
    purchase,
    update,
    phoneCatalog: () => [...PHONE_CATALOG],
  };
})();
