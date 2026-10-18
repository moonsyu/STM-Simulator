# Third-party notices

STM Simulator is an independent educational project. It is not an official STMicroelectronics product and does not claim endorsement, sponsorship, or affiliation. STM32, NUCLEO, ST and other product names belong to their respective owners and identify the modeled hardware.

Reference photographs, supplied pin-map images, generated reference illustrations, and legacy screenshots are excluded from the repository and executable. See [copyright review](https://github.com/moonsyu/STM-Simulator/blob/main/docs/COPYRIGHT-REVIEW.md).

## Sketch interfaces added in 0.4.0

LiquidCrystal, Wire, SPI, and Arduino-style API names describe the compatible portions of the educational sketch interface. The parser, interpreter, LCD controller and communication models are independently implemented in this repository. Arduino library implementations and STM32 firmware are not linked or bundled. The supported subset and references are recorded in `docs/SKETCH-API.md`.

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

## Monaco Editor 0.57.0

Monaco Editor is used under the MIT license, copyright (c) 2016 - present Microsoft Corporation. The editor, language definitions, font and worker are bundled locally. The original license and third-party notices are retained in `src/generated/MONACO-LICENSE.txt` and `src/generated/MONACO-NOTICES.txt` inside the application and as `MONACO-LICENSE.txt` and `MONACO-NOTICES.txt` in the download bundle.

The editor's vendored DOMPurify module is replaced at bundle time by unmodified DOMPurify 3.4.17 from Cure53, under its Apache-2.0 OR MPL-2.0 license. Its original license is retained as `src/generated/DOMPURIFY-LICENSE.txt` and `DOMPURIFY-LICENSE.txt` in the download bundle. The original Monaco notices are preserved for attribution; the build checks that its older sanitizer is not bundled.

Source: [Monaco Editor](https://github.com/microsoft/monaco-editor).

## Build tooling

esbuild 0.28.2 is used at build time under the MIT license. Its original notice is retained in its npm package. The downloaded executable does not run esbuild.

electron-builder 26.15.3 is a build-time dependency under the MIT license, copyright (c) 2015 Loopline Systems. Its dependencies retain their respective licenses in their npm packages; `package-lock.json` pins the dependency graph. These build tools are not application JavaScript runtime dependencies. This notice does not replace the notices bundled with Electron or grant rights to ST materials.

Source: [electron-builder](https://github.com/electron-userland/electron-builder).

## Jellybeans colorscheme

The unmodified `colors/jellybeans.vim` from [nanotech/jellybeans.vim](https://github.com/nanotech/jellybeans.vim/tree/ef83bf4dc8b3eacffc97bf5c96ab2581b415c9fa), copyright (c) 2009-2019 NanoTech, is included in `src/themes/jellybeans/jellybeans.vim`. Its full MIT permission notice remains in the original source header. `source.json` records the pinned commit and SHA-256. The application build converts the upstream default GUI highlights into a registered Monaco theme using `scripts/build-colorschemes.mjs`. Workbench colors without an upstream equivalent are application additions. User-imported themes retain their own licensing terms.

## Optional external development tools

ARM GCC/GDB, MinGW-w64 GCC/GDB, clangd, OpenOCD and STM32CubeF4 are separate user-installed programs and SDKs, not bundled into the application EXE. The optional setup script downloads unmodified vendor distributions, verifies their checksums or Git revisions, and preserves their license files. Their individual licenses and device restrictions continue to apply. ST HAL/CMSIS source files are compiled from the configured external SDK; no ST driver source has been copied into the application repository. QEMU is used only by the optional ARM GDB integration test and is not shipped with the application.

## GitHub Light Default colorscheme

GitHub Theme 6.3.5, copyright (c) 2020 Primer, is used under the MIT license. The unmodified `themes/light-default.json` and complete MIT notice are retained in `src/themes/github-light/light-default.json` and `src/themes/github-light/LICENSE.txt` inside the application. `source.json` records the upstream release commit and SHA-256. The build converts supported C/C++ TextMate tokens to a registered Monaco theme; UI chrome is independent of the code palette. Source: [primer/github-vscode-theme](https://github.com/primer/github-vscode-theme/tree/ad3f17519f2f7d7060afffac2b557c69c4534610).
