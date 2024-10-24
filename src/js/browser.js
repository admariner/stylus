let browser;
if (process.env.MV3) {
  browser = window.browser = chrome;
} else if (process.env.BUILD === 'firefox') {
  browser = window.browser;
} else if (!(browser = window.browser) || !browser.runtime) {
  /* Auto-promisifier with a fallback to direct call on signature error.
     The fallback isn't used now since we call all synchronous methods via `chrome` */
  const directEvents = ['addListener', 'removeListener', 'hasListener', 'hasListeners'];
  // generated by tools/chrome-api-no-cb.js
  const directMethods = {
    alarms: ['create'],
    extension: ['getBackgroundPage', 'getExtensionTabs', 'getURL', 'getViews', 'setUpdateUrlData'],
    i18n: ['getMessage', 'getUILanguage'],
    identity: ['getRedirectURL'],
    runtime: ['connect', 'connectNative', 'getManifest', 'getURL', 'reload', 'restart'],
    tabs: ['connect'],
  };
  const promisify = function (fn, ...args) {
    let res;
    let resolve, reject;
    // Saving the local callstack before making an async call
    const localErr = new Error();
    try {
      args.push((...results) => {
        const {lastError} = chrome.runtime;
        if (lastError) {
          localErr.message = lastError.message;
          reject(localErr);
        } else {
          /* Some callbacks have 2 parameters so we're resolving as an array in that case.
             For example, chrome.runtime.requestUpdateCheck and chrome.webRequest.onAuthRequired */
          resolve(results.length <= 1 ? results[0] : results);
        }
      });
      fn.apply(this, args);
      res = new Promise((...rr) => ([resolve, reject] = rr));
    } catch (err) {
      if (!err.message.includes('No matching signature')) {
        throw err;
      }
      args.pop();
      res = fn.apply(this, args);
    }
    return res;
  };
  const proxify = (src, srcName, target, key) => {
    let res = src[key];
    if (res && typeof res === 'object') {
      res = createProxy(res, key); // eslint-disable-line no-use-before-define
    } else if (typeof res === 'function') {
      res = (srcName.startsWith('on') ? directEvents : directMethods[srcName] || []).includes(key)
        ? res.bind(src)
        : promisify.bind(src, res);
    }
    target[key] = res;
    return res;
  };
  const createProxy = (src, srcName) =>
    new Proxy({}, {
      get(target, key) {
        return target[key] || proxify(src, srcName, target, key);
      },
    });
  browser = window.browser = createProxy(chrome);
}

export default browser;
