// Resolve the theme before first paint so nobody sees the wrong one flash.
// Must match lib/ThemeProvider.tsx: the saved choice, else light.
;(function () {
  try {
    var saved = localStorage.getItem('dark-mode')
    var dark = saved === 'true'
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]').content = dark ? '#0f0f0f' : '#ffffff'
  } catch {
    document.documentElement.dataset.theme = 'light'
  }
})()
