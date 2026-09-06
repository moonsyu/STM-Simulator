# Third-party notices

STM Emulator is an independent educational project. It is not an official STMicroelectronics product and does not claim endorsement, sponsorship, or affiliation. STM32, NUCLEO, ST and other product names belong to their respective owners and identify the modeled hardware.

Reference photographs, supplied pin-map images, generated reference illustrations, and legacy screenshots are excluded from the repository and executable. See [copyright review](https://github.com/moonsyu/STM-Emulator/blob/main/docs/COPYRIGHT-REVIEW.md).

## Electron 44.2.0

Electron is used under the MIT license. The original Electron license is retained as `LICENSE.electron.txt` in the packaged runtime and download bundle. Electron's Chromium and other bundled components have their own notices, retained in the unmodified `LICENSES.chromium.html` file. The portable EXE includes these runtime files in its payload; the download bundle also exposes them for reading.

Source: [Electron v44.2.0](https://github.com/electron/electron/tree/v44.2.0).

```text
Copyright (c) Electron contributors
Copyright (c) 2013-2020 GitHub Inc.

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Build tooling

electron-builder 26.15.3 is a build-time dependency under the MIT license, copyright (c) 2015 Loopline Systems. Its dependencies retain their respective licenses in their npm packages; `package-lock.json` pins the dependency graph. These build tools are not application JavaScript runtime dependencies. This notice does not replace the notices bundled with Electron or grant rights to ST materials.

Source: [electron-builder](https://github.com/electron-userland/electron-builder).
