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

module.exports = { moveRackSlots };
