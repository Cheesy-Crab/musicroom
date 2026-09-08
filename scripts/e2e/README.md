# 端到端验证(双窗口同步播放)

前置:后端(:3000)、vite(:5173)、依赖容器已启动。

```bash
cd scripts/e2e
npm install --registry=https://registry.npmmirror.com
PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright npx playwright install chromium
npx playwright install-deps chromium   # 首次需要系统库
npm test
```

验证项:两窗口显示同一播放歌曲、进度各自推进且误差 <2.5s、房主 seek 后两窗口同时跟随、队列播放中徽标。
