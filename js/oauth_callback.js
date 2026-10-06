/**
 * 文件职责：从授权回调页查询参数中读取 GitHub 授权码，转发给浏览器扩展后台处理。
 *
 * 本文件没有需要逐项列出的文件级定义。
 */
/**
 * 从查询参数读取授权码并发送给扩展后台。
*/

chrome.runtime.sendMessage(
  {
    type: 'code',
    code: new URLSearchParams(window.location.search).get('code'),
  },
  /**
   * 保留的空回调，此处无需继续处理或改变状态。
   * @param response 异步请求返回的响应对象；当前函数体未使用，保留调用签名。
   * @returns {void} 无返回值。
   */
  // eslint-disable-next-line no-unused-vars
  (response) => {
    // 停用代码，保留供历史对照：
    // window.open('', '_self', '');
    // window.close();
  }
);
