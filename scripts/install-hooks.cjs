/**
 * 文件职责：仅在明确启用时安装子模块自己的 Git 钩子，避免普通依赖安装改变父仓库钩子。
 *
 * 本文件没有需要逐项列出的文件级定义。
 */
// 仅显式启用时安装钩子，避免安装子模块依赖时修改父仓库钩子。
if (process.env.LISTEN1_INSTALL_HOOKS === '1') {
  import('husky').then(
    /**
     * 上一步异步操作完成后，执行 process.stdout.write。
     * @param options 解构参数，包含 install（Husky 提供的 Git 钩子安装函数）。
     * @returns {*} process.stdout.write 的调用结果。
     */
    ({ default: install }) => process.stdout.write(install() || '')
  );
}
