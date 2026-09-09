/**
 * Inserts a rack tile at toIndex, shifting other tiles (splice insert).
 */
function moveRackSlots(rack, fromIndex, toIndex, rackSize) {
  const size = rackSize ?? rack.length;
  while (rack.length < size) {
    rack.push(null);
  }
  if (rack.length > size) {
    rack.length = size;
  }
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    fromIndex >= size ||
    toIndex < 0 ||
    toIndex >= size ||
    !rack[fromIndex]
  ) {
    return false;
  }

  const [item] = rack.splice(fromIndex, 1);
  rack.splice(toIndex, 0, item);
  while (rack.length < size) {
    rack.push(null);
  }
  if (rack.length > size) {
    rack.length = size;
  }
  return true;
}

/** After moveRackSlots, remap stored rack indices (e.g. pending placements). */
function remapRackIndicesAfterMove(entries, fromIndex, toIndex, rackSize) {
  if (!Array.isArray(entries) || entries.length === 0 || fromIndex === toIndex) {
    return;
  }
  const size = rackSize ?? 0;
  if (size <= 0) {
    return;
  }
  const order = Array.from({ length: size }, (_, index) => index);
  const [moved] = order.splice(fromIndex, 1);
  order.splice(toIndex, 0, moved);
  const newPosOf = new Array(size);
  order.forEach((oldIndex, newPos) => {
    newPosOf[oldIndex] = newPos;
  });
  entries.forEach((entry) => {
    if (
      entry &&
      Number.isInteger(entry.rackIndex) &&
      entry.rackIndex >= 0 &&
      entry.rackIndex < size
    ) {
      entry.rackIndex = newPosOf[entry.rackIndex];
    }
  });
}

module.exports = { moveRackSlots, remapRackIndicesAfterMove };
