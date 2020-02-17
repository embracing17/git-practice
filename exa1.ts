function is(x, y) {
  if (x === y) {
    //+0与-0
    return x !== 0 || y !== 0 || 1 / x === 1 / y;
  } else {
    //NaN与NaN
    return x !== x && y !== y;
  }
}
var a = 2,b,c
/* */
