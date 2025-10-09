const ngeohash = require("ngeohash");
const precision = 7; // ~150-200m

function encode(lat, lng) {
  return ngeohash.encode(lat, lng, precision);
}
function decode(hash) {
  return ngeohash.decode(hash);
}
module.exports = { encode, decode, precision };
