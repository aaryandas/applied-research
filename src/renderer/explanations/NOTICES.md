# Local explanation dependencies and original assets

AR-24, September 8, 2026. Runtime pins: `three` **0.185.1** and
`@react-three/fiber` **9.7.0**. Development types: `@types/three` **0.185.4**.
All three declare MIT. Official npm registry metadata was checked before installation;
Fiber supports React and React DOM `>=19 <19.3` and Three `>=0.156`.
The existing React/React DOM 19.2.8 satisfy these peers. Native/Expo peers are optional;
this implementation uses the web renderer. `npm ci` verifies the exact lockfile.

Orbit controls come from the maintained Three addon in the same pinned release:
`three/addons/controls/OrbitControls.js`. Its public rotate, dolly, reset and disposal
APIs meet this scope without Drei or another controls package. See the
[official OrbitControls documentation](https://threejs.org/docs/pages/OrbitControls.html).
Fiber is used for the Canvas lifecycle and demand rendering. Its chunk loads on explicit
scene launch. No additional frameworks, remote assets, custom shaders or dynamic
code execution are introduced.

The Beacon module and planar arm geometry are original Applied Research procedural
assets, authored for this implementation with AI assistance. They are distributed under
the application's GPL-3.0-only license. `original-geometry-1` identifies this first asset
revision. Neither scene copies a manufactured device, external CAD model, video, or
3Blue1Brown asset. The arm is ideal planar forward kinematics, not a physics engine.

Third-party license notices follow. Dependency packaging and the application's
consolidated release notices remain the coordinator's integration responsibility.

## Three.js, including OrbitControls

Copyright © 2010-2026 three.js authors

## React Three Fiber

Copyright (c) 2019-2025 Poimandres

Source: [license at v9.7.0](https://github.com/pmndrs/react-three-fiber/blob/v9.7.0/LICENSE).

## Three.js type definitions

Copyright (c) Microsoft Corporation.

## MIT license (applies to each dependency above)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
