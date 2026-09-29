import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Creator Splash Screen - Verification Suite', async (t) => {
  const componentPath = path.resolve('src/components/CreatorSplashScreen.tsx');
  const indexCssPath = path.resolve('src/index.css');
  const appPath = path.resolve('src/App.tsx');

  await t.test('1. Component and Session Storage Key Invariants', () => {
    assert.ok(fs.existsSync(componentPath), 'CreatorSplashScreen.tsx must exist');
    const content = fs.readFileSync(componentPath, 'utf8');

    assert.ok(
      content.includes("talk_to_ritians_intro_seen"),
      'Must use talk_to_ritians_intro_seen as sessionStorage key'
    );
    assert.ok(
      content.includes('Talk to'),
      'Must display Talk to'
    );
    assert.ok(
      content.includes('RITians'),
      'Must display RITians'
    );
    assert.ok(
      content.includes('Created by'),
      'Must display Created by'
    );
    assert.ok(
      content.includes('HEISENBERG'),
      'Must display HEISENBERG'
    );
    assert.ok(
      content.includes('HeisenbergIcon'),
      'Must reuse HeisenbergIcon'
    );
  });

  await t.test('2. Timing and Accessibility Constraints', () => {
    const content = fs.readFileSync(componentPath, 'utf8');

    assert.ok(
      content.includes('prefers-reduced-motion'),
      'Must inspect prefers-reduced-motion media query'
    );
    assert.ok(
      content.includes('1850'),
      'Total animation intro duration must stay under 2 seconds (~1.85s unmount)'
    );
    assert.ok(
      content.includes('1000'),
      'Reduced motion must exit earlier (~1.0s unmount)'
    );
  });

  await t.test('3. CSS Animation Keyframes & Classes in index.css', () => {
    const cssContent = fs.readFileSync(indexCssPath, 'utf8');

    assert.ok(cssContent.includes('@keyframes splashFadeIn'), 'Must define splashFadeIn keyframes');
    assert.ok(cssContent.includes('@keyframes splashFadeOut'), 'Must define splashFadeOut keyframes');
    assert.ok(cssContent.includes('.splash-bg'), 'Must define .splash-bg class');
    assert.ok(cssContent.includes('.splash-title'), 'Must define .splash-title class');
    assert.ok(cssContent.includes('.splash-subtitle'), 'Must define .splash-subtitle class');
    assert.ok(cssContent.includes('.splash-creator'), 'Must define .splash-creator class');
    assert.ok(
      cssContent.includes('prefers-reduced-motion'),
      'index.css must provide reduced-motion fallback override'
    );
  });

  await t.test('4. App.tsx Integration & Non-Blocking Mount', () => {
    const appContent = fs.readFileSync(appPath, 'utf8');

    assert.ok(
      appContent.includes('CreatorSplashScreen'),
      'App.tsx must import and render CreatorSplashScreen'
    );
    assert.ok(
      appContent.indexOf('<CreatorSplashScreen />') < appContent.indexOf('<BrowserRouter>'),
      'CreatorSplashScreen must mount above routing to run in parallel with session restoration'
    );
  });
});
