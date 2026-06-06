@echo off
echo 正在安装项目依赖...
echo 提示：如果遇到网络超时，请重试或使用代理
echo.

npm install

if %errorlevel% equ 0 (
    echo.
    echo 依赖安装成功！
    echo.
    echo 运行项目：
    echo   npm run dev
    echo.
    echo 构建项目：
    echo   npm run build
) else (
    echo.
    echo 依赖安装失败，请重试
    echo 可以尝试：
    echo   1. 使用管理员权限运行
    echo   2. 配置npm镜像源
    echo   3. 重试安装
)
