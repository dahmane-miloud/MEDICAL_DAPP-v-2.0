@echo off
echo ========================================
echo 🚀 Starting Medical DAPP Environment
echo ========================================

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

echo Working directory: %CD%

REM ==========================================
REM 1. Start Hardhat Node
REM ==========================================
echo.
echo [1/5] Starting Hardhat Blockchain Node...

cd hardhat

REM Kill any existing process on port 8545
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8545" ^| find "LISTENING"') do (
    taskkill /F /PID %%a 2>nul
)

start "Hardhat Node" /MIN cmd /c "npx hardhat node"

timeout /t 5 /nobreak >nul

cd ..

REM ==========================================
REM 2. Deploy Contracts
REM ==========================================
echo.
echo [2/5] Deploying contracts...

cd hardhat
if exist "deployment.json" (
    echo ✅ Contracts already deployed
) else (
    echo Deploying contracts...
    call npx hardhat run scripts/deploy.js --network localhost
    if %errorlevel% equ 0 (
        echo ✅ Contracts deployed successfully
    ) else (
        echo ❌ Failed to deploy contracts
    )
)
cd ..

REM ==========================================
REM 3. Start IPFS
REM ==========================================
echo.
echo [3/5] Starting IPFS Daemon...

start "IPFS Daemon" /MIN cmd /c "ipfs daemon"

timeout /t 3 /nobreak >nul

REM ==========================================
REM 4. Start Python Crypto Server
REM ==========================================
echo.
echo [4/5] Starting Python Crypto Server...

if exist "crypto-server" (
    cd crypto-server
    start "Crypto Server" /MIN cmd /c "python server.py"
    cd ..
) else (
    echo ⚠️ crypto-server directory not found, skipping...
)

timeout /t 3 /nobreak >nul

REM ==========================================
REM 5. Start Electron App
REM ==========================================
echo.
echo [5/5] Starting Electron Application...

cd electron_app

echo.
echo ========================================
echo ✅ All services started!
echo    - Hardhat Node: http://localhost:8545
echo    - IPFS API:     http://localhost:5001
echo    - Crypto Proxy: http://localhost:5000
echo ========================================
echo.

echo Starting Electron app...
start "MediChain App" cmd /c "npm start"

cd ..

echo.
echo Services are running in separate windows.
echo Close them manually when done.
pause