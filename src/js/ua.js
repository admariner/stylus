const uad = navigator.userAgentData;
const ua = uad || navigator.userAgent;
const brands = uad ? /*@__PURE__*/ uad.brands.map(_ => `${_.brand}/${_.version}`).join(' ') : ua;
const platform = uad ? uad.platform : ua;
const chromeVer = /*@__PURE__*/ +brands.match(/Chrom\w*\/(\d+)|$/)[1];
export const CHROME = chromeVer;
export const FIREFOX = chromeVer ? NaN : /*@__PURE__*/ +brands.match(/Firefox\w*\/(\d+)|$/)[1];
export const OPERA = /*@__PURE__*/ +brands.match(/(Opera|OPR)\w*\/(\d+)|$/)[1];
export const MAC = /*@__PURE__*/ /mac/i.test(platform);
export const MOBILE = uad ? uad.mobile : /*@__PURE__*/ /Android/.test(ua);
export const WINDOWS = /*@__PURE__*/ /Windows/.test(platform);
export const VIVALDI = /*@__PURE__*/ +brands.match(/Vivaldi\w*\/(\d+)|$/)[1];