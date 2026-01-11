@echo off
REM Quick start script for testing evaluations restructuring (Windows)

echo ==================================
echo ThoughtGuards Evaluations Quick Start
echo ==================================
echo.

REM Check Python version
echo 1. Checking Python version...
python --version
if %errorlevel% neq 0 (
    echo Error: Python not found
    exit /b 1
)

REM Check if we're in the right directory
if not exist "requirements.txt" (
    echo Error: Please run this script from the evaluations\ directory
    exit /b 1
)

REM Install dependencies
echo.
echo 2. Installing dependencies...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo Error: Failed to install dependencies
    exit /b 1
)

REM Check environment variables
echo.
echo 3. Checking environment variables...

if "%ANTHROPIC_API_KEY%"=="" (
    echo Warning: ANTHROPIC_API_KEY not set
    echo    Set it with: set ANTHROPIC_API_KEY=your_key
) else (
    echo OK: ANTHROPIC_API_KEY is set
)

if "%LITELLM_API_KEY%"=="" (
    echo Warning: LITELLM_API_KEY not set
    echo    Set it with: set LITELLM_API_KEY=your_key
) else (
    echo OK: LITELLM_API_KEY is set
)

REM List available judges
echo.
echo 4. Available judges:
python -m evaluations.cli --list-judges

REM Run a quick test
echo.
echo 5. Running quick test (single file)...
echo    Finding test file...

REM Find a test file
set TEST_FILE=
for /r "..\mock_data" %%f in (clean_*.json) do (
    set TEST_FILE=%%f
    goto :found
)
for /r "..\mock_data" %%f in (conv_*.json) do (
    set TEST_FILE=%%f
    goto :found
)
for /r "..\mock_data" %%f in (adv_*.json) do (
    set TEST_FILE=%%f
    goto :found
)

:found
if "%TEST_FILE%"=="" (
    echo    No test files found in ..\mock_data
    echo    Skipping test run
) else (
    echo    Using: %TEST_FILE%
    echo.
    python -m evaluations.cli -s "%TEST_FILE%"
    echo.
    echo OK: Quick test completed!
)

REM Show next steps
echo.
echo ==================================
echo Setup Complete!
echo ==================================
echo.
echo Next steps:
echo.
echo - Run full test suite:
echo   python run_tests.py
echo.
echo - Process a batch of files:
echo   python -m evaluations.cli -i "..\mock_data\*\adv_*.json" -n 5
echo.
echo - See all options:
echo   python -m evaluations.cli --help
echo.
echo - Read testing guide:
echo   type TESTING.md
echo.

pause