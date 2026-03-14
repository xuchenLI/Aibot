# aibot_微信

这是一个独立的微信入口目录，基于当前 `wine-advisor` 项目的微信 H5 镜像方案整理而成。

它的目标是：

- 作为一个清晰、独立、可删除的微信入口目录存在
- 不改动现有主项目代码
- 方便推送到 Git 后让其他人快速理解和接手

## 内容说明

- `server.js`: 独立反向代理入口
- `.env.example`: 环境变量示例
- `package.json`: 最小运行配置
- `render.yaml`: Render 部署配置

## 本地运行

先启动主项目：

```powershell
cd D:\00_Programming\04_Aibot\wine-advisor
npm run dev
```

再启动本目录：

```powershell
cd D:\00_Programming\04_Aibot\aibot_微信
$env:WINE_ADVISOR_UPSTREAM_URL="http://127.0.0.1:3000"
node server.js
```

访问：

```text
http://127.0.0.1:3100
```

## 删除方式

如果以后不需要，直接删除整个目录：

```text
D:\00_Programming\04_Aibot\aibot_微信
```
