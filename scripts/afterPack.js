exports.default = async function afterPack(context) {
  // Skip code signing for Windows
  if (context.electronPlatformName === 'win32') {
    // Skip any post-pack signing operations
  }
}
