``` powershell
PS C:\WINDOWS\system32> winget install dorssel.usbipd-win
PS C:\WINDOWS\system32> usbipd --version
PS C:\WINDOWS\system32> usbipd list
    1-13   2e8a:000a  USB Serial Device (COM18), Reset (Interface 2)                Not shared
PS C:\WINDOWS\system32> usbipd bind --busid 1-13
PS C:\WINDOWS\system32> usbipd attach --wsl --busid 1-13

```