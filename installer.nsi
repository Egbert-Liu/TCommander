!include "MUI2.nsh"

!define APP_NAME "TCommander"
!define APP_VERSION "0.4.0"
!define APP_PUBLISHER "TCommander"
!define APP_DIR "TCommander"
!define EXE_NAME "TCommander.exe"

Name "${APP_NAME}"
OutFile "TCommander-v${APP_VERSION}-Setup.exe"
InstallDir "$PROGRAMFILES\${APP_DIR}"
InstallDirRegKey HKLM "Software\${APP_NAME}" "InstallDir"
ShowInstDetails show
ShowUninstDetails show

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "SimpChinese"

Section "${APP_NAME}" SEC01
  SetOutPath "$INSTDIR"
  File /r "release_v5\win-unpacked\*"
  
  CreateShortCut "$SMPROGRAMS\${APP_NAME}.lnk" "$INSTDIR\${EXE_NAME}"
  CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${EXE_NAME}"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\${APP_NAME}.lnk"
  Delete "$DESKTOP\${APP_NAME}.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey /ifempty HKLM "Software\${APP_NAME}"
SectionEnd
