"use strict";

// The two active golden items have a separate rotating offer. Online
// settlement is gated until legendary purchases use server transactions.
HD.Legendary = (() => {
  const ids = ["goldenHotdog", "goldenCarrot"];

  function currentOffer() {
    const round = HD.state.round;
    if (!Number.isInteger(round) || round < 1) return null;
    const id = ids[(round - 1) % ids.length];
    const item = HD.CONFIG.items[id];
    const price = item?.price;
    if (!item?.legendary || !Number.isFinite(price) || price <= 0) return null;
    return { id, item, price };
  }

  function quote(id) {
    const offer = currentOffer();
    if (!offer || id !== offer.id) return { error: "That legendary item is not on offer today." };
    if (HD.Network?.isConnected?.()) {
      return { ...offer, error: "Legendary purchases are unavailable in online lobbies for now." };
    }
    if (HD.state.phase !== "roundBreak") {
      return { ...offer, error: "The legendary counter opens during the day break." };
    }
    if (HD.state.legendaryPurchasedRound === HD.state.round) {
      return { ...offer, error: "Today's legendary offer is sold out for you." };
    }
    if (!Number.isFinite(HD.state.money) || HD.state.money < offer.price) {
      return { ...offer, error: "You need $" + offer.price + "." };
    }
    return offer;
  }

  function purchase(id) {
    if (!HD.state.vendorOpen) {
      return { error: "Visit the concourse counter to buy a legendary item." };
    }
    const result = quote(id);
    if (result.error) return result;
    HD.state.money -= result.price;
    HD.state.inventory[id] = (HD.state.inventory[id] || 0) + 1;
    HD.state.legendaryPurchasedRound = HD.state.round;
    return result;
  }

  return { currentOffer, quote, purchase };
})();
